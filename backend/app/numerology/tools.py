"""Live call functions for the numerology agent. Every result is plain text the voice model reads from.

Error texts stay vendor-neutral because the model may repeat them to the caller.
"""

import json
from typing import Any, Dict

from app.numerology import knowledge, spoken_date
from app.numerology.engine import calculate

AGENT_SCOPE = "numerology_consultation"

NUMEROLOGY_FUNCTIONS = [
    {
        "name": "parse_birth_date",
        "description": (
            "Understand the date of birth the caller says. Call it every time the caller says anything about their "
            "date of birth, even one part of it, with their exact words as heard. Say ONLY the text in the 'say' "
            "field of the result, word for word. Never work out a day, month or year yourself."
        ),
        "parameters": {
            "type": "object",
            "properties": {"spoken": {"type": "string", "description": "The caller's exact words about the date"}},
            "required": ["spoken"],
        },
    },
    {
        "name": "calculate_numerology",
        "description": (
            "Calculate the present and missing numbers. Call it ONLY after parse_birth_date returned status "
            "'confirm' and the caller said yes. It uses the confirmed date; never do this arithmetic yourself. "
            "The result has the ready first reading sentences in 'first_reading'."
        ),
        "parameters": {
            "type": "object",
            "properties": {"dob": {"type": "string", "description": "Optional. The confirmed date as DD/MM/YYYY"}},
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
            "properties": {
                "graha": {"type": "string", "description": "Graha name, e.g. શનિ or Saturn"},
                "count": {"type": "integer", "description": "How many traits to get (1 or 2). Default 2."},
            },
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


def run_parse_date(raw_args: Any, state: Dict[str, Any]) -> str:
    return json.dumps(spoken_date.understand(str(_args(raw_args).get("spoken", "")), state), ensure_ascii=False)


def run_calculate(raw_args: Any, state: Dict[str, Any]) -> str:
    status = state.get("dob_status")
    if status not in (None, "confirm", "done"):
        return "The date of birth is not confirmed yet. Use parse_birth_date and read its 'say' text to the caller first."
    # The date the code understood and read back wins over anything the model typed in.
    dob = state.get("confirmed_dob") or str(_args(raw_args).get("dob", ""))
    try:
        result = calculate(dob)
    except ValueError as exc:
        return f"The date could not be used: {exc}. Ask the caller to say it again."
    state["result"] = result
    state["dob_status"] = "done"
    state.setdefault("used", set())
    # Only Graha names go to the model: no numbers and no themes, so it can speak only approved traits.
    out: Dict[str, Any] = {"dob": result.dob, "weak_grahas": [knowledge.graha_name(n) for n in result.missing]}
    out["first_reading"] = _first_reading(result, state)
    return json.dumps(out, ensure_ascii=False)


def _first_reading(result: Any, state: Dict[str, Any]) -> list:
    """The first 2 or 3 approved sentences, chosen in the same call as the calculation.

    Handing them over now saves the model two or three extra lookups (each a full round trip through the language
    model) and the caller hears the reading sooner. The Graha names are left out: the reading is only the sentences.
    """
    cached = state.get("first_reading")
    if cached and cached[0] == result.dob:
        return cached[1]  # asked twice for the same date: never spend a second set of sentences
    used = state.setdefault("used", set())
    used_texts = state.setdefault("used_texts", set())
    sentences: list = []
    for position, number in enumerate(result.missing[:2]):
        for trait in knowledge.pick_traits(number, used, count=2 if position == 0 else 1, exclude_texts=used_texts):
            used.add(trait.id)
            used_texts.add(trait.text_gu)
            sentences.append(trait.text_gu)
    state["first_reading"] = (result.dob, sentences)
    return sentences


def _count(raw_args: Any) -> int:
    try:
        return max(1, min(2, int(_args(raw_args).get("count", 2))))
    except (TypeError, ValueError):
        return 2


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
    used_texts = state.setdefault("used_texts", set())
    traits = knowledge.pick_traits(number, used, count=_count(raw_args), exclude_texts=used_texts)
    if not traits:
        return "There are no more approved traits for this Graha. Offer the specialist for a detailed reading."
    used.update(t.id for t in traits)
    used_texts.update(t.text_gu for t in traits)
    return json.dumps(
        {"graha": knowledge.graha_name(number), "traits": [t.text_gu for t in traits]},
        ensure_ascii=False,
    )


def run_function(name: str, raw_args: Any, state: Dict[str, Any]) -> str:
    if name == "parse_birth_date":
        return run_parse_date(raw_args, state)
    if name == "calculate_numerology":
        return run_calculate(raw_args, state)
    if name == "get_graha_traits":
        return run_get_traits(raw_args, state)
    return "Unknown function."
