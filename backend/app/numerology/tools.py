"""Live call functions for the numerology agent. Every result is plain text the voice model reads from.

Error texts stay vendor-neutral because the model may repeat them to the caller.
"""

import json
from typing import Any, Dict

from app.numerology import knowledge
from app.numerology.engine import calculate

AGENT_SCOPE = "numerology_consultation"

NUMEROLOGY_FUNCTIONS = [
    {
        "name": "calculate_numerology",
        "description": (
            "Calculate the present and missing numbers for a date of birth. Call it ONLY after the caller has "
            "confirmed the date. Never do this arithmetic yourself."
        ),
        "parameters": {
            "type": "object",
            "properties": {"dob": {"type": "string", "description": "Confirmed date of birth as DD/MM/YYYY"}},
            "required": ["dob"],
        },
    },
    {
        "name": "get_graha_traits",
        "description": (
            "Get the approved traits of one weak Graha. Call it BEFORE saying anything about that Graha. "
            "Speak only the meaning of the traits it returns."
        ),
        "parameters": {
            "type": "object",
            "properties": {"graha": {"type": "string", "description": "Graha name, e.g. શનિ or Saturn"}},
            "required": ["graha"],
        },
    },
]

FUNCTION_NAMES = frozenset(f["name"] for f in NUMEROLOGY_FUNCTIONS)


def _args(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return {}
    return raw if isinstance(raw, dict) else {}


def run_calculate(raw_args: Any, state: Dict[str, Any]) -> str:
    try:
        result = calculate(str(_args(raw_args).get("dob", "")))
    except ValueError as exc:
        return f"The date could not be used: {exc}. Ask the caller to say it again."
    state["result"] = result
    state.setdefault("used", set())
    return json.dumps(
        # Only Graha names go to the model: no numbers and no themes, so it can speak only approved traits.
        {"dob": result.dob, "weak_grahas": [knowledge.graha_name(n) for n in result.missing]},
        ensure_ascii=False,
    )


def run_get_traits(raw_args: Any, state: Dict[str, Any]) -> str:
    result = state.get("result")
    if result is None:
        return "No calculation has been done yet. Confirm the date of birth and calculate first."
    number = knowledge.number_for_graha(str(_args(raw_args).get("graha", "")))
    if number is None:
        return "That is not one of the nine Grahas. Ask the caller which Graha they mean."
    if number not in result.missing:
        return "That number is present in the chart, and there is no approved note for it. Offer the specialist."
    used = state.setdefault("used", set())
    traits = knowledge.pick_traits(number, used)
    if not traits:
        return "There are no more approved traits for this Graha. Offer the specialist for a detailed reading."
    used.update(t.id for t in traits)
    return json.dumps(
        {"graha": knowledge.graha_name(number), "traits": [t.text_gu for t in traits]},
        ensure_ascii=False,
    )


def run_function(name: str, raw_args: Any, state: Dict[str, Any]) -> str:
    if name == "calculate_numerology":
        return run_calculate(raw_args, state)
    if name == "get_graha_traits":
        return run_get_traits(raw_args, state)
    return "Unknown function."
