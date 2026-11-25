"""Understands a phone number spoken in Gujarati, in code, so the voice model never turns number words into digits.

Callers say numbers as two-digit words ("નવ્વાણું બે અઠ્યાસી" = 99 2 88), single digits, "ડબલ", or English words.
Pieces are collected across turns in `state`, and the number is read back digit by digit before it is accepted.
"""

from typing import Any, Dict, List, Tuple

from app.numerology.spoken_date import _NUMBER_WORDS, _classify, _merge_words, _tokens

PHONE_LENGTH = 10
_NEGATIVE = {"ના", "નહીં", "નહિ", "નહી", "નઈ", "નઇ", "ખોટું", "ખોટો", "ખોટી"}
_REPEAT = {"ડબલ": 2, "double": 2, "ટ્રિપલ": 3, "triple": 3, "ટ્રીપલ": 3}

_SAY = {
    "nothing": "માફ કરજો, નંબર સમજાયો નહીં. થોડા થોડા આંકડા કરીને કહેશો?",
    "restart": "સારું, ફોન નંબર ફરીથી જણાવશો?",
    "too_long": "આંકડા વધારે થઈ ગયા. આખો નંબર ફરીથી જણાવશો?",
}


def _flush(run: List[Tuple[str, int]], repeats: List[int]) -> str:
    """Joins a run of number words into digits. "ત્રીસ" is 30, "બે" is 2, "ડબલ આઠ" is 88."""
    text = ""
    merged = _merge_words(run)
    for index, (kind, value) in enumerate(merged):
        if kind == "num":
            text += str(value) * (repeats[index] if index < len(repeats) else 1)
    return text


def _digits_in(spoken: str) -> str:
    out = ""
    run: List[Tuple[str, int]] = []
    repeats: List[int] = []
    repeat = 1
    for token in _tokens(spoken):
        if token.isdigit():
            out += _flush(run, repeats) + token
            run, repeats = [], []
            continue
        if token in _REPEAT:
            repeat = _REPEAT[token]
            continue
        found = _classify(token)
        if found and found[0] in ("num", "etens", "eunit", "ogan"):
            run.append(found)
            repeats.append(repeat)
            repeat = 1
    return out + _flush(run, repeats)


def _read(digits: str) -> str:
    return " ".join(_NUMBER_WORDS[int(d)][0] for d in digits)


def capture(spoken: str, state: Dict[str, Any]) -> Dict[str, str]:
    """Collects the phone number. Returns {"status", "say"}; status "confirm" means 10 digits were heard."""
    tokens = _tokens(spoken)
    digits = _digits_in(spoken)
    if not digits and any(t in _NEGATIVE for t in tokens):
        state["phone_digits"] = ""
        state.pop("phone", None)
        state["phone_status"] = "restart"
        return {"status": "restart", "say": _SAY["restart"]}
    if not digits:
        state["phone_status"] = "nothing"
        return {"status": "nothing", "say": _SAY["nothing"]}

    heard = state.get("phone_digits", "")
    # A whole number said in one go, or a correction after the read-back, replaces what was heard before.
    if len(digits) >= PHONE_LENGTH or state.get("phone_status") == "confirm":
        heard = digits
    else:
        heard += digits
    if len(heard) > PHONE_LENGTH and heard[:-PHONE_LENGTH] in ("0", "91", "091"):
        heard = heard[-PHONE_LENGTH:]  # a country code or leading zero is not part of the number
    state.pop("phone", None)
    if len(heard) > PHONE_LENGTH:
        state["phone_digits"], state["phone_status"] = "", "too_long"
        return {"status": "too_long", "say": _SAY["too_long"]}
    state["phone_digits"] = heard
    if len(heard) < PHONE_LENGTH:
        state["phone_status"] = "need_more"
        return {"status": "need_more", "say": f"{len(heard)} આંકડા સમજાયા. બાકીના {PHONE_LENGTH - len(heard)} જણાવશો?"}
    state["phone"] = heard
    state["phone_status"] = "confirm"
    return {"status": "confirm", "say": f"તમારો નંબર {_read(heard[:5])}, {_read(heard[5:])} છે, બરાબર?"}
