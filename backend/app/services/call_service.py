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

from app.core.dependencies import TenantContext
from app.core.security import decrypt_token
from app.models.call import Call
from app.repositories.twilio_repository import TwilioRepository
from app.repositories.call_repository import CallRepository


class CallService:
    def __init__(self, twilio_repo: TwilioRepository, call_repo: CallRepository):
        self.twilio_repo = twilio_repo
        self.call_repo = call_repo

    async def make_call(
        self,
        ctx: TenantContext,
        to_number: str,
        from_number: Optional[str] = None,
        prompt: Optional[str] = None
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

        # Build dynamic speech / message
        speech_text = prompt.strip() if prompt and prompt.strip() else "Hello! Thank you for connecting with Desire AI Platform. How can I assist you today?"
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
            prompt=prompt.strip() if prompt else None,
            status=status,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        return await self.call_repo.save(call)

    async def generate_voice_token(self, ctx: TenantContext) -> Dict[str, Any]:
        tw_cfg = await self.twilio_repo.get_by_org(ctx.organization_id)
        if not tw_cfg:
            raise HTTPException(status_code=400, detail="Twilio is not configured.")
        
        auth_token = decrypt_token(tw_cfg.encrypted_auth_token)
        identity = f"user_{ctx.user_id}"
        
        token = AccessToken(
            account_sid=tw_cfg.account_sid,
            signing_key_sid=tw_cfg.account_sid,
            secret=auth_token,
            identity=identity
        )
        grant = VoiceGrant(incoming_allow=True)
        token.add_grant(grant)
        
        first_number = tw_cfg.phone_number.split(",")[0].strip() if tw_cfg.phone_number else ""

        return {
            "token": token.to_jwt(),
            "identity": identity,
            "from_number": first_number
        }

    async def list_calls(self, ctx: TenantContext) -> List[Call]:
        calls = await self.call_repo.list_by_org(ctx.organization_id)
        tw_cfg = await self.twilio_repo.get_by_org(ctx.organization_id)
        
        if tw_cfg and calls:
            def _sync_twilio_updates():
                try:
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
                except Exception:
                    pass

            await asyncio.to_thread(_sync_twilio_updates)

        return calls
