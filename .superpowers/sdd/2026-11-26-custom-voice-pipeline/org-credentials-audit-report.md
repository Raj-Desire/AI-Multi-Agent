# Organisation credentials: import of language model, headings, isolation audit

Status: DONE_WITH_CONCERNS (see Concerns). Branch voice-agent-change.

## Part 1: Import from superadmin now includes the language model
- The "platform root organisation" is the literal organisation id `org_platform_root` (constant `PLATFORM_ROOT_ORG_ID` in `voice_stack/resolver.py`; the same id is protected in `superadmin.py:204/220`). Note the existing import of the two voice keys copies the platform ENVIRONMENT keys (`platform_keys()`), not a stored document. The language model is copied from the root organisation's stored `llm` slot (there is no environment path for it).
- `VoiceCredentialsService.import_platform` copies endpoint, deployment, api_version and the key (decrypted and re-encrypted server-side into the target org's own document, key hint recomputed). Status of the copy is `unverified`. The root document is untouched; later root edits do not reach the org. Nothing secret is in the response.
- Response gains `import_report: {imported: ["engine_key","tts_key","llm"], llm_message}`. Root has no (complete) language model: `llm_message` = "The language model is not configured for the platform; nothing was imported for it.", keys still import, HTTP 200. Importing into the root org itself never touches its language model.
- Overwrite guard: if the root has a language model and the target already has its own, 409 (existing confirm pattern, `?overwrite=true` replaces). Superadmin-only (unchanged dependency).
- UI: still one button, "Import from superadmin", with a one-line description; after import an info alert lists what was imported and the neutral message; overwrite dialog text now "...own keys and language model settings", button "Replace and import".

## Part 2: Headings
Each section (`h4`, same style) with a one-line description and a status chip (Not set / Saved / Verified / Invalid; "Invalid" kept because the tab already had an invalid status). Visible names already present on this superadmin tab (Aura, Cartesia) kept; no new vendor word, "Deepgram" never shown (test).
- "Voice agent (listening and conversation engine)": key for the engine that listens to callers; on Standard also runs the conversation.
- "Voice (speech) key: Cartesia"
- "Language model (Economy plan)"
The create-organisation form (`OrgVoiceEngineFields`) was not part of this tab and is unchanged. The tab holds no telephony sections.

## Part 3: Audit (listening key `engine_key`, speaking voice key `tts_key`, language model)
Platform credential_mode: `credential_mode == "platform"` (superadmin sets it per org) makes the resolver return the PLATFORM ENVIRONMENT keys (`DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`), billed to the platform, with the org's own stored language model values if present. Orgs with NO credentials document (legacy orgs created before the credentials feature) get the same platform profile. New orgs are always created `own` (`superadmin.py` create path), so they never use it. Which orgs are in platform mode is data in the voice-credentials container, not code; list via the superadmin list endpoint (`credential_mode`). Economy never uses the environment for the language model in any mode.

| # | Where (file:line before the fixes) | What it reads | Intended? | Action |
|---|---|---|---|---|
| 1 | `voice_stack/resolver.py:42-47` `platform_keys()` | env DEEPGRAM_API_KEY / CARTESIA_API_KEY | Yes: only used by "Import from superadmin" and org creation import (copies env key into the org, which then owns it) | none |
| 2 | `voice_stack/resolver.py:60-71` `_platform_profile()` | env engine and tts keys | Yes by design: legacy orgs without a document, org id None, and `credential_mode == "platform"` orgs; billed_to "platform". No LLM from env | none (documented; see Concerns) |
| 3 | `voice_stack/resolver.py:76-83` | own doc; platform mode passes only the org's OWN llm fields | Yes | none |
| 4 | `voice_stack/resolver.py:85-100` own mode | org's own decrypted keys only; missing or invalid engine key raises VoiceCredentialsMissing, no fallback | Yes | proven by tests |
| 5 | `providers/deepgram/voice_agent.py:57` `os.getenv("DEEPGRAM_API_KEY")` when api_key empty | env key | NO: latent silent fallback in the Standard client constructor (the factory refuses empty keys, but any other caller would silently use the platform key) | FIXED: no env fallback, empty stays empty (test) |
| 6 | `voice_stack/client_factory.py:33-51` | profile values only; Economy needs profile llm endpoint+key+deployment; else Standard (warning) | Yes | none |
| 7 | `providers/pipeline/client.py:266-296` | STT key = profile.engine_key, TTS key = profile.tts_key, LLM = profile llm_*; no env | Yes | proven by tests |
| 8 | `providers/pipeline/client.py:126,128` | env PIPELINE_TOOL_HOLD_LINE / PRERUN_DATE | Yes, behaviour flags, not credentials | none |
| 9 | `voice_stack/registry.py:75-100` Standard speak provider | org's own tts_key header only when own+cartesia; platform mode uses the vendor-managed voice, no key | Yes | proven by test |
| 10 | `voice/gateway.py:1180,1328-1331` (phone and campaign calls share this path) | `resolve_voice_profile(org_id)` of the call's org, passed on as `profile=`; engine from `select_voice_engine(profile, agent)` | Yes | source-level test pins it |
| 11 | `voice/greeting_cache.py:147`, `api/v1/voice.py:999,1168,1213,1273,1392` | `resolve_voice_profile(<request/call org>)` keys | Yes (own org; platform profile only under rows 2) | none |
| 12 | `api/v1/voice.py:515,831` browser preview | `build_voice_client(<token org>)`; org taken from the verified token, only a superadmin may name another | Yes | existing tests |
| 13 | `api/v1/voice.py:677-679` preview | `target_org_id in (None, "default")` fell back to `org_platform_root` for ANY role | NO (a non-superadmin with org id "default" would get the root org's credentials) | FIXED: only a superadmin falls back to the root org (test) |
| 14 | `voice_stack/llm_env.py:8` `resolve_llm_key` | env AZURE key | Unused by calls since the previous change (gate no longer calls it) | left; dead code, own test |
| 15 | `api/v1/think_proxy.py:437-445` | env Azure endpoint/key/deployment (or OPENAI_API_KEY) | Platform-level by design: the think proxy serves the STANDARD plan's language model (and multi-language/orchestrated agents). It is NOT an org key | none, see Concerns |
| 16 | `services/call_analytics_service.py`, `llm_generator_service.py`, `vector_embedding_service.py` | env Azure | Platform features, not call voice paths | none |
| 17 | `api/v1/superadmin.py:563` | env DEEPGRAM key for platform telemetry | Platform dashboard | none |
| 18 | Campaigns/dialer | no credential reads; they place calls that arrive in `voice/gateway.py` (row 10) | Yes | none |
| 19 | `voice_credentials_repository.py:8-9` cache | keyed by org_id, 60 s TTL | Yes (no cross-org sharing) | none |

Tests added: `tests/test_org_credentials_audit.py` (14): two orgs with distinct keys and a differing environment, Standard and Economy, each client built per org; asserts engine key, voice key, language model key/endpoint/deployment/api version equal that org's and that no other org's value or env value appears anywhere in the built objects; Economy without own LLM runs Standard (never other org or env); Economy without own voice key refuses; no key material in log output of building clients (DEBUG); gateway wiring; import tests. Plus one preview test in `tests/test_preview_stream_auth.py`. Frontend `VoiceCredentialsHeadings.test.tsx` (6) and updated `VoiceCredentialsTab.test.tsx` / `VoiceCredentialsLlm.test.tsx`.

## Evidence
- RED: `org-credentials-audit-red.txt` (5 backend failures: import x4 plus env fallback in the client; then preview fallback failing before its fix).
- Covering set with `-W error`: audit, credentials service, profiles API, key isolation, org creation, custom pipeline gate: 108 passed. (The two preview test files use Starlette TestClient, which emits a deprecation warning under `-W error` at collection; that is pre-existing, they pass without it: 9 passed.)
- Full backend: 1146 passed, 6 skipped, 1 failed (`test_campaign_service::test_campaign_lifecycle_state_transitions`, the known flaky one).
- Vitest: 85 passed, 1 failed (noHardcodedColors, known). `npx tsc --noEmit` clean.

## Concerns
1. Standard plan language model is platform-level (think proxy, env Azure) and cannot be per-org with today's design; the Language model section is Economy only. If the owner wants Standard LLM isolated per org, the think proxy must resolve the call's org settings (separate change).
2. Legacy orgs with no credentials document and orgs set to credential_mode "platform" still run on the platform environment voice keys by design. To be strictly "own keys only", the superadmin should set those orgs to Own and import/enter keys.
3. The existing import of the two voice keys copies the environment keys (not the root org's stored keys); only the language model comes from the root org's stored document, as requested.
