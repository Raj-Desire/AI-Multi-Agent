"""Understands a phone number spoken in Gujarati, in code, so the voice model never turns number words into digits.

Callers say numbers as two-digit words ("નવ્વાણું બે અઠ્યાસી" = 99 2 88), single digits, "ડબલ", or English words.
Pieces are collected across turns in `state`, and the number is read back digit by digit before it is accepted.
"""

import re
from typing import Any, Dict, List, Tuple

from app.numerology.spoken_date import _NUMBER_WORDS, _classify, _merge_words, _tokens

PHONE_LENGTH = 10
_NEGATIVE = {"ના", "નહીં", "નહિ", "નહી", "નઈ", "નઇ", "ખોટું", "ખોટો", "ખોટી"}
_REPEAT = {"ડબલ": 2, "double": 2, "ટ્રિપલ": 3, "triple": 3, "ટ્રીપલ": 3}

# Words that mean the caller is giving a day or a time, not digits ("કાલે બે વાગે" is 2 o'clock, not a digit).
_TIME_WORDS = (
    "વાગ", "બપોર", "સવાર", "સાંજ", "રાત", "કાલ", "આજે", "આજ", "પરમ", "કલાક", "મિનિટ", "સોમવાર", "મંગળવાર", "બુધવાર",
    "ગુરુવાર", "શુક્રવાર", "શનિવાર", "રવિવાર", "તારીખ", "મહિન", "પછી",
)

_SAY = {
    "time": "સમય નોંધી લીધો. તમારો ફોન નંબર જણાવશો?",
    "time_after_phone": "બરાબર, સમય નોંધી લીધો.",
    "accepted": "સારું, નંબર નોંધી લીધો.",
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
    if len(digits) < 6 and any(t.startswith(_TIME_WORDS) for t in tokens):
        # A day or a time, not a phone number: never read a digit out of it.
        say = _SAY["time_after_phone"] if state.get("phone") else _SAY["time"]
        return {"status": "time", "say": say}
    if not digits and state.get("phone") and not any(t in _NEGATIVE for t in tokens):
        return {"status": "accepted", "say": _SAY["accepted"]}  # a plain "yes" after the read-back
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


def ten_digits(raw: str) -> str:
    """The 10-digit number from a stored phone such as "+917043329693" (no country code); "" when it is not one."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if len(digits) > PHONE_LENGTH and digits[:-PHONE_LENGTH] in ("0", "91", "091"):
        digits = digits[-PHONE_LENGTH:]
    return digits if len(digits) == PHONE_LENGTH else ""


_LETTERS = dict(zip(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ["એ", "બી", "સી", "ડી", "ઈ", "એફ", "જી", "એચ", "આઈ", "જે", "કે", "એલ", "એમ", "એન", "ઓ", "પી", "ક્યુ", "આર", "એસ", "ટી",
     "યુ", "વી", "ડબલ્યુ", "એક્સ", "વાય", "ઝેડ"],
))
_HUNDREDS = {1: "એકસો", 2: "બસો", 3: "ત્રણસો", 4: "ચારસો", 5: "પાંચસો", 6: "છસો", 7: "સાતસો", 8: "આઠસો", 9: "નવસો"}


def _two(pair: str) -> str:
    """A two-digit pair the way a person says it: "70" is સિત્તેર, "05" is શૂન્ય પાંચ."""
    return f"{_NUMBER_WORDS[0][0]} {_NUMBER_WORDS[int(pair[1])][0]}" if pair[0] == "0" else _NUMBER_WORDS[int(pair)][0]


def phone_words(digits: str) -> str:
    """"7043329693" -> "સિત્તેર, તેંતાલીસ, બત્રીસ, છન્નું, ત્રાણું": two digits at a time, like a real person."""
    pairs = [digits[i:i + 2] for i in range(0, len(digits) - 1, 2)]
    words = [_two(p) for p in pairs]
    if len(digits) % 2:
        words.append(_NUMBER_WORDS[int(digits[-1])][0])
    return ", ".join(words)


def number_words(text: str) -> str:
    """A number inside an address: 305 is ત્રણસો પાંચ, 11 is અગિયાર; a long one (a pin code) is said digit by digit."""
    if len(text) > 4:
        return _read(text)
    n = int(text)
    if n <= 99:
        return _NUMBER_WORDS[n][0]
    parts = []
    thousands, rest = divmod(n, 1000)
    if thousands:
        parts.append(f"{_NUMBER_WORDS[thousands][0]} હજાર")
    hundreds, rest = divmod(rest, 100)
    if hundreds:
        parts.append(_HUNDREDS[hundreds])
    if rest:
        parts.append(_NUMBER_WORDS[rest][0])
    return " ".join(parts)


def spoken_address(address: str) -> str:
    """"D-305, Ganesh Glory 11, Nr. BSNL office" -> "ડી ત્રણસો પાંચ, Ganesh Glory અગિયાર, નજીક BSNL office"."""
    text = re.sub(r"\bN(?:ea)?r\.?\s", "નજીક ", address or "")
    text = re.sub(r"\b([A-Za-z])\s*[-/]?\s*(\d+)\b", lambda m: f"{_LETTERS[m.group(1).upper()]} {number_words(m.group(2))}", text)
    text = re.sub(r"\d+", lambda m: number_words(m.group(0)), text)
    return re.sub(r"\s+", " ", text).strip()


def spoken_contact_block(phone: str, email: str = "", address: str = "") -> str:
    """Exact words for the business phone number, address and email, so the voice model never garbles digits."""
    lines = []
    digits = ten_digits(phone)
    if digits:
        lines.append(
            "EXACT SPOKEN PHONE NUMBER: when the caller asks for the phone or contact number, say the number ONLY as these words, "
            f"two digits at a time like a person, never as hundreds or thousands: '{phone_words(digits)}'."
        )
    if address and address.strip():
        lines.append(f"EXACT SPOKEN ADDRESS: when the caller asks for the address, say it as: '{spoken_address(address)}'.")
    if email and "@" in email:
        local, _, domain = email.partition("@")
        lines.append(f"EXACT SPOKEN EMAIL: say it as: '{local} એટ {domain.replace('.', ' ડોટ ')}'.")
    return ("\n\n" + "\n".join(lines)) if lines else ""
