import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Phone,
  Mail,
  Building,
  Megaphone,
  Bot,
  X,
  User,
  PhoneForwarded,
  ExternalLink,
} from "lucide-react";
import { fetchApi, LIVE } from "../../api-client";
import { CalendarEvent, CampaignLeadStat, AgentLeadStat } from "../../types";
import { Button } from "../ui/Button";

type View = "month" | "week" | "day" | "agenda";

interface CalendarViewProps {
  campaigns: CampaignLeadStat[];
  agents: AgentLeadStat[];
  refreshKey?: number;
  onSelectProspect: (prospectId: string) => void;
}

const DAY_MS = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(startOfDay(d), -startOfDay(d).getDay());
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const timeFmt = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const TYPE_STYLE: Record<string, string> = {
  meeting: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  callback: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
};
const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  missed: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  cancelled: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

function rangeFor(view: View, cursor: Date): { from: Date; to: Date } {
  if (view === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const from = startOfWeek(first);
    return { from, to: addDays(from, 42) };
  }
  if (view === "week") {
    const from = startOfWeek(cursor);
    return { from, to: addDays(from, 7) };
  }
  if (view === "day") {
    const from = startOfDay(cursor);
    return { from, to: addDays(from, 1) };
  }
  const from = startOfDay(cursor);
  return { from, to: addDays(from, 30) };
}

function titleFor(view: View, cursor: Date): string {
  if (view === "month") return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (view === "day") return cursor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const { from, to } = rangeFor(view, cursor);
  const end = addDays(to, -1);
  return `${from.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function CalendarView({ campaigns, agents, refreshKey = 0, onSelectProspect }: CalendarViewProps) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const { from, to } = useMemo(() => rangeFor(view, cursor), [view, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (campaignFilter !== "all") params.set("campaign_id", campaignFilter);
      if (agentFilter !== "all") params.set("agent_id", agentFilter);
      const rows = await fetchApi<CalendarEvent[]>(`/lead-intelligence/calendar?${params.toString()}`, LIVE);
      setEvents(rows || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load calendar.");
    } finally {
      setLoading(false);
    }
  }, [from, to, typeFilter, campaignFilter, agentFilter]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = startOfDay(new Date(ev.start_at_utc)).toDateString();
      map.set(key, [...(map.get(key) || []), ev]);
    }
    return map;
  }, [events]);

  const eventsOn = (d: Date) => byDay.get(d.toDateString()) || [];

  const step = (dir: -1 | 1) => {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else if (view === "week") setCursor(addDays(cursor, 7 * dir));
    else if (view === "day") setCursor(addDays(cursor, dir));
    else setCursor(addDays(cursor, 30 * dir));
  };

  const chip = (ev: CalendarEvent) => (
    <button
      key={ev.id}
      onClick={(e) => {
        e.stopPropagation();
        setSelected(ev);
      }}
      title={ev.title}
      className={`w-full text-left truncate px-1.5 py-0.5 rounded border text-[11px] font-medium cursor-pointer ${TYPE_STYLE[ev.type] || TYPE_STYLE.meeting} ${ev.status === "missed" ? "opacity-60" : ""} ${ev.status === "cancelled" ? "line-through opacity-50" : ""}`}
    >
      {timeFmt(ev.start_at_utc)} {ev.prospect_name || ev.title}
    </button>
  );

  const dayColumn = (d: Date, tall = false) => {
    const list = eventsOn(d);
    return (
      <div
        key={d.toDateString()}
        className={`border-t border-l border-[var(--color-border)] p-1.5 space-y-1 ${tall ? "min-h-[260px]" : "min-h-[96px]"} ${
          view === "month" && d.getMonth() !== cursor.getMonth() ? "bg-[var(--color-background)]/50" : ""
        }`}
      >
        <div
          className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
            sameDay(d, new Date()) ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted)]"
          }`}
        >
          {d.getDate()}
        </div>
        {(tall ? list : list.slice(0, 3)).map(chip)}
        {!tall && list.length > 3 && (
          <button
            onClick={() => {
              setCursor(d);
              setView("day");
            }}
            className="text-[11px] text-[var(--color-primary)] font-semibold cursor-pointer"
          >
            +{list.length - 3} more
          </button>
        )}
      </div>
    );
  };

  const agendaRow = (ev: CalendarEvent) => (
    <button
      key={ev.id}
      onClick={() => setSelected(ev)}
      className="w-full text-left p-3 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3"
    >
      <div className="space-y-0.5 min-w-0">
        <div className="text-xs font-bold text-[var(--color-heading)] truncate">{ev.title}</div>
        <div className="text-[11px] text-[var(--color-muted)]">
          {dateFmt(ev.start_at_utc)} · {timeFmt(ev.start_at_utc)} · {ev.campaign_name || "Direct call"} · {ev.agent_name || "Agent"}
        </div>
      </div>
      <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${TYPE_STYLE[ev.type]}`}>{ev.type}</span>
    </button>
  );

  const select = "text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-2 py-1.5";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(startOfDay(new Date()))}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => step(1)} aria-label="Next"><ChevronRight className="w-4 h-4" /></Button>
          <h3 className="text-sm font-bold text-[var(--color-heading)] ml-1">{titleFor(view, cursor)}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
            <option value="all">All types</option>
            <option value="meeting">Meetings</option>
            <option value="callback">Call-backs</option>
          </select>
          <select className={select} value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} aria-label="Campaign">
            <option value="all">All campaigns</option>
            {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</option>)}
          </select>
          <select className={select} value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} aria-label="Agent">
            <option value="all">All agents</option>
            {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
          </select>
          <div className="flex rounded-md border border-[var(--color-border)] overflow-hidden">
            {(["month", "week", "day", "agenda"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                  view === v ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] text-[var(--color-muted)]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="text-xs text-rose-600 px-1">{error}</div>}

      {/* Body */}
      <div className={`rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden ${loading ? "opacity-70" : ""}`}>
        {view === "agenda" ? (
          <div className="p-3 space-y-2">
            {events.length === 0 && !loading ? <EmptyState /> : events.map(agendaRow)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 text-[11px] font-semibold text-[var(--color-muted)] bg-[var(--color-background)]/60">
              {(view === "day" ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))).map((d) => (
                <div key={d.toDateString()} className={`px-2 py-1.5 ${view === "day" ? "col-span-7" : ""}`}>
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
              ))}
            </div>
            <div className={`grid ${view === "day" ? "grid-cols-1" : "grid-cols-7"}`}>
              {Array.from({ length: Math.round((to.getTime() - from.getTime()) / DAY_MS) }, (_, i) => addDays(from, i)).map((d) =>
                dayColumn(d, view !== "month")
              )}
            </div>
            {events.length === 0 && !loading && <div className="p-6"><EmptyState /></div>}
          </>
        )}
      </div>

      {/* Details drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-md h-full bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl overflow-y-auto p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-base font-bold text-[var(--color-heading)]">{selected.title}</h4>
                <div className="flex gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${TYPE_STYLE[selected.type]}`}>{selected.type}</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${STATUS_STYLE[selected.status] || STATUS_STYLE.scheduled}`}>{selected.status}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="cursor-pointer text-[var(--color-muted)]" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-2 text-xs text-[var(--color-text)]">
              <Row icon={<CalendarIcon className="w-3.5 h-3.5" />}>{dateFmt(selected.start_at_utc)}</Row>
              <Row icon={<Clock className="w-3.5 h-3.5" />}>
                {timeFmt(selected.start_at_utc)} – {timeFmt(selected.end_at_utc)}
                <span className="text-[var(--color-muted)]"> (your time) · agreed in {selected.timezone}</span>
              </Row>
              <Row icon={<User className="w-3.5 h-3.5" />}>{selected.prospect_name || "Prospect"}</Row>
              {selected.phone && <Row icon={<Phone className="w-3.5 h-3.5" />}><span className="font-mono">{selected.phone}</span></Row>}
              {selected.email && <Row icon={<Mail className="w-3.5 h-3.5" />}>{selected.email}</Row>}
              {selected.company && <Row icon={<Building className="w-3.5 h-3.5" />}>{selected.company}</Row>}
              <Row icon={<Megaphone className="w-3.5 h-3.5" />}>{selected.campaign_name || "Direct call"}</Row>
              <Row icon={<Bot className="w-3.5 h-3.5" />}>Booked by {selected.agent_name || "AI agent"}</Row>
            </div>

            {selected.summary && (
              <div className="p-3 rounded-md bg-[var(--color-background)]/70 border border-[var(--color-border)]/60 text-xs text-[var(--color-muted)] leading-relaxed">
                <span className="font-semibold text-[var(--color-heading)]">Call summary: </span>{selected.summary}
              </div>
            )}
            {selected.next_action && (
              <div className="text-xs"><span className="font-semibold text-[var(--color-heading)]">Next action: </span>{selected.next_action}</div>
            )}

            {selected.history?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[var(--color-heading)]">History</div>
                {selected.history.map((h, i) => (
                  <div key={i} className="text-[11px] text-[var(--color-muted)]">
                    {new Date(h.at).toLocaleString()} · {h.event}
                  </div>
                ))}
              </div>
            )}

            {selected.prospect_id && (
              <Button size="sm" variant="outline" onClick={() => { onSelectProspect(selected.prospect_id!); setSelected(null); }}>
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open lead
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-[var(--color-muted)]">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-10 text-center space-y-2">
      <div className="mx-auto w-11 h-11 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
        <PhoneForwarded className="w-5 h-5" />
      </div>
      <div className="text-sm font-bold text-[var(--color-heading)]">No bookings in this period</div>
      <p className="text-xs text-[var(--color-muted)] max-w-sm mx-auto">
        Meetings and agreed call-back times captured by your agents during calls and campaigns appear here.
      </p>
    </div>
  );
}
