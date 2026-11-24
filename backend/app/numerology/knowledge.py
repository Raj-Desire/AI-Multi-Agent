"""Approved Graha knowledge (Gujarati) loaded from data/grahas_gu.json."""

import json
import random
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Set

from pydantic import BaseModel

_DATA = Path(__file__).parent / "data" / "grahas_gu.json"


class Trait(BaseModel):
    id: str
    text_gu: str


@lru_cache(maxsize=1)
def _load() -> Dict:
    return json.loads(_DATA.read_text(encoding="utf-8"))


def graha_name(number: int) -> str:
    return _load()["grahas"][str(number)]["graha"]


def graha_name_en(number: int) -> str:
    return _load()["grahas"][str(number)]["graha_en"]


def theme_gu(number: int) -> str:
    return _load()["grahas"][str(number)]["theme_gu"]


def number_for_graha(name: str) -> Optional[int]:
    """Finds a Graha number from its Gujarati or English name (case-insensitive)."""
    wanted = (name or "").strip().lower()
    for number, entry in _load()["grahas"].items():
        if wanted in (entry["graha"].lower(), entry["graha_en"].lower()):
            return int(number)
    return None


def pick_traits(
    number: int,
    exclude_ids: Set[str],
    count: int = 2,
    rng: Optional[random.Random] = None,
) -> List[Trait]:
    """Random approved traits for a Graha, never one in `exclude_ids`."""
    pool = [
        Trait(id=t["id"], text_gu=t["text_gu"])
        for t in _load()["grahas"][str(number)]["traits"]
        if t.get("approved") and t["id"] not in exclude_ids
    ]
    return (rng or random).sample(pool, min(count, len(pool)))
