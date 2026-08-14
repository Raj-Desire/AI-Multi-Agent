from typing import Dict, Optional
from datetime import datetime, timezone
from app.models.twilio import TwilioConfiguration
from app.core.cosmos import get_twilio_container

class TwilioRepository:
    async def get_by_org(self, organization_id: str) -> Optional[TwilioConfiguration]:
        container = get_twilio_container()
        if not container:
            return None
        
        query = "SELECT * FROM c WHERE c.user_id = @user_id"
        params = [{"name": "@user_id", "value": organization_id}]
        try:
            items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
            if items:
                item = items[0]
                return TwilioConfiguration(
                    id=item.get("id", f"cfg_{organization_id}"),
                    organization_id=item.get("user_id", organization_id),
                    account_sid=item.get("account_sid", ""),
                    encrypted_auth_token=item.get("encrypted_auth_token", ""),
                    phone_number=item.get("phone_number", ""),
                    twiml_app_sid=item.get("twiml_app_sid"),
                    api_key_sid=item.get("api_key_sid"),
                    encrypted_api_key_secret=item.get("encrypted_api_key_secret"),
                    public_base_url=item.get("public_base_url"),
                    status="CONNECTED",
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
        except Exception as e:
            print(f"[TwilioRepository Error] get_by_org: {e}")
        
        return None

    async def save(self, config: TwilioConfiguration) -> TwilioConfiguration:
        container = get_twilio_container()
        if container:
            try:
                doc = {
                    "id": f"cfg_{config.organization_id}",
                    "user_id": config.organization_id,
                    "account_sid": config.account_sid,
                    "encrypted_auth_token": config.encrypted_auth_token,
                    "phone_number": config.phone_number,
                    "twiml_app_sid": config.twiml_app_sid,
                    "api_key_sid": config.api_key_sid,
                    "encrypted_api_key_secret": config.encrypted_api_key_secret,
                    "public_base_url": config.public_base_url,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                container.upsert_item(body=doc)
            except Exception as e:
                print(f"[TwilioRepository Error] save: {e}")
        return config
