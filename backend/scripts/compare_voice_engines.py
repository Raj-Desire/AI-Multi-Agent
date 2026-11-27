"""Compares the Standard and Economy voice engines from stored call records (read only, nothing is written).

    python scripts/compare_voice_engines.py --org org_24dfa5d8
    python scripts/compare_voice_engines.py --org org_24dfa5d8 --agent AGENT_ID --since 2026-11-01 --json

It prints one column per engine and a PASS/FAIL list against the success criteria of the design, using only what the
stored data can show. Calls recorded before the engine was stored are shown as "unknown".
"""
import argparse
import json
import math
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.cost_calculator import engine_cost_per_minute  # noqa: E402

# Estimated price of a paid voice plan in USD per 1,000 characters spoken; an estimate, not a quoted rate. It can be
# replaced with the COST_VOICE_PER_1K_CHARS environment variable (finite, non-negative) so reports stay comparable.
DEFAULT_VOICE_COST_PER_1K_CHARS = 0.045
SILENCE_LIMIT_S = 6.0
MEDIAN_LIMIT_S = 1.8
COST_LIMIT_PER_MINUTE_USD = 0.0474  # INR 4.5 at INR 95 per USD

_LABELS = {"managed": "Standard", "custom": "Economy", "unknown": "Older calls"}
_ORDER = ["managed", "custom", "unknown"]


def _voice_rate(explicit: Optional[float]) -> float:
    if explicit is not None:
        return explicit
    raw = os.getenv("COST_VOICE_PER_1K_CHARS")
    if raw is not None:
        try:
            v = float(raw)
            if math.isfinite(v) and v >= 0:
                return v
        except (TypeError, ValueError):
            pass
    return DEFAULT_VOICE_COST_PER_1K_CHARS


def _parse(ts) -> Optional[datetime]:
    if not isinstance(ts, str) or not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt


def _delta(a: datetime, b: datetime) -> Optional[float]:
    try:
        return (b - a).total_seconds()
    except TypeError:  # one side has a timezone and the other does not
        return None


def _percentile(sorted_values: List[float], p: float) -> float:
    """Percentile by linear interpolation between closest ranks (the usual definition), without numpy."""
    k = (len(sorted_values) - 1) * p
    lo = math.floor(k)
    hi = math.ceil(k)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (k - lo)


def _reply_delays(transcript) -> List[float]:
    entries = [e for e in (transcript or []) if isinstance(e, dict)]
    delays: List[float] = []
    for i, e in enumerate(entries):
        if e.get("role") != "user":
            continue
        start = _parse(e.get("timestamp"))
        if start is None:
            continue
        nxt = next((x for x in entries[i + 1:] if x.get("role") == "assistant"), None)
        if nxt is None:
            continue
        end = _parse(nxt.get("timestamp"))
        if end is None:
            continue
        d = _delta(start, end)
        if d is not None and d >= 0:
            delays.append(d)
    return delays


def _chars_spoken(transcript) -> int:
    return sum(len(e.get("content") or "") for e in (transcript or [])
               if isinstance(e, dict) and e.get("role") == "assistant" and isinstance(e.get("content"), str))


def summarize(calls: List[dict], *, voice_cost_per_1k_chars: Optional[float] = None) -> Dict[str, dict]:
    """Groups call records by `voice_engine` ("unknown" when missing) and returns per-engine figures.

    The reply delay of a turn is the time from a caller transcript entry to the next agent entry. The agent timestamp
    is when the agent's text event arrived, so this approximates the time to first audio and slightly under-reports
    it. Median and p90 use the standard "linear interpolation between closest ranks" percentile, without numpy.
    Interruption counts are not stored on a call, so they are not reported. Engines with no calls are absent.
    """
    rate = _voice_rate(voice_cost_per_1k_chars)
    groups: Dict[str, List[dict]] = {}
    for c in calls:
        groups.setdefault(c.get("voice_engine") or "unknown", []).append(c)
    ordered = [k for k in _ORDER if k in groups] + sorted(k for k in groups if k not in _ORDER)
    result: Dict[str, dict] = {}
    for engine in ordered:
        group = groups[engine]
        seconds = sum(float(c.get("duration") or 0) for c in group)
        delays: List[float] = []
        silent = 0
        chars = 0
        for c in group:
            d = _reply_delays(c.get("transcript"))
            delays.extend(d)
            if any(x > SILENCE_LIMIT_S for x in d):
                silent += 1
            chars += _chars_spoken(c.get("transcript"))
        minutes = seconds / 60
        s = sorted(delays)
        engine_cost = engine_cost_per_minute(engine)["total_per_minute"]
        voice_cost = (chars / 1000 * rate / minutes) if minutes > 0 else None
        result[engine] = {
            "calls": len(group),
            "minutes": round(minutes, 2),
            "reply_delay_median_s": round(_percentile(s, 0.5), 2) if s else None,
            "reply_delay_p90_s": round(_percentile(s, 0.9), 2) if s else None,
            "reply_delay_samples": len(s),
            "disconnected_calls": sum(1 for c in group if c.get("outcome") == "VOICE_ENGINE_DISCONNECTED"),
            "silence_over_6s_calls": silent,
            "chars_spoken": chars,
            "engine_cost_per_minute_usd": engine_cost,
            "voice_cost_per_minute_usd": voice_cost,
            "total_cost_per_minute_usd": (engine_cost + voice_cost) if voice_cost is not None else None,
        }
    return result


def _fmt(v, nd=2):
    if v is None:
        return "-"
    return f"{v:.{nd}f}" if isinstance(v, float) else str(v)


def render_table(summary: Dict[str, dict]) -> str:
    engines = list(summary)
    rows = [
        ("calls", "calls", 0), ("minutes", "minutes", 2), ("reply delay median (s)", "reply_delay_median_s", 2),
        ("reply delay p90 (s)", "reply_delay_p90_s", 2), ("reply delay samples", "reply_delay_samples", 0),
        ("disconnected calls", "disconnected_calls", 0), ("calls with silence > 6 s", "silence_over_6s_calls", 0),
        ("characters spoken", "chars_spoken", 0), ("engine cost / min (USD)", "engine_cost_per_minute_usd", 4),
        ("voice cost / min (USD)", "voice_cost_per_minute_usd", 4), ("total cost / min (USD)", "total_cost_per_minute_usd", 4),
    ]
    label_w = max(len(r[0]) for r in rows)
    col_w = max([12] + [len(_LABELS.get(e, e)) for e in engines])
    lines = ["".ljust(label_w) + "  " + "  ".join(_LABELS.get(e, e).rjust(col_w) for e in engines)]
    for label, key, nd in rows:
        cells = []
        for e in engines:
            v = summary[e][key]
            cells.append((_fmt(float(v), nd) if isinstance(v, (int, float)) and nd else _fmt(v, nd)).rjust(col_w))
        lines.append(label.ljust(label_w) + "  " + "  ".join(cells))
    return "\n".join(lines)


def render_checklist(summary: Dict[str, dict]) -> str:
    lines = ["Success criteria (Economy engine):"]
    c = summary.get("custom")
    if not c:
        lines.append("  no Economy calls found, nothing to judge")
    else:
        med = c["reply_delay_median_s"]
        ok = med is not None and med <= MEDIAN_LIMIT_S
        lines.append(f"  {'PASS' if ok else 'FAIL'}  median reply delay {_fmt(med)} s (limit {MEDIAN_LIMIT_S} s)")
        ok = c["silence_over_6s_calls"] == 0 and c["disconnected_calls"] == 0
        lines.append(f"  {'PASS' if ok else 'FAIL'}  no call with silence over {SILENCE_LIMIT_S:.0f} s or a dropped engine "
                     f"(silent: {c['silence_over_6s_calls']}, disconnected: {c['disconnected_calls']})")
        total = c["total_cost_per_minute_usd"]
        ok = total is not None and total <= COST_LIMIT_PER_MINUTE_USD
        lines.append(f"  {'PASS' if ok else 'FAIL'}  total cost per minute {_fmt(total, 4)} USD (limit {COST_LIMIT_PER_MINUTE_USD} USD)")
    lines.append("  N/A   interruption stops audio within 0.4 s: cannot be judged from stored data; "
                 "check it by listening to test calls")
    return "\n".join(lines)


def _fetch_calls(org_id: str, agent_id: Optional[str], since: Optional[str]) -> List[dict]:
    from app.core.cosmos import get_calls_container  # imported here so --help and tests need no database

    container = get_calls_container()
    if not container:
        raise SystemExit("Database is not configured (check the .env file).")
    query = ("SELECT c.id, c.voice_engine, c.duration, c.outcome, c.created_at, c.transcript, c.latency_metrics "
             "FROM c WHERE c.organization_id = @org")
    params = [{"name": "@org", "value": org_id}]
    if agent_id:
        query += " AND c.agent_id = @agent"
        params.append({"name": "@agent", "value": agent_id})
    if since:
        query += " AND c.created_at >= @since"
        params.append({"name": "@since", "value": since})
    return list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Compare the Standard and Economy voice engines from stored calls (read only).")
    ap.add_argument("--org", required=True, help="organization id")
    ap.add_argument("--agent", help="only calls of this agent id")
    ap.add_argument("--since", help="only calls created at or after this ISO date")
    ap.add_argument("--json", action="store_true", help="print the summary as JSON")
    args = ap.parse_args(argv)

    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

    calls = _fetch_calls(args.org, args.agent, args.since)
    if not calls:
        print("No calls found for this selection.")
        return 0
    summary = summarize(calls)
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(render_table(summary))
        print()
        print(render_checklist(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
