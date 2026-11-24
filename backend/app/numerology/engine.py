"""Deterministic birth-date numerology (Lo Shu grid). No LLM is involved in any number here.

Rules approved by the specialist:
  * Day: list its digits; when it has two digits also add them (22 -> 2, 2 and 2+2 = 4). A single digit is used as is.
    A 0 is never counted, so 30 -> just 3 and 10 -> just 1 (never 3+0 or 1+0).
  * Month: same as the day (05 -> just 5, never 5+0; 11 -> 1, 1 and 2; 10 -> just 1).
  * Year: add its digits; zeros are ignored (2005 -> 7).
  * Total: add every digit of day, month and year.
  * A sum above 9 is added again until one digit is left (10 -> 1, 25 -> 7, 37 -> 1).
Only present / missing matters for now; repeat counts and number pairs are not used.
"""

import re
from datetime import date
from typing import Dict, List

from pydantic import BaseModel

METHOD = "lo_shu_v1"
GRID = [[4, 9, 2], [3, 5, 7], [8, 1, 6]]
MIN_YEAR = 1900

_DOB = re.compile(r"^\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})\s*$")


class NumerologyResult(BaseModel):
    dob: str
    method: str = METHOD
    derived: Dict[str, int]
    present: List[int]
    missing: List[int]
    grid: List[List[int]] = GRID


def reduce_digit(n: int) -> int:
    """Adds digits until one digit is left. 0 stays 0."""
    while n > 9:
        n = sum(int(c) for c in str(n))
    return n


def _digits(n: int, width: int = 0) -> List[int]:
    return [int(c) for c in str(n).zfill(width)]


def _part(value: int) -> tuple:
    """(digits that land in the grid, reduced sum) for a day or a month."""
    digits = [d for d in _digits(value) if d]  # a 0 is never counted (10 -> 1, 30 -> 3)
    if len(digits) <= 1:
        return digits, (digits[0] if digits else 0)
    return digits, reduce_digit(sum(digits))


def parse_dob(dob: str) -> date:
    match = _DOB.match(dob or "")
    if not match:
        raise ValueError("Date of birth must look like DD/MM/YYYY")
    day, month, year = (int(g) for g in match.groups())
    try:
        parsed = date(year, month, day)
    except ValueError as exc:
        raise ValueError("That is not a real calendar date") from exc
    if year < MIN_YEAR or parsed > date.today():
        raise ValueError("Date of birth is outside the supported range")
    return parsed


def calculate(dob: str) -> NumerologyResult:
    parsed = parse_dob(dob)
    day_digits, day_sum = _part(parsed.day)
    month_digits, month_sum = _part(parsed.month)
    year_digits = _digits(parsed.year)
    year_sum = reduce_digit(sum(year_digits))
    all_digits = _digits(parsed.day, 2) + _digits(parsed.month, 2) + year_digits
    total = reduce_digit(sum(all_digits))

    present = {d for d in day_digits + month_digits + year_digits if d}
    present |= {n for n in (day_sum, month_sum, year_sum, total) if n}
    return NumerologyResult(
        dob=f"{parsed.day:02d}/{parsed.month:02d}/{parsed.year}",
        derived={"day_sum": day_sum, "month_sum": month_sum, "year_sum": year_sum, "total": total},
        present=sorted(present),
        missing=[n for n in range(1, 10) if n not in present],
    )
