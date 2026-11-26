"""Exact spoken Gujarati for the business phone number, address and email, so the voice model never garbles digits.

The phone number "+917043329693" is said as two-digit words ("સિત્તેર, ત્રેતાલીસ, ..."), the address "D-305" as
"ડી ત્રણસો પાંચ", the way a person would say them.
"""

import re

from app.numerology.spoken_date import _NUMBER_WORDS

PHONE_LENGTH = 10

_LETTERS = dict(zip(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ["એ", "બી", "સી", "ડી", "ઈ", "એફ", "જી", "એચ", "આઈ", "જે", "કે", "એલ", "એમ", "એન", "ઓ", "પી", "ક્યુ", "આર", "એસ", "ટી",
     "યુ", "વી", "ડબલ્યુ", "એક્સ", "વાય", "ઝેડ"],
))
_HUNDREDS = {1: "એકસો", 2: "બસો", 3: "ત્રણસો", 4: "ચારસો", 5: "પાંચસો", 6: "છસો", 7: "સાતસો", 8: "આઠસો", 9: "નવસો"}


def _read(digits: str) -> str:
    return " ".join(_NUMBER_WORDS[int(d)][0] for d in digits)


def ten_digits(raw: str) -> str:
    """The 10-digit number from a stored phone such as "+917043329693" (no country code); "" when it is not one."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if len(digits) > PHONE_LENGTH and digits[:-PHONE_LENGTH] in ("0", "91", "091"):
        digits = digits[-PHONE_LENGTH:]
    return digits if len(digits) == PHONE_LENGTH else ""


def _two(pair: str) -> str:
    """A two-digit pair the way a person says it: "70" is સિત્તેર, "05" is શૂન્ય પાંચ."""
    return f"{_NUMBER_WORDS[0][0]} {_NUMBER_WORDS[int(pair[1])][0]}" if pair[0] == "0" else _NUMBER_WORDS[int(pair)][0]


def phone_words(digits: str) -> str:
    """"7043329693" -> "સિત્તેર, ત્રેતાલીસ, બત્રીસ, છન્નું, ત્રાણું": two digits at a time, like a real person."""
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
    """Exact words for the business phone number, address and email."""
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
