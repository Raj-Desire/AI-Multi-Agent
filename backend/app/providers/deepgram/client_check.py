from typing import Optional

import httpx

_TIMEOUT_SECONDS = 4.0


async def validate_engine_key(api_key: str) -> Optional[bool]:
    """True if accepted, False if definitively rejected (401/403), None if unknown."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                "https://api.deepgram.com/v1/projects",
                headers={"Authorization": f"Token {api_key}"},
            )
    except Exception:
        return None
    if 200 <= resp.status_code < 300:
        return True
    if resp.status_code in (401, 403):
        return False
    return None
