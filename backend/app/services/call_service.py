from datetime import datetime, timezone
import uuid
from typing import List, Dict, Any
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

    async def make_call(self, ctx: TenantContext, to_number: str) -> Call:
        tw_cfg = await self.twilio_repo.get_by_org(ctx.organization_id)
        if not tw_cfg:
            raise HTTPException(
                status_code=400,
                detail="Twilio is not configured for this organization. Please configure your Account SID and Auth Token first."
            )

        auth_token = decrypt_token(tw_cfg.encrypted_auth_token)

        try:
            client = Client(tw_cfg.account_sid, auth_token)
            tw_call = client.calls.create(
                to=to_number,
                from_=tw_cfg.phone_number,
                twiml="<Response><Say voice='alice'>Hello! This call was placed directly from your web console. Connected successfully.</Say><Pause length='10'/></Response>"
            )
            real_call_sid = tw_call.sid
            status = tw_call.status or "initiated"
        except TwilioRestException as tre:
            raise HTTPException(status_code=400, detail=f"Twilio API Error: {tre.msg} (Code: {tre.code})")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to place call via Twilio: {str(e)}")

        call = Call(
            id=f"cal_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            twilio_configuration_id=tw_cfg.id,
            call_sid=real_call_sid,
            from_number=tw_cfg.phone_number,
            to_number=to_number,
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
        
        return {
            "token": token.to_jwt(),
            "identity": identity,
            "from_number": tw_cfg.phone_number
        }

    async def list_calls(self, ctx: TenantContext) -> List[Call]:
        return await self.call_repo.list_by_org(ctx.organization_id)
