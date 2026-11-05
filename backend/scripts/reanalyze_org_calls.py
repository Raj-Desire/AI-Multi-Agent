"""Scores an organisation's existing calls again against each call's own agent goal.

Calls analysed before goal-based scoring used a fixed sales checklist, so a booked visit or a fully answered question
could show as "Asked Details" with a middling score. This rewrites the saved score, outcome, summary and calendar
appointment of the calls it analyses, so it asks for the organisation id and defaults to a dry run that changes nothing.

    python scripts/reanalyze_org_calls.py <organization_id>            # dry run, prints before -> after
    python scripts/reanalyze_org_calls.py <organization_id> --apply    # saves the new analysis
    python scripts/reanalyze_org_calls.py <organization_id> --apply --limit 40
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from app.repositories.call_repository import CallRepository  # noqa: E402
from app.services.appointment_time import agent_timezone  # noqa: E402
from app.services.call_analytics_service import CallAnalyticsService  # noqa: E402
from app.services.call_session_service import CallSessionService  # noqa: E402


async def main(org_id: str, apply: bool, limit: int) -> None:
    repo = CallRepository()
    svc = CallSessionService(repo)
    if apply:
        def show(r):  # printed as each call is saved, so the terminal shows progress
            print(f"{r['call_id'][:14]} | {str(r['agent'])[:24]:24} | {r['before_score']} {str(r['before_outcome'])[:18]:18} -> "
                  f"{r['after_score']} {str(r['after_outcome'])[:16]:16} | goal={r['goal']}", flush=True)
        print("re-analysing, one line per call as it is saved...", flush=True)
        rows = await svc.reanalyze_calls(org_id, limit=limit, on_row=show)
        print(f"re-analysed and saved: {len(rows)} call(s)")
        return
    calls = [c for c in await repo.list_all_calls(limit=limit * 5)
             if c.organization_id == org_id and not getattr(c, "is_test", False)
             and any(t.get("role") in ("user", "customer") for t in (c.transcript or []))]
    calls.sort(key=lambda c: str(c.created_at), reverse=True)
    for c in calls[:limit]:
        a = await CallAnalyticsService().analyze_call_transcript(
            [dict(t) for t in c.transcript], call_duration=c.duration or 0, call_status=c.status or "completed",
            timezone_iana=agent_timezone(c.agent_config_snapshot), **await svc._analysis_inputs(org_id, c.agent_config_snapshot)) or {}
        print(f"{str(c.created_at)[5:16]} {c.id[:12]} | {str(c.agent_name)[:22]:22} | {c.lead_score} {str(c.business_outcome)[:16]:16} -> "
              f"{a.get('lead_score')} {str(a.get('business_outcome'))[:16]:16} goal={a.get('goal_status')}")
    print("dry run: nothing was saved")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("organization_id")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=80)
    args = ap.parse_args()
    asyncio.run(main(args.organization_id, args.apply, args.limit))
