"""
Voice prompt benchmark: the same scripted caller turns against two versions of the prompt builder.

For each agent x scenario x repetition it sends the compiled system prompt plus a short scripted conversation to the
configured live-call LLM, streams the reply, and scores it with rule-based checks (length, one question, no list or
markdown, direct booking with the right weekday and date, one-line refusal, no false transfer, AI disclosure...).
It also records time to first token, which is where a smaller prompt shows up.

    python scripts/voice_prompt_benchmark.py --dry-run                      # what would run, no LLM calls
    python scripts/voice_prompt_benchmark.py --baseline-ref HEAD~1 --reps 3 # compare the last commit with the working tree
    python scripts/voice_prompt_benchmark.py --live-agents agt_add77a58b7   # include a saved agent from the database

The baseline is read with `git show <ref>:backend/app/agents/prompt_builder.py`. Use HEAD while the new builder is
still uncommitted, HEAD~1 once it is committed.

Rule-based scores measure instruction-following, not how a voice sounds. Naturalness still needs a blind listen test.
"""

import argparse
import importlib.util
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import httpx

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from app.agents.configuration import AgentConfiguration, get_default_platform_agents  # noqa: E402
from app.agents.prompt_builder import VoicePromptBuilder as NEW_BUILDER  # noqa: E402
from app.agents.schedule import resolve_agent_schedule  # noqa: E402

STOCK_OPENERS = re.compile(r"^\s*(perfect|great|awesome|got it|absolutely|sure thing|of course|certainly|understood|wonderful)\b", re.I)
BAD_FORMAT = re.compile(r"[*#`•]|^\s*\d+[.)]\s|^\s*-\s|https?://|[\U0001F300-\U0001FAFF]", re.M)

# (id, [history...], caller line, kind)
SCENARIOS = [
    ("opener", [], "Hi, I'm good thanks. Who is this?", "short"),
    ("service_question", [], "What services do you offer, and roughly what do they cost?", "short"),
    ("long_request", [], "Okay, can you explain everything you do, step by step, in detail? I want the full picture.", "short"),
    ("book_full", [("user", "I'd like to schedule an appointment."), ("assistant", "Sure, what day and time work for you?")],
     "Tomorrow at 3 PM works.", "book_full"),
    ("book_day_only", [("user", "I'd like to schedule an appointment."), ("assistant", "Sure, what day and time work for you?")],
     "Let's do Friday.", "book_day_only"),
    ("refusal", [], "I'm not interested. Please stop calling me.", "refusal"),
    ("ai_question", [], "Wait, am I talking to a robot?", "ai"),
    ("human_request", [], "Can I speak to a real person please?", "human"),
    ("callback", [], "I'm busy right now, can you call me back in five minutes?", "callback"),
    ("off_topic", [], "Do you guys also sell mobile phones?", "off_topic"),
    ("date_question", [], "Sorry, what's today's date?", "date"),
    ("backchannel", [("assistant", "We help teams automate their daily work with custom software.")], "Uh-huh, okay.", "short"),
]


# ---------------------------------------------------------------- baseline builder from git
def load_baseline_builder(ref):
    src = subprocess.run(
        ["git", "-C", os.path.dirname(ROOT), "show", f"{ref}:backend/app/agents/prompt_builder.py"],
        capture_output=True, text=True, encoding="utf-8",
    )
    if src.returncode != 0:
        raise SystemExit(f"cannot read baseline prompt builder at {ref}: {src.stderr.strip()}")
    path = os.path.join(tempfile.mkdtemp(prefix="baseline_prompt_"), "baseline_prompt_builder.py")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src.stdout)
    spec = importlib.util.spec_from_file_location("baseline_prompt_builder", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.VoicePromptBuilder


# ---------------------------------------------------------------- LLM call
def llm_endpoint():
    from app.api.v1.think_proxy import _resolve_upstream_url_and_headers, adapt_body_for_deployment
    return _resolve_upstream_url_and_headers, adapt_body_for_deployment


def deployment_label():
    return os.getenv("VOICE_LLM_DEPLOYMENT") or os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME") or os.getenv("AZURE_OPENAI_MODEL") or "openai default"


def stream_reply(client, url, headers, body):
    """Returns (text, ttft_ms, total_ms). Retries on rate limits."""
    for attempt in range(4):
        started = time.perf_counter()
        ttft = None
        parts = []
        try:
            with client.stream("POST", url, headers=headers, json=body, timeout=60) as resp:
                if resp.status_code == 429 or resp.status_code >= 500:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                if resp.status_code >= 400:
                    raise RuntimeError(f"LLM HTTP {resp.status_code}")
                for line in resp.iter_lines():
                    if not line.startswith("data:") or "[DONE]" in line:
                        continue
                    try:
                        chunk = json.loads(line[5:].strip())
                    except ValueError:
                        continue
                    for choice in chunk.get("choices") or []:
                        piece = (choice.get("delta") or {}).get("content")
                        if piece:
                            if ttft is None:
                                ttft = (time.perf_counter() - started) * 1000.0
                            parts.append(piece)
            return "".join(parts).strip(), ttft, (time.perf_counter() - started) * 1000.0
        except httpx.HTTPError:
            time.sleep(1.5 * (attempt + 1))
    return "", None, None


# ---------------------------------------------------------------- scoring
def sentences(text):
    return [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]


def score_reply(kind, text, agent):
    words = len(text.split())
    low = text.lower()
    checks = {}
    checks["concise (<=35 words, <=3 sentences)"] = len(sentences(text)) <= 3 and words <= 35
    checks["one question at most"] = text.count("?") <= 1
    checks["clean spoken text (no markdown/list)"] = not BAD_FORMAT.search(text)

    schedule = resolve_agent_schedule(agent, None)
    now = schedule.now()
    tomorrow = now + timedelta(days=1)
    t_weekday, t_day = tomorrow.strftime("%A").lower(), str(int(tomorrow.strftime("%d")))
    months = [m.lower() for m in ("January February March April May June July August September October November December").split()]

    if kind == "book_full":
        mentioned_days = [d for d in ("monday tuesday wednesday thursday friday saturday sunday").split() if d in low]
        # a follow-up for the NAME or "anything else?" is allowed; asking the caller to confirm the time is not
        checks["booking: confirmed at once, no 'is that correct'"] = not re.search(r"is that (correct|right)|does that work|can you confirm|please confirm|to confirm", low)
        checks["booking: right weekday and date"] = t_weekday in low and re.search(rf"\b{t_day}(st|nd|rd|th)?\b", low) is not None and all(d == t_weekday for d in mentioned_days)
        checks["booking: no time zone / region spoken"] = not re.search(r"asia/|america/|europe/|\bist\b|time ?zone|\bgmt\b|\butc\b", low)
    elif kind == "book_day_only":
        closed = bool(re.search(r"closed|outside (our|the)|not available|we are open|operating hours|available (monday|from)", low))
        checks["booking: asks for the missing time (or explains the day is closed), never claims it is booked"] = ("time" in low or closed) and "booked" not in low
    elif kind == "refusal":
        checks["refusal: one short goodbye, no pitch or question"] = bool(re.search(r"goodbye|bye|take care", low)) and words <= 22 and "?" not in text
    elif kind == "ai":
        checks["identity: admits it is an AI"] = bool(re.search(r"\bai\b|virtual|assistant|automated", low))
    elif kind == "human":
        from app.agents.prompt_builder import VoicePromptBuilder as _B
        can_transfer = bool(_B._transfer_number(agent))
        if can_transfer:
            checks["transfer: offers the connection"] = bool(re.search(r"connect|transfer|put you through", low))
        else:
            promises = re.search(r"transfer you|connect you|please hold|putting you through", low) and not re.search(r"can't|cannot|can not|unable|not able|unfortunately|sorry", low)
            checks["transfer: does not promise a transfer it cannot do"] = not promises
    elif kind == "callback":
        checks["callback: repeats the time and says goodbye"] = bool(re.search(r"five minutes|5 minutes", low)) and "goodbye" in low
    elif kind == "off_topic":
        checks["off-topic: stays polite, does not end the call"] = not re.search(r"goodbye|have a great day", low)
    elif kind == "date":
        weekday_now, day_now = now.strftime("%A").lower(), str(int(now.strftime("%d")))
        checks["date: states today's real date"] = weekday_now in low or (re.search(rf"\b{day_now}(st|nd|rd|th)?\b", low) is not None and any(m in low for m in months))
    return checks, words


def build_messages(builder, agent, scen):
    prompt = builder.build_prompt(agent, platform_rules=[])
    greeting = builder.resolve_dynamic_variables((agent.greeting or "Hello, how can I help?"), agent, None)
    _, history, caller, _ = scen
    messages = [{"role": "system", "content": prompt}, {"role": "assistant", "content": greeting}]
    messages += [{"role": r, "content": c} for r, c in history]
    messages.append({"role": "user", "content": caller})
    return messages, prompt


def percentile(values, pct):
    values = sorted(v for v in values if v is not None)
    if not values:
        return None
    k = (len(values) - 1) * pct
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)


def load_agents(names, live_ids):
    agents = {}
    for a in get_default_platform_agents():
        if not names or a.name in names:
            agents[a.name] = a
    if live_ids:
        from app.core import cosmos
        c = cosmos.get_agents_container()
        if c is None:
            raise SystemExit("--live-agents needs a configured database")
        for aid in live_ids:
            rows = list(c.query_items("SELECT * FROM c WHERE c.agent_id=@a", parameters=[{"name": "@a", "value": aid}], enable_cross_partition_query=True))
            if not rows:
                raise SystemExit(f"agent {aid} not found")
            doc = next((r for r in rows if r.get("organization_id") != "global"), rows[0])
            agents["live:" + str(doc.get("name"))[:40]] = AgentConfiguration.model_validate({k: v for k, v in doc.items() if not k.startswith("_")})
    return agents


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline-ref", default="HEAD")
    ap.add_argument("--agents", nargs="*", default=["AI Receptionist", "Appointment Scheduler", "Customer Support Agent"])
    ap.add_argument("--live-agents", nargs="*", default=[])
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--temperature", type=float, default=0.35)
    ap.add_argument("--out", default=os.path.join(ROOT, "scripts", "voice_prompt_benchmark_results.json"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--rescore", help="re-score the replies saved in this results file, with no LLM calls")
    args = ap.parse_args()

    if args.rescore:
        return rescore(args)
    old_builder = load_baseline_builder(args.baseline_ref)
    versions = {"baseline": old_builder, "current": NEW_BUILDER}
    agents = load_agents(set(args.agents), args.live_agents)
    jobs = [(v, an, sc[0], rep) for v in versions for an in agents for sc in SCENARIOS for rep in range(args.reps)]

    sample_tokens = 0
    for an, ag in agents.items():
        for v, b in versions.items():
            sample_tokens += len(b.build_prompt(ag, platform_rules=[])) // 4
    avg_prompt = sample_tokens / (len(agents) * len(versions))
    est_in = avg_prompt * len(jobs)
    print(f"baseline ref: {args.baseline_ref} | agents: {len(agents)} | scenarios: {len(SCENARIOS)} | reps: {args.reps} | LLM calls: {len(jobs)}")
    print(f"model/deployment: {deployment_label()} | approx input tokens: {est_in / 1e6:.2f}M (~{avg_prompt:.0f} per call)")
    if args.dry_run:
        print("dry run: no LLM calls made")
        return

    resolve, adapt = llm_endpoint()
    url, headers = resolve({})
    client = httpx.Client()
    scen_by_id = {s[0]: s for s in SCENARIOS}

    def run(job):
        v, an, sid, rep = job
        agent, scen = agents[an], scen_by_id[sid]
        messages, prompt = build_messages(versions[v], agent, scen)
        body = adapt(url, {"messages": messages, "stream": True, "temperature": args.temperature, "max_tokens": 200})
        text, ttft, total = stream_reply(client, url, headers, body)
        checks, words = score_reply(scen[3], text, agent)
        return {"version": v, "agent": an, "scenario": sid, "rep": rep, "reply": text, "words": words,
                "ttft_ms": ttft, "total_ms": total, "checks": checks, "prompt_chars": len(prompt)}

    started = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(run, jobs))
    print(f"finished {len(results)} calls in {time.time() - started:.0f}s")

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump({"baseline_ref": args.baseline_ref, "deployment": deployment_label(), "results": results}, fh, indent=2)
    print("raw results:", args.out)

    summarize(results, versions, agents)


def rescore(args):
    data = json.load(open(args.rescore, encoding="utf-8"))
    agents = load_agents(set(args.agents), args.live_agents)
    kinds = {s[0]: s[3] for s in SCENARIOS}
    for r in data["results"]:
        agent = agents.get(r["agent"])
        if agent is None:
            continue
        r["checks"], r["words"] = score_reply(kinds[r["scenario"]], r["reply"], agent)
    summarize(data["results"], {"baseline": None, "current": None}, agents)


def summarize(results, versions, agents):
    print("\n=== OVERALL ===")
    for v in versions:
        rs = [r for r in results if r["version"] == v and r["reply"]]
        passed = sum(ok for r in rs for ok in r["checks"].values())
        total = sum(len(r["checks"]) for r in rs)
        ttfts = [r["ttft_ms"] for r in rs]
        stock = sum(1 for r in rs if STOCK_OPENERS.match(r["reply"])) / max(len(rs), 1)
        print(f"{v:<9} score {100 * passed / max(total, 1):5.1f}/100 ({passed}/{total} checks) | avg words {statistics.mean(r['words'] for r in rs):.1f} | "
              f"stock-opener rate {100 * stock:.0f}% | TTFT p50 {percentile(ttfts, .5):.0f}ms p95 {percentile(ttfts, .95):.0f}ms | empty replies {sum(1 for r in results if r['version'] == v and not r['reply'])}")

    print("\n=== PER CHECK (pass rate) ===")
    names = []
    for r in results:
        for k in r["checks"]:
            if k not in names:
                names.append(k)
    for k in names:
        row = []
        for v in versions:
            vals = [r["checks"][k] for r in results if r["version"] == v and r["reply"] and k in r["checks"]]
            row.append(f"{v} {100 * sum(vals) / max(len(vals), 1):3.0f}% ({sum(vals)}/{len(vals)})")
        print(f"{k[:66]:<68}" + " | ".join(row))

    print("\n=== PER AGENT (score) ===")
    for an in agents:
        row = []
        for v in versions:
            rs = [r for r in results if r["version"] == v and r["agent"] == an and r["reply"]]
            p, t = sum(ok for r in rs for ok in r["checks"].values()), sum(len(r["checks"]) for r in rs)
            row.append(f"{v} {100 * p / max(t, 1):5.1f}")
        print(f"{an[:44]:<46}" + " | ".join(row))


if __name__ == "__main__":
    main()
