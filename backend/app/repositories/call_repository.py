from typing import List
from datetime import datetime, timezone
import asyncio
from app.models.call import Call
from app.core.cosmos import get_calls_container

class CallRepository:
    async def list_by_org(self, organization_id: str) -> List[Call]:
        def _sync_list():
            container = get_calls_container()
            if not container:
                return []
            query = "SELECT * FROM c WHERE c.user_id = @user_id ORDER BY c.created_at DESC"
            params = [{"name": "@user_id", "value": organization_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                calls = []
                for item in items:
                    created_dt = datetime.fromisoformat(item["created_at"]) if isinstance(item.get("created_at"), str) else datetime.now(timezone.utc)
                    updated_dt = datetime.fromisoformat(item["updated_at"]) if isinstance(item.get("updated_at"), str) else datetime.now(timezone.utc)
                    calls.append(Call(
                        id=item["id"],
                        organization_id=item.get("organization_id", organization_id),
                        user_id=item["user_id"],
                        twilio_configuration_id=item.get("twilio_configuration_id", ""),
                        call_sid=item.get("call_sid"),
                        from_number=item.get("from_number", ""),
                        to_number=item.get("to_number", ""),
                        duration=int(item.get("duration", 0)),
                        prompt=item.get("prompt"),
                        status=item.get("status", "initiated"),
                        created_at=created_dt,
                        updated_at=updated_dt
                    ))
                return calls
            except Exception as e:
                print(f"[CallRepository Error] list_by_org: {e}")
                return []

        return await asyncio.to_thread(_sync_list)

    async def save(self, call: Call) -> Call:
        def _sync_save():
            container = get_calls_container()
            if container:
                try:
                    doc = {
                        "id": call.id,
                        "organization_id": call.organization_id,
                        "user_id": call.user_id,
                        "twilio_configuration_id": call.twilio_configuration_id,
                        "call_sid": call.call_sid,
                        "from_number": call.from_number,
                        "to_number": call.to_number,
                        "duration": call.duration,
                        "prompt": call.prompt,
                        "status": call.status,
                        "created_at": call.created_at.isoformat() if hasattr(call.created_at, "isoformat") else str(call.created_at),
                        "updated_at": call.updated_at.isoformat() if hasattr(call.updated_at, "isoformat") else str(call.updated_at)
                    }
                    container.upsert_item(body=doc)
                except Exception as e:
                    print(f"[CallRepository Error] save: {e}")
            return call

        return await asyncio.to_thread(_sync_save)
