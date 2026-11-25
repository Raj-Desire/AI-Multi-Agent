"""Understands a date of birth spoken in Gujarati, in code, so the voice model never converts number words itself.

The caller may say the date in pieces ("ઓગણત્રીસ" ... "જૂન" ... "ઓગણીસો પિસ્તાલીસ"). Pieces are merged across turns in
`parts`. Every answer carries the exact Gujarati sentence the agent should say next, built here from digits, so the
year read back to the caller is always the one the code understood.

Century rule for a year said with only two digits: up to this year's last two digits means 20xx, above means 19xx.
"""

import difflib
import re
import unicodedata
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from app.numerology.engine import MIN_YEAR, resolve_year

# Canonical spoken form first; the rest are spellings that speech recognition produces.
_NUMBER_WORDS: Dict[int, Tuple[str, ...]] = {
    0: ("શૂન્ય", "ઝીરો", "શુન્ય"),
    1: ("એક",),
    2: ("બે",),
    3: ("ત્રણ",),
    4: ("ચાર",),
    5: ("પાંચ", "પાચ"),
    6: ("છ",),
    7: ("સાત",),
    8: ("આઠ",),
    9: ("નવ",),
    10: ("દસ", "દશ"),
    11: ("અગિયાર", "અગીયાર"),
    12: ("બાર",),
    13: ("તેર",),
    14: ("ચૌદ",),
    15: ("પંદર",),
    16: ("સોળ",),
    17: ("સત્તર",),
    18: ("અઢાર",),
    19: ("ઓગણીસ", "ઓગણીશ"),
    20: ("વીસ", "વિસ"),
    21: ("એકવીસ",),
    22: ("બાવીસ", "બાવીશ"),
    23: ("ત્રેવીસ", "ત્રેવીશ"),
    24: ("ચોવીસ", "ચોવિસ", "ચોવીશ"),
    25: ("પચ્ચીસ", "પચીસ", "પચ્ચિસ", "પચીશ"),
    26: ("છવ્વીસ", "છવીસ", "છવ્વીશ"),
    27: ("સત્તાવીસ", "સતાવીસ", "સત્તાવીશ"),
    28: ("અઠ્ઠાવીસ", "અઠ્યાવીસ", "અઠાવીસ", "અઠાવિસ", "અઠ્ઠાવીશ"),
    29: ("ઓગણત્રીસ", "ઓગણત્રીશ", "ઓગણત્રિસ", "ઓગણત્રીસ"),
    30: ("ત્રીસ", "ત્રીશ"),
    31: ("એકત્રીસ", "એકત્રીશ"),
    32: ("બત્રીસ", "બત્રીશ"),
    33: ("તેત્રીસ", "તેંત્રીસ"),
    34: ("ચોત્રીસ", "ચોંત્રીસ"),
    35: ("પાંત્રીસ", "પાંત્રિસ"),
    36: ("છત્રીસ", "છત્રીશ"),
    37: ("સાડત્રીસ", "સાડત્રિસ"),
    38: ("અડત્રીસ", "આડત્રીસ"),
    39: ("ઓગણચાલીસ", "ઓગણચાલિસ", "ઓગણચાળીસ"),
    40: ("ચાલીસ", "ચાળીસ"),
    41: ("એકતાલીસ", "એકતાળીસ"),
    42: ("બેતાલીસ", "બેતાળીસ"),
    43: ("ત્રેતાલીસ", "ત્રેતાળીસ"),
    44: ("ચુમાલીસ", "ચુંમાલીસ", "ચોંમાલીસ", "ચુમ્માલીસ"),
    45: ("પિસ્તાલીસ", "પિસ્તાળીસ", "પીસ્તાલીસ"),
    46: ("છેતાલીસ", "છેંતાલીસ", "છેતાળીસ"),
    47: ("સુડતાલીસ", "સુડતાળીસ", "સાડતાલીસ"),
    48: ("અડતાલીસ", "અડતાળીસ"),
    49: ("ઓગણપચાસ", "ઓગણપચાશ"),
    50: ("પચાસ", "પચાશ"),
    51: ("એકાવન",),
    52: ("બાવન",),
    53: ("ત્રેપન",),
    54: ("ચોપન",),
    55: ("પંચાવન",),
    56: ("છપ્પન",),
    57: ("સત્તાવન",),
    58: ("અઠ્ઠાવન", "અઠાવન", "અઠ્યાવન"),
    59: ("ઓગણસાઠ",),
    60: ("સાઠ",),
    61: ("એકસઠ",),
    62: ("બાસઠ",),
    63: ("ત્રેસઠ",),
    64: ("ચોસઠ",),
    65: ("પાંસઠ",),
    66: ("છાસઠ",),
    67: ("સડસઠ",),
    68: ("અડસઠ",),
    69: ("ઓગણોસિત્તેર", "ઓગણસિત્તેર", "ઓગણોતેર"),
    70: ("સિત્તેર", "સીત્તેર"),
    71: ("એકોતેર", "એકત્તેર"),
    72: ("બોતેર", "બહોતેર"),
    73: ("તોતેર", "ત્રોતેર"),
    74: ("ચુમોતેર", "ચુંમોતેર"),
    75: ("પંચોતેર", "પંચોત્તેર"),
    76: ("છોતેર", "છોત્તેર"),
    77: ("સિત્યોતેર", "સીત્યોતેર", "સત્યોતેર"),
    78: ("ઇઠ્યોતેર", "ઈઠ્યોતેર"),
    79: ("ઓગણએંસી", "ઓગણાએંસી", "ઓગણાયંસી", "ઓગણ્યાએંસી", "ઓગણાંસી", "ઓગણએંશી"),
    80: ("એંસી", "એંશી"),
    81: ("એક્યાસી", "એકયાસી"),
    82: ("બ્યાસી",),
    83: ("ત્યાસી",),
    84: ("ચોર્યાસી", "ચોરાસી"),
    85: ("પંચાસી", "પંચ્યાસી"),
    86: ("છ્યાસી", "છયાસી"),
    87: ("સિત્યાસી", "સત્યાસી"),
    88: ("અઠ્યાસી", "અઠયાસી"),
    89: ("નેવ્યાસી", "નેવ્યાશી"),
    90: ("નેવું", "નેવુ"),
    91: ("એકાણું", "એકાણુ"),
    92: ("બાણું", "બાણુ"),
    93: ("ત્રાણું", "ત્રાણુ"),
    94: ("ચોરાણું", "ચોરાણુ"),
    95: ("પંચાણું", "પંચાણુ"),
    96: ("છન્નું", "છન્નુ"),
    97: ("સત્તાણું", "સતાણું", "સત્તાણુ"),
    98: ("અઠ્ઠાણું", "અઠાણું", "અઠ્ઠાણુ"),
    99: ("નવ્વાણું", "નવાણું", "નવ્વાણુ"),
}

_MONTHS: Dict[int, Tuple[str, ...]] = {
    1: ("જાન્યુઆરી", "જાન્યુવારી", "જાન્યુઆરિ", "january", "jan"),
    2: ("ફેબ્રુઆરી", "ફેબ્રુવારી", "february", "feb"),
    3: ("માર્ચ", "march"),
    4: ("એપ્રિલ", "એપ્રીલ", "april", "apr"),
    5: ("મે", "may"),
    6: ("જૂન", "જુન", "june"),
    7: ("જુલાઈ", "જુલાઇ", "જુલાય", "july"),
    8: ("ઓગસ્ટ", "ઓગષ્ટ", "ઑગસ્ટ", "ઑગષ્ટ", "august", "aug"),
    9: ("સપ્ટેમ્બર", "સપ્ટેંબર", "સેપ્ટેમ્બર", "september", "sep"),
    10: ("ઓક્ટોબર", "ઓકટોબર", "ઑક્ટોબર", "october", "oct"),
    11: ("નવેમ્બર", "નવેંબર", "november", "nov"),
    12: ("ડિસેમ્બર", "ડિસેંબર", "ડીસેમ્બર", "december", "dec"),
}

# "nineteen hundred" style words: the century a year starts from.
_HUNDRED_BASES = {
    "ઓગણીસો": 1900, "ઓગણીસસો": 1900, "ઓગણીશો": 1900, "ઓગણીશસો": 1900,
    "અઢારસો": 1800, "સત્તરસો": 1700, "સોળસો": 1600, "પંદરસો": 1500, "વીસસો": 2000,
}
_HUNDRED_WORDS = {
    "એકસો": 100, "બસો": 200, "ત્રણસો": 300, "ચારસો": 400, "પાંચસો": 500,
    "છસો": 600, "સાતસો": 700, "આઠસો": 800, "નવસો": 900,
}
_THOUSAND = {"હજાર", "હજારો"}
_HUNDRED_MULT = {"સો"}
_NEGATIVE = {"ના", "નહીં", "નહિ", "નહી", "નઈ", "નઇ", "ખોટું", "ખોટી", "ખોટો"}
_FILLER = {
    "મારી", "મારું", "મારો", "મારા", "જન્મ", "જન્મતારીખ", "તારીખ", "તારીખે", "છે", "માં", "મહિનામાં", "મહિનો",
    "મહિના", "ને", "ની", "નો", "નું", "વર્ષ", "વર્ષમાં", "સાલ", "સાલમાં", "હું", "તમે", "જન્નત", "હા", "જી",
    "તો", "અને", "એટલે", "પછી", "સનમાં", "સન", "શહેરના",
}

# English numbers the recognizer writes in Gujarati script ("સિક્સ્ટી સેવન" = sixty seven).
_ENGLISH_TENS = {
    20: ("ટ્વેન્ટી", "ટ્વેંટી", "twenty"), 30: ("થર્ટી", "thirty"), 40: ("ફોર્ટી", "forty"), 50: ("ફિફ્ટી", "fifty"),
    60: ("સિક્સ્ટી", "સિક્સટી", "સીક્સ્ટી", "sixty"), 70: ("સેવન્ટી", "સેવંટી", "seventy"),
    80: ("એઈટી", "એટી", "eighty"), 90: ("નાઈન્ટી", "નાઇન્ટી", "ninety"),
}
_ENGLISH_UNITS = {
    1: ("વન", "one"), 2: ("ટુ", "two"), 3: ("થ્રી", "three"), 4: ("ફોર", "four"), 5: ("ફાઈવ", "ફાઇવ", "five"),
    6: ("સિક્સ", "six"), 7: ("સેવન", "seven"), 8: ("એઈટ", "એઇટ", "eight"), 9: ("નાઈન", "નાઇન", "nine"),
}
_OGAN = ("ઓગણ", "ઓગણા")  # "one less than": ઓગણ + એંશી = 79

_GUJARATI_DIGITS = str.maketrans("૦૧૨૩૪૫૬૭૮૯", "0123456789")

_MONTH_NAMES = {m: words[0] for m, words in _MONTHS.items() if words}
_DAY_PREFIX = ("તારીખ",)

# word -> (kind, value)
_WORDS: Dict[str, Tuple[str, int]] = {}
for _value, _forms in _NUMBER_WORDS.items():
    for _form in _forms:
        _WORDS[unicodedata.normalize("NFC", _form)] = ("num", _value)
for _value, _forms in _MONTHS.items():
    for _form in _forms:
        _WORDS[unicodedata.normalize("NFC", _form)] = ("month", _value)
for _form, _value in _HUNDRED_BASES.items():
    _WORDS[_form] = ("base", _value)
for _form, _value in _HUNDRED_WORDS.items():
    _WORDS[_form] = ("hword", _value)
for _form in _THOUSAND:
    _WORDS[_form] = ("thousand", 0)
for _form in _HUNDRED_MULT:
    _WORDS[_form] = ("hmult", 0)
for _value, _forms in _ENGLISH_TENS.items():
    for _form in _forms:
        _WORDS[unicodedata.normalize("NFC", _form)] = ("etens", _value)
for _value, _forms in _ENGLISH_UNITS.items():
    for _form in _forms:
        _WORDS[unicodedata.normalize("NFC", _form)] = ("eunit", _value)
for _form in _OGAN:
    _WORDS[_form] = ("ogan", 0)

# Words long enough to match approximately (speech recognition drops or swaps a letter).
_FUZZY_KEYS = [k for k in _WORDS if len(k) >= 5]
_FUZZY_CUTOFF = 0.82


# Endings the caller glues onto a word ("જૂનમાં" = in June, "ચુમ્માલીસમાં" = in forty-four).
_SUFFIXES = ("માં", "ની", "નો", "ના", "ને", "થી", "નું")


def _classify(token: str) -> Optional[Tuple[str, int]]:
    found = _lookup(token)
    if found:
        return found
    for suffix in _SUFFIXES:
        if token.endswith(suffix) and len(token) - len(suffix) >= 2:
            found = _lookup(token[: -len(suffix)])
            if found:
                return found
    return None


def _lookup(token: str) -> Optional[Tuple[str, int]]:
    if token in _WORDS:
        return _WORDS[token]
    if token in _NEGATIVE:
        return ("neg", 0)
    if token in _FILLER or token.startswith(_DAY_PREFIX):
        return None
    if len(token) < 5:
        return None
    cut_off = {_WORDS[k] for k in _FUZZY_KEYS if k.startswith(token) and len(k) >= len(token) + 2 and _WORDS[k][0] == "num"}
    if len(cut_off) == 1:
        return cut_off.pop()  # "ચુમ્મા" is the start of "ચુમ્માલીસ"; only when exactly one number fits
    scored = [
        (difflib.SequenceMatcher(None, token, key).ratio(), key)
        for key in difflib.get_close_matches(token, _FUZZY_KEYS, n=3, cutoff=_FUZZY_CUTOFF)
    ]
    if not scored:
        return None
    scored.sort(reverse=True)
    best_score, best_key = scored[0]
    # Two different readings that are almost as good as each other: do not guess.
    for score, key in scored[1:]:
        if best_score - score < 0.05 and _WORDS[key] != _WORDS[best_key]:
            return None
    return _WORDS[best_key]


def _tokens(text: str) -> List[str]:
    text = unicodedata.normalize("NFC", text or "").lower().translate(_GUJARATI_DIGITS)
    return [t for t in re.split(r"[\s,;:.!?/\-\"'()]+", text) if t]


def _groups(text: str) -> List[Tuple[str, int]]:
    """Turns the spoken words into ordered pieces: ('num', v), ('month', m), ('year', y), ('base', 1900), ('neg', 0)."""
    items: List[Tuple[str, int]] = []
    for token in _tokens(text):
        if token.isdigit():
            if len(token) == 4:
                items.append(("year", int(token)))
            elif len(token) <= 2:
                items.append(("num", int(token)))
            continue
        kind = _classify(token)
        if kind:
            items.append(kind)

    items = _merge_digit_runs(_merge_words(items))
    out: List[Tuple[str, int]] = []
    i = 0
    n = len(items)
    while i < n:
        kind, value = items[i]
        nxt = items[i + 1] if i + 1 < n else None
        if kind == "base":
            tail = None
            if nxt and nxt[0] == "num":
                tail, i = nxt[1], i + 1
            out.append(("year", value + tail) if tail is not None else ("base", value))
        elif kind == "num" and nxt and nxt[0] == "thousand" and value in (1, 2):
            base, i = value * 1000, i + 1
            if i + 1 < n and items[i + 1][0] == "hword":
                base, i = base + items[i + 1][1], i + 1
            if i + 1 < n and items[i + 1][0] == "num":
                out.append(("year", base + items[i + 1][1]))
                i += 1
            else:
                out.append(("base", base))
        elif kind == "num" and nxt and nxt[0] == "hmult" and 10 <= value <= 20:
            base, i = value * 100, i + 1
            if i + 1 < n and items[i + 1][0] == "num":
                out.append(("year", base + items[i + 1][1]))
                i += 1
            else:
                out.append(("base", base))
        elif kind in ("num", "month", "year", "neg", "full"):
            out.append((kind, value))
        elif kind == "hword" and nxt and nxt[0] == "num":
            out.append(("year", 1000 + value + nxt[1]))
            i += 1
        i += 1
    return out


def _merge_words(items: List[Tuple[str, int]]) -> List[Tuple[str, int]]:
    """ઓગણ + એંશી is 79 (one less than 80); "સિક્સ્ટી સેવન" is 67."""
    out: List[Tuple[str, int]] = []
    i, n = 0, len(items)
    while i < n:
        kind, value = items[i]
        nxt = items[i + 1] if i + 1 < n else None
        if kind == "ogan":
            if nxt and nxt[0] == "num" and nxt[1] % 10 == 0 and 20 <= nxt[1] <= 90:
                out.append(("num", nxt[1] - 1))
                i += 1
        elif kind == "etens":
            if nxt and nxt[0] == "eunit":
                out.append(("num", value + nxt[1]))
                i += 1
            else:
                out.append(("num", value))
        elif kind == "eunit":
            out.append(("num", value))
        else:
            out.append(items[i])
        i += 1
    return out


def _merge_digit_runs(items: List[Tuple[str, int]]) -> List[Tuple[str, int]]:
    """Callers often say digits one by one: "બે ચાર ફેબ્રુઆરી" is 24 February, "બે શૂન્ય શૂન્ય પાંચ" is 2005."""
    out: List[Tuple[str, int]] = []
    i, n = 0, len(items)
    while i < n:
        if items[i][0] == "num" and items[i][1] <= 9:
            j = i
            while j < n and items[j][0] == "num" and items[j][1] <= 9:
                j += 1
            out.extend(_merge_run([v for _, v in items[i:j]], items[j] if j < n else None, items[i:j]))
            i = j
        else:
            out.append(items[i])
            i += 1
    return out


def _merge_run(run: List[int], following: Optional[Tuple[str, int]], original: List[Tuple[str, int]]) -> List[Tuple[str, int]]:
    count = len(run)
    if count in (6, 8):
        day, month = run[0] * 10 + run[1], run[2] * 10 + run[3]
        year_text = "".join(str(d) for d in run[4:])
        if 1 <= day <= 31 and 1 <= month <= 12:
            year = resolve_year(year_text)
            return [("full", day * 1_000_000 + month * 10_000 + year)]
    if count == 4 and run[0] * 10 + run[1] in (19, 20):
        return [("year", int("".join(str(d) for d in run)))]
    if count == 2 and following and following[0] == "month" and 1 <= run[0] * 10 + run[1] <= 31:
        return [("num", run[0] * 10 + run[1])]
    return list(original)


def _new_parts() -> Dict[str, Optional[int]]:
    return {"day": None, "month": None, "year": None, "base": None}


def number_words(n: int) -> str:
    return _NUMBER_WORDS[n][0]


def year_words(year: int) -> str:
    base, tail = (1900, year - 1900) if year < 2000 else (2000, year - 2000)
    head = "ઓગણીસો" if base == 1900 else "બે હજાર"
    return head if tail == 0 else f"{head} {number_words(tail)}"


def _base_words(base: int) -> str:
    return "ઓગણીસો" if base == 1900 else ("બે હજાર" if base == 2000 else str(base))


_SAY = {
    "need_day": "કઈ તારીખે જન્મ થયો હતો?",
    "need_month": "કયા મહિનામાં?",
    "need_year": "અને કયા વર્ષમાં?",
    "ambiguous_year": "વર્ષ ફરીથી પૂરું જણાવશો?",
    "nothing": "માફ કરજો, સમજાયું નહીં. જન્મતારીખ ફરીથી જણાવશો?",
    "restart": "સારું, જન્મતારીખ ફરીથી જણાવશો?",
    "range": "એ વર્ષ માટે ગણતરી થઈ શકતી નથી. સાચું વર્ષ ફરીથી જણાવશો?",
    "future": "એ વર્ષ તો હજી આવ્યું નથી. સાચું વર્ષ જણાવશો?",
}
_SLOW_TIP = "ચાલો, એક એક ભાગ અલગ કહો: પહેલાં તારીખ, પછી મહિનો, પછી વર્ષ, જેમ કે ઓગણીસો ત્રાણું."
_FAIL_STATUSES = {"nothing", "ambiguous_year", "need_day", "need_month", "need_year", "need_year_tail"}


def _apply(groups: List[Tuple[str, int]], parts: Dict[str, Optional[int]], can_replace: bool = False) -> bool:
    """Fills day, month and year from the pieces. Returns True when a piece could not be placed.

    `can_replace`: the date was already complete, so one lone number is a correction (up to 31 the day, above
    that the year) instead of a mistake.
    """
    ambiguous = False
    replaced = False
    i = 0
    while i < len(groups):
        kind, value = groups[i]
        day, month, year, base = parts["day"], parts["month"], parts["year"], parts["base"]
        following = groups[i + 1] if i + 1 < len(groups) else None
        if kind == "full":
            parts["day"], parts["month"] = value // 1_000_000, (value // 10_000) % 100
            parts["year"], parts["base"] = value % 10_000, None
        elif kind == "month":
            parts["month"] = value
        elif kind == "year":
            parts["year"], parts["base"] = value, None
        elif kind == "base":
            parts["base"], parts["year"] = value, None
        elif kind == "num":
            if following and following[0] == "month" and value != 0:
                if 1 <= value <= 31:
                    parts["day"] = value  # "ઓગણત્રીસ ફેબ્રુઆરી": the number before a month name is the day
                else:
                    ambiguous = True
            elif (
                value in (19, 20) and day and month and base is None
                and following and following[0] == "num" and following[1] >= 10
            ):
                parts["year"] = value * 100 + following[1]  # "વીસ બાવીસ" = 20 22 = 2022
                i += 1
            elif value == 0:
                if base is not None and day and month:
                    parts["year"], parts["base"] = base, None  # "બે હજાર" + "શૂન્ય"
            elif base is not None and day and month:
                parts["year"], parts["base"] = base + value, None
            elif day is None:
                if 1 <= value <= 31:
                    parts["day"] = value
                else:
                    ambiguous = True
            elif month is None and 1 <= value <= 12:
                parts["month"] = value
            elif year is None and base is None and value <= 99 and month is not None:
                # A bare two-digit year only counts once day and month are known; before that it is ambiguous.
                parts["year"] = resolve_year(f"{value:02d}")
            elif can_replace and not replaced and day and month and (year is not None or base is not None) and value <= 99:
                replaced = True
                if value <= 31:
                    parts["day"] = value
                else:
                    parts["year"], parts["base"] = resolve_year(f"{value:02d}"), None
            else:
                ambiguous = True
        i += 1
    return ambiguous


def _complete(parts: Dict[str, Optional[int]]) -> bool:
    return parts["day"] is not None and parts["month"] is not None and (parts["year"] is not None or parts["base"] is not None)


def understand(spoken: str, state: Dict[str, Any]) -> Dict[str, str]:
    """Reads what the caller said, merges it with earlier pieces in `state`, and says what to do next.

    Returns {"status": ..., "say": <Gujarati sentence to speak>}. When status is "confirm" the date is complete and
    valid and is stored in state["confirmed_dob"].

    A complete date replaces the old one. A single piece (only a month, only a year, a lone number) corrects just that
    piece, so one wrong part never makes the caller repeat everything.
    """
    parts = state.setdefault("dob_parts", _new_parts())
    groups = _groups(spoken)
    has_data = any(k in ("num", "month", "year", "base", "full") for k, _ in groups)
    negative = any(k == "neg" for k, _ in groups)

    month_at = [i for i, (k, _) in enumerate(groups) if k == "month"]
    if len(month_at) >= 2:
        # Two dates in one breath ("today is ... my birth date is ..."): the last one is the date of birth.
        last = month_at[-1]
        groups = groups[last - 1 if last > 0 and groups[last - 1][0] == "num" else last:]
        parts = state["dob_parts"] = _new_parts()

    if negative and not has_data:
        state["dob_parts"] = _new_parts()
        state["dob_fail"] = 0
        state.pop("confirmed_dob", None)
        return _reply(state, "restart")

    before = dict(parts)
    ambiguous = False
    if has_data:
        was_complete = _complete(parts)
        fresh = _new_parts()
        fresh_ambiguous = _apply(groups, fresh)
        if _complete(fresh) and not fresh_ambiguous:
            # The caller gave a whole date in one go: it replaces everything heard before, never mixes with it.
            parts = state["dob_parts"] = fresh
        else:
            lone_number = sum(1 for k, _ in groups if k == "num") == 1
            ambiguous = _apply(groups, parts, can_replace=was_complete and lone_number)
            if ambiguous:
                parts["year"] = parts["base"] = None  # a half-heard year is dropped, never the old year kept
    elif all(v is None for v in parts.values()) or state.get("dob_status") in _FAIL_STATUSES:
        # Nothing about a date was heard. Never answer from stale pieces of an earlier try.
        state["dob_fail"] = state.get("dob_fail", 0) + 1
        reply = _reply(state, "nothing", f"{_known(parts)}{_SAY['nothing']}" if any(parts.values()) else None)
        if state["dob_fail"] >= 2:
            reply["say"] = f"{reply['say']} {_SLOW_TIP}"
        return reply

    reply = _next(state, parts, ambiguous)
    status = reply["status"]
    if status not in _FAIL_STATUSES:
        state["dob_fail"] = 0
    elif parts == before:
        state["dob_fail"] = state.get("dob_fail", 0) + 1
    else:
        state["dob_fail"] = 0
    if status in _FAIL_STATUSES and state.get("dob_fail", 0) >= 2:
        reply["say"] = f"{reply['say']} {_SLOW_TIP}"
    return reply


def _known(parts: Dict[str, Optional[int]]) -> str:
    """What the code already has, so the caller hears that nothing was forgotten."""
    day, month = parts["day"], parts["month"]
    if day is not None and month is not None:
        return f"{number_words(day)} {_MONTH_NAMES[month]}, સમજાયું. "
    if day is not None:
        return f"{number_words(day)} તારીખ, સમજાયું. "
    if month is not None:
        return f"{_MONTH_NAMES[month]} મહિનો, સમજાયું. "
    return ""


def _days_in(month: int, year: int) -> int:
    first_of_next = date(year + (month == 12), month % 12 + 1, 1)
    return (first_of_next - date(year, month, 1)).days


def _bad_date_say(day: int, month: int, year: Optional[int]) -> str:
    if month == 2 and day == 29 and year is not None:
        return f"{year_words(year)}માં ફેબ્રુઆરીમાં ઓગણત્રીસ તારીખ નથી, કારણ કે એ લીપ વર્ષ નથી. સાચું વર્ષ કે તારીખ જણાવશો?"
    return f"{_MONTH_NAMES[month]} મહિનામાં {number_words(day)} તારીખ હોતી નથી. સાચી તારીખ જણાવશો?"


def _next(state: Dict[str, Any], parts: Dict[str, Optional[int]], ambiguous: bool) -> Dict[str, str]:
    today = date.today()
    base, year = parts["base"], parts["year"]
    if ambiguous and parts["day"] is not None and parts["month"] is not None:
        return _reply(state, "ambiguous_year", _known(parts) + _SAY["ambiguous_year"])
    if base is not None and base < MIN_YEAR:
        parts["base"] = None
        return _reply(state, "range")
    if year is not None and year < MIN_YEAR:
        parts["year"] = None
        return _reply(state, "range")
    if (year is not None and year > today.year) or (base is not None and base > today.year):
        parts["year"] = parts["base"] = None
        return _reply(state, "future")
    day, month = parts["day"], parts["month"]
    if day is not None and month is not None:
        probe_year = year if year is not None else 2000  # 2000 is a leap year: 29 Feb stays allowed
        if day > _days_in(month, probe_year):
            return _reply(state, "bad_date", _bad_date_say(day, month, year))
    if year is not None and day is not None and month is not None and date(year, month, day) > today:
        parts["year"] = None
        return _reply(state, "future")
    known = _known(parts)
    if day is None:
        return _reply(state, "need_day", known + _SAY["need_day"])
    if month is None:
        return _reply(state, "need_month", known + _SAY["need_month"])
    if base is not None:
        return _reply(state, "need_year_tail", f"{known}{_base_words(base)} પછીનું વર્ષ કયું?")
    if year is None:
        return _reply(state, "need_year", known + _SAY["need_year"])
    state["confirmed_dob"] = f"{day:02d}/{month:02d}/{year}"
    return _reply(
        state, "confirm", f"તમારી જન્મતારીખ {number_words(day)} {_MONTH_NAMES[month]}, {year_words(year)} છે, બરાબર?"
    )


def _reply(state: Dict[str, Any], status: str, say: Optional[str] = None) -> Dict[str, str]:
    state["dob_status"] = status
    if status != "confirm":
        state.pop("confirmed_dob", None)
    return {"status": status, "say": say or _SAY[status]}
