"""What the numerology agent worked out on a call, for the people who follow the lead up afterwards.

The agent never names the weak Grahas to the caller in the first reading, so this is where the team sees them: the date of
birth the caller confirmed and the Grahas that are missing for it, shown on the lead's AI Call Analysis.
"""

from datetime import datetime
from typing import Any, Dict, List

from app.numerology import knowledge

_ENGLISH = {1: "Sun", 2: "Moon", 3: "Jupiter", 4: "Rahu", 5: "Mercury", 6: "Venus", 7: "Ketu", 8: "Saturn", 9: "Mars"}


def _date_label(dob: str) -> str:
    try:
        return datetime.strptime(dob, "%d/%m/%Y").strftime("%d %B %Y")
    except ValueError:
        return dob


def build(state: Dict[str, Any]) -> List[Dict[str, str]]:
    """[{"label", "value"}, ...] from the per-call numerology state; empty when no date of birth was understood."""
    result = state.get("result")
    dob = result.dob if result is not None else state.get("confirmed_dob")
    if not dob:
        return []
    details = [{"label": "Date of birth (confirmed on the call)", "value": _date_label(dob)}]
    if result is not None:
        names = [f"{knowledge.graha_name(n)} ({_ENGLISH[n]})" for n in result.missing]
        details.append({
            "label": "Missing Grahas (not named to the caller)",
            "value": ", ".join(names) if names else "None: every number is present",
        })
    return details
