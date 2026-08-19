import asyncio
from datetime import datetime, timezone
import uuid
import xml.sax.saxutils as saxutils
from typing import List, Dict, Any, Optional
from fastapi import HTTPException
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.twiml.voice_response import VoiceResponse, Dial, Connect, Stream

from app.core.dependencies import TenantContext
from app.core.security import decrypt_token
from app.models.call import Call
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.call_repository import CallRepository
from app.repositories.agent_repository import AgentRepository
from app.agents.configuration import AgentConfiguration

def normalize_phone_number(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = str(value).strip()
    if cleaned.startswith("+"):
        return "+" + "".join(c for c in cleaned[1:] if c.isdigit())
    digits = "".join(c for c in cleaned if c.isdigit())
    return f"+{digits}" if digits else None

class CallService:
    def __init__(
        self,
        twilio_repo: TwilioRepository,
        call_repo: CallRepository,
        agent_repo: Optional[AgentRepository] = None
    ):
        self.twilio_repo = twilio_repo
        self.call_repo = call_repo
        self.agent_repo = agent_repo or AgentRepository()

    async def make_call(
        self,
        ctx: TenantContext,
        to_number: str,
        from_number: Optional[str] = None,
        prompt: Optional[str] = None,
        agent_id: Optional[str] = None
    ) -> Call:
        tw_cfg = await self.twilio_repo.get_by_org(ctx.organization_id)
        if not tw_cfg:
            raise HTTPException(
                status_code=400,
                detail="Twilio is not configured for this organization. Please configure your Account SID and Auth Token first."
            )

        auth_token = decrypt_token(tw_cfg.encrypted_auth_token)

        # Parse available phone numbers
        available_numbers = [n.strip() for n in tw_cfg.phone_number.split(",") if n.strip()]
        if not available_numbers:
            raise HTTPException(status_code=400, detail="No valid Twilio phone numbers configured.")

        selected_from = (from_number or available_numbers[0]).strip()

        # Resolve selected AI Agent or fallback to primary/default
        resolved_agent_id = agent_id or tw_cfg.default_agent_id or "agt_receptionist_default"
        agent_config = await self.agent_repo.get_by_id(ctx.organization_id, resolved_agent_id)
        if not agent_config:
            agent_config = await self.agent_repo.get_by_id("global", "agt_receptionist_default")

        agent_snapshot = agent_config.model_dump(mode="json") if agent_config else None
        agent_name = agent_config.name if agent_config else "Desire AI Receptionist"
        agent_version = agent_config.version if agent_config else 1
        agent_scope = agent_config.scope if agent_config else "ORGANIZATION"

        # Build dynamic speech / message
        speech_text = prompt.strip() if prompt and prompt.strip() else (agent_config.greeting if agent_config else "Hello! Thank you for connecting with Desire AI Platform. How can I assist you today?")
        safe_speech = saxutils.escape(speech_text)
        twiml_body = f"<Response><Say voice='Google.en-US-Neural2-F'>{safe_speech}</Say><Pause length='5'/></Response>"

        try:
            def _sync_twilio_call():
                client = Client(tw_cfg.account_sid, auth_token)
                return client.calls.create(
                    to=to_number,
                    from_=selected_from,
                    twiml=twiml_body
                )

            tw_call = await asyncio.to_thread(_sync_twilio_call)
            real_call_sid = tw_call.sid
            status = tw_call.status or "initiated"
            duration = int(tw_call.duration) if tw_call.duration and str(tw_call.duration).isdigit() else 0
        except TwilioRestException as tre:
            raise HTTPException(status_code=400, detail=f"Twilio API Error: {tre.msg} (Code: {tre.code})")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Twilio call failed: {str(e)}")

        call = Call(
            id=f"cal_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            twilio_configuration_id=tw_cfg.id,
            call_sid=real_call_sid,
            from_number=selected_from,
            to_number=to_number,
            duration=duration,
            prompt=prompt.strip() if prompt else (agent_config.greeting if agent_config else None),
            status=status,
            agent_id=resolved_agent_id,
            agent_version=agent_version,
            agent_name=agent_name,
            agent_scope=agent_scope,
            agent_config_snapshot=agent_snapshot,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        return await self.call_repo.save(call)

    async def generate_voice_token(self, ctx: TenantContext, req_base_url: str = "") -> Dict[str, Any]:
        tw_cfg = await self.twilio_repo.get_by_org(ctx.organization_id)
        if not tw_cfg:
            raise HTTPException(status_code=400, detail="Twilio is not configured. Please configure your Account SID and Auth Token in settings.")
        
        auth_token = decrypt_token(tw_cfg.encrypted_auth_token)
        api_key_secret = decrypt_token(tw_cfg.encrypted_api_key_secret) if tw_cfg.encrypted_api_key_secret else None

        if not tw_cfg.twiml_app_sid:
            raise HTTPException(status_code=400, detail="TwiML App SID is missing. Please add it in Twilio Settings.")
        if not tw_cfg.api_key_sid or not api_key_secret:
            raise HTTPException(status_code=400, detail="Twilio API Key SID & Secret are required for WebRTC browser calling. Add them in Twilio Settings.")

        # Check and auto-sync TwiML App URL if public base url is available (Env var takes priority over DB)
        effective_base_url = (os.getenv("PUBLIC_BASE_URL") or tw_cfg.public_base_url or req_base_url or "").strip().rstrip("/")
        if effective_base_url and not ("localhost" in effective_base_url or "127.0.0.1" in effective_base_url):
            expected_url = f"{effective_base_url}/api/v1/twilio/voice/twiml"
            try:
                def _sync_url():
                    client = Client(tw_cfg.account_sid, auth_token)
                    app = client.applications(tw_cfg.twiml_app_sid).fetch()
                    if not app.voice_url or "/api/v1/twilio/voice/twiml" not in app.voice_url:
                        client.applications(tw_cfg.twiml_app_sid).update(
                            voice_url=expected_url,
                            voice_method="POST",
                            voice_fallback_url=expected_voice_url,
                            voice_fallback_method="POST"
                        )
                await asyncio.to_thread(_sync_url)
            except Exception as e:
                print(f"[CallService Warning] Could not auto-sync TwiML App URL: {e}")

        identity = f"caller_{ctx.user_id}"
        
        access_token = AccessToken(
            account_sid=tw_cfg.account_sid,
            signing_key_sid=tw_cfg.api_key_sid,
            secret=api_key_secret,
            identity=identity,
            ttl=3600
        )
        
        voice_grant = VoiceGrant(
            outgoing_application_sid=tw_cfg.twiml_app_sid,
            outgoing_application_params={"userId": ctx.user_id},
            incoming_allow=False
        )
        access_token.add_grant(voice_grant)
        
        first_number = tw_cfg.phone_number.split(",")[0].strip() if tw_cfg.phone_number else ""

        return {
            "token": access_token.to_jwt(),
            "identity": identity,
            "from_number": first_number,
            "caller_number": first_number
        }

    async def build_twiml_response(
        self,
        to: Optional[str],
        caller_id_override: Optional[str] = None,
        user_id: Optional[str] = None,
        from_caller: Optional[str] = None,
        called_number: Optional[str] = None,
        call_sid: Optional[str] = None,
        agent_id: Optional[str] = None
    ) -> str:
        response = VoiceResponse()

        # Resolve organization_id and user_id
        org_id = "default"
        resolved_user_id = user_id or "system"
        if user_id and user_id != "default":
            from app.repositories.user_repository import UserRepository
            user = await UserRepository.get_by_id(user_id)
            if user:
                org_id = user.get("organization_id") or user_id
                resolved_user_id = user["id"]
            else:
                org_id = user_id

        tw_cfg = await self.twilio_repo.get_by_org(org_id)
        
        # If not found by user's org, try resolving via caller_id_override or from_caller or called_number
        if not tw_cfg:
            for num in [caller_id_override, from_caller, called_number, to]:
                if num:
                    tw_cfg = await self.twilio_repo.get_by_phone_number(num)
                    if tw_cfg:
                        org_id = tw_cfg.organization_id
                        break
        
        # Fallback to the first available Twilio config if only one exists in system
        if not tw_cfg:
            all_configs = await self.twilio_repo.list_all()
            if all_configs:
                tw_cfg = all_configs[0]
                org_id = tw_cfg.organization_id

        # Determine if this is an Inbound call from an external phone or an Outbound call from WebRTC browser
        is_inbound = False
        target_twilio_number = called_number or to
        
        if user_id:
            is_inbound = False
        elif tw_cfg and tw_cfg.phone_number:
            configured_numbers = [n.strip() for n in tw_cfg.phone_number.split(",") if n.strip()]
            if target_twilio_number and any(target_twilio_number.replace("+", "") == n.replace("+", "") for n in configured_numbers):
                is_inbound = True

        # Resolve target Agent for the call
        selected_agent_id = agent_id
        if is_inbound and tw_cfg:
            # Check per-number agent assignment
            if tw_cfg.inbound_agent_mapping and target_twilio_number:
                for num_key, mapped_agent_id in tw_cfg.inbound_agent_mapping.items():
                    if num_key and target_twilio_number.replace("+", "") == num_key.replace("+", ""):
                        selected_agent_id = mapped_agent_id
                        break
            if not selected_agent_id:
                selected_agent_id = getattr(tw_cfg, "default_agent_id", None) or "agt_receptionist_default"
        elif not selected_agent_id:
            selected_agent_id = getattr(tw_cfg, "default_agent_id", None) or "agt_receptionist_default"

        # Resolve Agent Config & Snapshot
        agent_config = await self.agent_repo.get_by_id(org_id, selected_agent_id)
        if not agent_config:
            agent_config = await self.agent_repo.get_by_id("global", "agt_receptionist_default")

        agent_snapshot = agent_config.model_dump(mode="json") if agent_config else None
        agent_name = agent_config.name if agent_config else "Desire AI Receptionist"
        agent_version = agent_config.version if agent_config else 1
        agent_scope = agent_config.scope if agent_config else "ORGANIZATION"

        # Register the call history log dynamically if call_sid is present
        if call_sid:
            existing = await self.call_repo.get_by_call_sid(call_sid)
            if not existing:
                cfg_first_num = tw_cfg.phone_number.split(",")[0].strip() if (tw_cfg and tw_cfg.phone_number) else ""
                selected_from = caller_id_override or from_caller or cfg_first_num or "WebRTC Softphone"
                selected_to = to or called_number or ""
                effective_org = tw_cfg.organization_id if tw_cfg else org_id
                cfg_id = tw_cfg.id if tw_cfg else ""

                # If this is a direct WebRTC browser call (not inbound AI and not explicitly assigned an agent), mark as simple direct call
                record_agent_id = selected_agent_id if is_inbound else None
                record_agent_name = agent_name if is_inbound else None
                record_agent_version = agent_version if is_inbound else None
                record_agent_scope = agent_scope if is_inbound else None
                record_agent_snapshot = agent_snapshot if is_inbound else None

                new_call = Call(
                    id=f"cal_{uuid.uuid4().hex[:12]}",
                    organization_id=effective_org,
                    user_id=resolved_user_id,
                    twilio_configuration_id=cfg_id,
                    call_sid=call_sid,
                    from_number=selected_from,
                    to_number=selected_to,
                    duration=0,
                    prompt="Direct WebRTC Call" if not is_inbound else f"Agent: {agent_name} (v{agent_version})",
                    status="in-progress",
                    agent_id=record_agent_id,
                    agent_version=record_agent_version,
                    agent_name=record_agent_name,
                    agent_scope=record_agent_scope,
                    agent_config_snapshot=record_agent_snapshot,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                await self.call_repo.save(new_call)

        if is_inbound and tw_cfg:
            # Determine Inbound Forward Destination
            forward_mode = getattr(tw_cfg, "inbound_forward_mode", "global") or "global"
            forward_global = getattr(tw_cfg, "inbound_forward_global_number", None)
            forward_mapping = getattr(tw_cfg, "inbound_forward_mapping", {}) or {}

            target_forward_number = None

            if forward_mode == "per_number":
                # Look up matching number in the per-number mapping table
                for tw_num, fwd_num in forward_mapping.items():
                    if tw_num and target_twilio_number and (tw_num.replace("+", "") == target_twilio_number.replace("+", "")):
                        target_forward_number = fwd_num
                        break
                if not target_forward_number:
                    target_forward_number = forward_global
            if forward_mode == "disabled":
                response.say("Thank you for calling. Inbound calling is currently disabled.")
                response.hangup()
                return str(response)

            if target_forward_number and forward_mode != "ai_agent":
                fwd_destination = normalize_phone_number(target_forward_number)
                fwd_caller_id = normalize_phone_number(from_caller) or normalize_phone_number(target_twilio_number)
                print(f"[Twilio Inbound] Forwarding call from {from_caller} on {target_twilio_number} -> {fwd_destination}")
                
                dial = Dial(caller_id=fwd_caller_id, answer_on_bridge=True, timeout=30)
                dial.number(fwd_destination)
                response.append(dial)
                return str(response)

            # Inbound Real-Time AI Agent Answering (Env var takes priority over DB)
            base_url = (os.getenv("PUBLIC_BASE_URL") or getattr(tw_cfg, "public_base_url", None) or "").strip().rstrip("/")
            ws_base = base_url.replace("http://", "ws://").replace("https://", "wss://") if base_url else "wss://localhost:8000"
            stream_url = f"{ws_base}/api/v1/voice/stream"
            print(f"[Twilio Inbound AI] Connecting inbound caller {from_caller} to AI Voice Stream ({agent_name}): {stream_url}")

            connect = Connect()
            stream = Stream(url=stream_url)
            stream.parameter(name="organization_id", value=tw_cfg.organization_id)
            stream.parameter(name="agent_id", value=selected_agent_id)
            stream.parameter(name="direction", value="inbound")
            stream.parameter(name="from", value=from_caller or "")
            stream.parameter(name="to", value=target_twilio_number or "")
            connect.append(stream)
            response.append(connect)
            return str(response)

        # Standard Outbound / Browser WebRTC Call Handling
        caller_number_default = tw_cfg.phone_number.split(",")[0].strip() if (tw_cfg and tw_cfg.phone_number) else None
        caller_id = normalize_phone_number(caller_id_override or caller_number_default)
        destination = normalize_phone_number(to)

        print(f"[Twilio Outbound WebRTC] destination='{destination}', caller_id='{caller_id}'")

        if not destination:
            print("[Twilio TwiML Error] Destination number missing.")
            response.say("Destination phone number is invalid or missing.")
            response.hangup()
            return str(response)

        if not caller_id:
            print("[Twilio TwiML Error] Caller ID missing.")
            response.say("Caller ID phone number is not configured in Twilio settings.")
            response.hangup()
            return str(response)

        dial = Dial(caller_id=caller_id, answer_on_bridge=True)
        dial.number(destination)
        response.append(dial)

        return str(response)

    async def list_calls(self, ctx: TenantContext, call_type: Optional[str] = None) -> List[Call]:
        try:
            calls = await self.call_repo.list_by_org(ctx.organization_id, call_type=call_type)
            if not calls and ctx.user_id and ctx.user_id != ctx.organization_id:
                calls = await self.call_repo.list_by_org(ctx.user_id, call_type=call_type)
                
            tw_cfg = await self.twilio_repo.get_by_org(ctx.organization_id)
            if not tw_cfg and ctx.user_id:
                tw_cfg = await self.twilio_repo.get_by_org(ctx.user_id)
            
            if tw_cfg and calls:
                def _sync_twilio_updates():
                    try:
                        if not tw_cfg.encrypted_auth_token:
                            return
                        auth_token = decrypt_token(tw_cfg.encrypted_auth_token)
                        client = Client(tw_cfg.account_sid, auth_token)
                        for call in calls:
                            if call.call_sid and call.status not in ["completed", "failed", "busy", "no-answer"]:
                                try:
                                    tw_fetch = client.calls(call.call_sid).fetch()
                                    call.status = tw_fetch.status or call.status
                                    if tw_fetch.duration and str(tw_fetch.duration).isdigit():
                                        call.duration = int(tw_fetch.duration)
                                except Exception:
                                    pass
                    except Exception as ex:
                        print(f"[CallService Warning] _sync_twilio_updates: {ex}")

                await asyncio.to_thread(_sync_twilio_updates)
                
                # Persist any updated statuses/durations to database
                for call in calls:
                    try:
                        await self.call_repo.save(call)
                    except Exception:
                        pass

            return calls
        except Exception as e:
            print(f"[CallService Error] list_calls: {e}")
            return []
