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
                    inbound_forward_mode=item.get("inbound_forward_mode", "global"),
                    inbound_forward_global_number=item.get("inbound_forward_global_number"),
                    inbound_forward_mapping=item.get("inbound_forward_mapping") or {},
                    status="CONNECTED",
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
        except Exception as e:
            print(f"[TwilioRepository Error] get_by_org: {e}")
        
        return None

    async def get_by_phone_number(self, phone_number: str) -> Optional[TwilioConfiguration]:
        container = get_twilio_container()
        if not container:
            return None
        
        # Look for configuration where phone_number contains the called number
        cleaned = phone_number.replace("+", "").strip()
        query = "SELECT * FROM c WHERE CONTAINS(c.phone_number, @clean_num) OR CONTAINS(c.phone_number, @full_num)"
        params = [
            {"name": "@clean_num", "value": cleaned},
            {"name": "@full_num", "value": phone_number}
        ]
        try:
            items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
            if items:
                item = items[0]
                return TwilioConfiguration(
                    id=item.get("id", f"cfg_{item.get('user_id')}"),
                    organization_id=item.get("user_id"),
                    account_sid=item.get("account_sid", ""),
                    encrypted_auth_token=item.get("encrypted_auth_token", ""),
                    phone_number=item.get("phone_number", ""),
                    twiml_app_sid=item.get("twiml_app_sid"),
                    api_key_sid=item.get("api_key_sid"),
                    encrypted_api_key_secret=item.get("encrypted_api_key_secret"),
                    public_base_url=item.get("public_base_url"),
                    inbound_forward_mode=item.get("inbound_forward_mode", "global"),
                    inbound_forward_global_number=item.get("inbound_forward_global_number"),
                    inbound_forward_mapping=item.get("inbound_forward_mapping") or {},
                    status="CONNECTED",
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
        except Exception as e:
            print(f"[TwilioRepository Error] get_by_phone_number: {e}")
        
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
                    "inbound_forward_mode": config.inbound_forward_mode,
                    "inbound_forward_global_number": config.inbound_forward_global_number,
                    "inbound_forward_mapping": config.inbound_forward_mapping or {},
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                container.upsert_item(body=doc)
            except Exception as e:
                print(f"[TwilioRepository Error] save: {e}")
        return config
