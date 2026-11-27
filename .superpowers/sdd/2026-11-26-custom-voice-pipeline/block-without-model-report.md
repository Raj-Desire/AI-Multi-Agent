# Block calls for Economy organisations without their own language model: report

Owner rule: Economy (`voice_engine == "custom"`) with no org language-model settings (endpoint, key or deployment) must not make or take calls. No fallback to Standard.

## Helper (backend/app/voice_stack/client_factory.py)
- `economy_blocked_reason(profile) -> Optional[str]`: `"model_setup_incomplete"` when plan is custom and any of llm endpoint/key/deployment is missing or empty; None otherwise (managed never blocked).
- `org_economy_blocked_reason(org_id)` (resolves the profile; missing voice keys count as "not blocked" here because other paths already refuse those) and `ensure_org_may_place_calls(org_id)` (raises HTTP 409, message `BLOCKED_MESSAGE` = "Voice plan setup incomplete for this organization. Ask your administrator to finish the model setup.").
- Constants `MODEL_SETUP_INCOMPLETE`, `BLOCKED_MESSAGE`, `BLOCKED_OUTCOME = "BLOCKED_MODEL_SETUP"`. No vendor names.
- Still fallbacks (unchanged, tested): Economy with a non-Cartesia agent voice -> Standard (select_voice_engine); Python < 3.11 -> Standard with the warning; build_voice_client's own "unavailable" fallback is untouched.

## Initiation paths found and how each is guarded
| Path | Guard |
|---|---|
| `POST /voice/test-call` (AI agent dialer single call, api/v1/voice.py) | `ensure_org_may_place_calls` right after the credit check, before DNC/telephony/session/greeting prewarm/`place_call`. 409 + message. |
| `POST /calls` and everything using `CallService.make_call` (services/call_service.py) | Same guard as the first statement of `make_call`, before credits, greeting prewarm, `place_call`, Call record. 409. |
| Campaign dialer loop (`CampaignDialerEngine.process_campaign`, services/campaign_dialer.py; used by the background tick and by dial-now) | New step 2.6 right after the credit check, same pattern: campaign set to PAUSED, a `PAUSED` campaign event logged with the neutral message, return without dispatching. Members are never touched, so no contact is attempted or burnt (the existing "missing telephony" HTTPException path marks the member failed, which would burn contacts, so the credit-exhausted auto-pause pattern was followed instead). |
| `POST /campaigns/{id}/start`, `/resume`, `/dial-now` (api/v1/campaigns.py) | `ensure_org_may_place_calls` next to the existing credit checks: 409 shown in the UI instead of a silent auto-pause. |
| Inbound Twilio AI answer (`CallService.build_twiml_response`, AI branch only) | Before the Connect/Stream TwiML: `<Hangup/>` only, no `<Say>`, no stream. Forwarding to a human and browser softphone calls are not AI and are untouched. |
| Inbound Plivo answer (`api/v1/plivo.py voice_answer`, inbound AI branch) | Before the call record and stream XML: `<Hangup/>` only, no `<Speak>`. (Plivo outbound answer is reached only through a dial that is already guarded.) |
| Preview in the browser (`api/v1/voice.py` preview stream) | Unchanged by design: it is Standard. |

## Safety net (voice/gateway.py)
After the profile is resolved and before any greeting audio, settings builder or `build_voice_client`: if `economy_blocked_reason(profile)` then log a neutral warning, set `session.outcome = "BLOCKED_MODEL_SETUP"` (plus last_error/error_type), cancel the two background load tasks, close the socket and leave the loop; the existing teardown hangs up the call through the provider and `finalize_session` records the outcome. No client is built, the pre-rendered greeting is never looked up or played.

## Frontend
No code change needed: `fetchApi` already throws the API `detail`, which the AI agent dialer shows as "Failed to initiate AI call: <message>" and the campaign view shows as a toast on start, resume and dial-now. Added `frontend/src/__tests__/telephony/AIAgentDialerBlocked.test.tsx` (dialer shows the neutral message, no vendor names). It passes without a UI change, so it is a regression test for the existing display, not a RED test.

## Tests
`backend/tests/test_block_without_model.py` (20): helper table (each missing field, empty strings, nothing, complete, managed), neutral message, non-Cartesia and Python fallbacks unchanged, complete Economy still builds the Economy client, `make_call` refuses with zero `place_call` and no record (and Standard / complete Economy still dial), test-call refuses with zero dials (Standard still dials), campaign pause with zero dials and member still QUEUED, start/resume/dial-now 409, Twilio and Plivo inbound hang-up without speech or stream, gateway safety net (no client, no greeting lookup, provider `end_call`, outcome BLOCKED_MODEL_SETUP). No existing tests needed changes.
RED: `block-without-model-red.txt` (collection ImportError for the new names).
Covering run with `-W error` (plus an ignore for the pre-existing Starlette TestClient httpx deprecation, as in earlier reports): 20 passed.
A gateway test detail worth knowing: the safety net explicitly closes the websocket; without it the stream handler returned without a close frame.

## Full runs
Backend full suite (campaign lifecycle test deselected once, it passed alone: 3 passed in test_campaign_service.py): 1166 passed, 6 skipped. Vitest 86 passed, 1 failed (noHardcodedColors, known); `npx tsc --noEmit` clean.
