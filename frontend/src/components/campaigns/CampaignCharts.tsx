import React, { useMemo } from "react";
import { CampaignStats, CallRecord } from "../../types";
import {
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  CheckCircle2,
  Clock,
  PhoneCall,
  Activity,
  UserX,
  PhoneMissed,
  PhoneOff,
  Sparkles
} from "lucide-react";

interface CampaignChartsProps {
  stats: CampaignStats;
  calls?: CallRecord[];
}

export function CampaignCharts({ stats, calls = [] }: CampaignChartsProps) {
  // 1. Status Distribution Data
  const statusItems = useMemo(() => {
    const total = stats.total_prospects || 1;
    return [
      { label: "Connected", count: stats.connected, color: "#10b981", percent: Math.round((stats.connected / total) * 100) },
      { label: "Queued", count: stats.queued, color: "#3b82f6", percent: Math.round((stats.queued / total) * 100) },
      { label: "Calling", count: stats.calling, color: "#06b6d4", percent: Math.round((stats.calling / total) * 100) },
      { label: "No Answer", count: stats.no_answer, color: "#f59e0b", percent: Math.round((stats.no_answer / total) * 100) },
      { label: "Voicemail/Busy", count: (stats.busy || 0) + (stats.voicemail || 0), color: "#fbbf24", percent: Math.round((((stats.busy || 0) + (stats.voicemail || 0)) / total) * 100) },
      { label: "Failed", count: stats.failed, color: "#ef4444", percent: Math.round((stats.failed / total) * 100) },
      { label: "DNC Blocked", count: stats.dnc, color: "#a855f7", percent: Math.round((stats.dnc / total) * 100) },
    ].filter((item) => item.count > 0 || item.label === "Connected" || item.label === "Queued");
  }, [stats]);

  // 2. Simple, User-Friendly Outcomes Data
  const outcomeItems = useMemo(() => {
    const callsTally: Record<string, number> = {};
    calls.forEach((c) => {
      const out = (c.business_outcome || c.outcome || "").toLowerCase().replace(/[\s-]/g, "_");
      if (out) {
        callsTally[out] = (callsTally[out] || 0) + 1;
      }
    });

    const interestedTally = Math.max(
      stats.interested,
      (callsTally["interested"] || 0) + (callsTally["warm_interested"] || 0) + (callsTally["highly_interested"] || 0) + (callsTally["converted"] || 0) + (callsTally["qualified"] || 0)
    );
    const callbackTally = Math.max(stats.callbacks, (callsTally["callback_requested"] || 0) + (callsTally["callback"] || 0));
    const askedDetailsTally = Math.max(stats.information_requested || 0, (callsTally["information_requested"] || 0) + (callsTally["asked_details"] || 0));
    const followUpTally = Math.max(stats.follow_up_required || 0, (callsTally["follow_up_required"] || 0) + (callsTally["follow_up"] || 0));
    const notInterestedTally = Math.max(stats.not_interested || 0, callsTally["not_interested"] || 0);
    const dncTally = Math.max(stats.dnc || 0, (callsTally["do_not_contact"] || 0) + (callsTally["dnc"] || 0));
    const noAnswerTally = Math.max(stats.no_answer || 0, (callsTally["no_answer"] || 0) + (callsTally["unanswered"] || 0));
    const voicemailBusyTally = Math.max((stats.busy || 0) + (stats.voicemail || 0), (callsTally["voicemail"] || 0) + (callsTally["busy"] || 0));

    const list = [
      { label: "Interested", count: interestedTally, color: "#10b981" },
      { label: "Callback Requested", count: callbackTally, color: "#3b82f6" },
      { label: "Asked Details", count: askedDetailsTally, color: "#06b6d4" },
      { label: "Follow-up", count: followUpTally, color: "#8b5cf6" },
      { label: "No Answer", count: noAnswerTally, color: "#f59e0b" },
      { label: "Voicemail / Busy", count: voicemailBusyTally, color: "#fbbf24" },
      { label: "Not Interested", count: notInterestedTally, color: "#f43f5e" },
      { label: "Do Not Call", count: dncTally, color: "#e11d48" },
    ].filter((item) => item.count > 0 || item.label === "Interested" || item.label === "Callback Requested" || item.label === "No Answer");

    const maxVal = Math.max(...list.map((o) => o.count), 1);
    return list.map((item) => ({
      ...item,
      percentage: Math.round((item.count / maxVal) * 100)
    }));
  }, [stats, calls]);

  // 3. Hourly Calls Distribution (Calculated directly from call records)
  const hourlyActivity = useMemo(() => {
    const hoursMap: Record<number, number> = {};
    for (let h = 8; h <= 19; h++) {
      hoursMap[h] = 0;
    }

    calls.forEach((c) => {
      if (c.created_at) {
        const d = new Date(c.created_at);
        const hour = d.getHours();
        if (hoursMap[hour] !== undefined) {
          hoursMap[hour]++;
        } else if (hour >= 0 && hour <= 23) {
          hoursMap[hour] = (hoursMap[hour] || 0) + 1;
        }
      }
    });

    const entries = Object.entries(hoursMap)
      .map(([h, count]) => ({
        hour: parseInt(h, 10),
        label: `${parseInt(h, 10).toString().padStart(2, "0")}:00`,
        count
      }))
      .sort((a, b) => a.hour - b.hour);

    const maxCalls = Math.max(...entries.map((e) => e.count), 1);
    return entries.map((e) => ({
      ...e,
      percentage: Math.round((e.count / maxCalls) * 100)
    }));
  }, [calls]);

  // Donut chart SVG calculations
  const donutSlices = useMemo(() => {
    const totalCount = statusItems.reduce((acc, item) => acc + item.count, 0) || 1;
    let cumulative = 0;
    const radius = 38;
    const circumference = 2 * Math.PI * radius;

    return statusItems.map((item) => {
      const sliceFraction = item.count / totalCount;
      const strokeDasharray = `${sliceFraction * circumference} ${circumference}`;
      const strokeDashoffset = -cumulative * circumference;
      cumulative += sliceFraction;
      return {
        ...item,
        strokeDasharray,
        strokeDashoffset
      };
    });
  }, [statusItems]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CHART 1: CALL STATUS DISTRIBUTION (DONUT) */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)] inline-flex items-center gap-2 whitespace-nowrap">
              <PieChartIcon className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <span>Call Status Distribution</span>
            </h3>
            <span className="text-xs text-[var(--color-muted)] font-mono">
              Total: {stats.total_prospects}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
            {/* SVG Donut */}
            <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 transform">
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-[var(--color-surface-muted)] opacity-30"
                />
                {donutSlices.map((slice, i) => (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke={slice.color}
                    strokeWidth="12"
                    strokeDasharray={slice.strokeDasharray}
                    strokeDashoffset={slice.strokeDashoffset}
                    className="transition-all duration-700 ease-out"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-extrabold text-[var(--color-heading)]">
                  {stats.connection_rate}%
                </span>
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">
                  Connected
                </span>
              </div>
            </div>

            {/* Legend Grid */}
            <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-2 text-xs w-full">
              {statusItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-[var(--color-surface-muted)]/50 border border-[var(--color-border)]/50 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5 truncate pr-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[var(--color-muted)] text-[11px] truncate">{item.label}</span>
                  </div>
                  <span className="font-bold text-[var(--color-heading)] font-mono text-[11px] shrink-0">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CHART 2: BUSINESS OUTCOMES (BARS) */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)] inline-flex items-center gap-2 whitespace-nowrap">
              <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Business Outcomes Intelligence</span>
            </h3>
            <span className="text-xs text-[var(--color-muted)]">
              Lead Outcomes
            </span>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 text-xs">
            {outcomeItems.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[var(--color-heading)]">{item.label}</span>
                  <span className="font-bold font-mono text-[var(--color-muted)]">{item.count}</span>
                </div>
                <div className="w-full bg-[var(--color-surface-muted)] h-2 rounded-full overflow-hidden flex">
                  <div
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color
                    }}
                    className="h-full rounded-full transition-all duration-700"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CHART 3: HOURLY CALL ACTIVITY TIMELINE */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)] inline-flex items-center gap-2 whitespace-nowrap">
            <BarChart3 className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Calls Distribution Over Time (Hourly Velocity)</span>
          </h3>
          <span className="text-xs text-[var(--color-muted)] font-mono">
            {calls.length} total call events
          </span>
        </div>

        <div className="pt-2">
          {hourlyActivity.length === 0 || calls.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-muted)]">
              No historical call timestamp records yet. Activity bars will render dynamically as campaign dials.
            </div>
          ) : (
            <div className="flex items-end gap-1.5 h-28 w-full pt-4 px-2">
              {hourlyActivity.map((bar, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 px-1.5 py-0.5 rounded bg-[var(--color-heading)] text-[var(--color-surface)] text-[10px] font-mono whitespace-nowrap pointer-events-none z-10 shadow-sm">
                    {bar.label}: {bar.count} calls
                  </div>
                  {/* Bar */}
                  <div
                    style={{ height: `${Math.max(bar.percentage, bar.count > 0 ? 8 : 2)}%` }}
                    className={`w-full rounded-t transition-all duration-500 ${
                      bar.count > 0
                        ? "bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80"
                        : "bg-[var(--color-surface-muted)] opacity-40"
                    }`}
                  />
                  {/* Hour label */}
                  <span className="text-[9px] text-[var(--color-muted)] mt-1.5 truncate block w-full text-center">
                    {bar.hour % 3 === 0 ? bar.label : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
