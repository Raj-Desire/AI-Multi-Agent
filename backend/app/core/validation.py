from typing import Type, TypeVar

from fastapi import HTTPException, Request
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


async def parse_body_without_echo(request: Request, model: Type[T]) -> T:
    """Validate a request body without echoing submitted values (default 422 bodies include `input`)."""
    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(422, detail="Invalid request body.")
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        errors = exc.errors(include_input=False, include_url=False, include_context=False)
        safe = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in errors]
        raise HTTPException(422, detail=safe)
