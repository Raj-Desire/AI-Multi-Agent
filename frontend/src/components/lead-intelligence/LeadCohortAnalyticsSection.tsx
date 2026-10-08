import React, { useState, useEffect } from "react";
import { Users, TrendingUp, Calendar, Filter, ArrowUpRight, CheckCircle2, PhoneForwarded } from "lucide-react";
import { CohortAnalyticsResponse, CohortGroup } from "../../types";
import { fetchApi } from "../../api-client";
import { toast } from "sonner";

interface LeadCohortAnalyticsSectionProps {
  campaignId: string;
}

export function LeadCohortAnalyticsSection({ campaignId }: LeadCohortAnalyticsSectionProps) {
  const [data, setData] = useState<CohortAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [groupBy, setGroupBy] = useState<"week" | "month" | "day">("week");
  const [dateRange, setDateRange] = useState<string>("30d");

  useEffect(() => {
    loadCohorts();
  }, [groupBy, dateRange, campaignId]);

  const loadCohorts = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("group_by", groupBy);
      params.set("date_range", dateRange);
      if (campaignId && campaignId !== "all") {
        params.set("campaign_id", campaignId);
      }
      const res = await fetchApi<CohortAnalyticsResponse>(`/lead-intelligence/cohorts?${params.toString()}`);
      setData(res);
    } catch (err: any) {
      toast.error("Failed to load cohort analytics: " + (err.message || "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  // Helper for heatmap cell color density
  const getCellBg = (pct: number) => {
    if (pct === 0) return "bg-slate-500/5 text-slate-400";
    if (pct < 20) return "bg-indigo-500/10 text-indigo-600";
    if (pct < 40) return "bg-indigo-500/20 text-indigo-700 font-medium";
    if (pct < 60) return "bg-indigo-500/35 text-indigo-800 font-semibold";
    if (pct < 80) return "bg-indigo-600/50 text-white font-bold";
    return "bg-indigo-600 text-white font-bold";
  };

  return (
    <div className="rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs overflow-hidden">
      {/* Header with Dimension Pickers */}
      <div className="p-4 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
              Cohort Retention &amp; Qualification Matrix
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-semibold border border-[var(--color-primary)]/20">
                Progression Analysis
              </span>
            </h3>
            <p className="text-xs text-[var(--color-muted)]">
              Tracks how prospect cohorts qualify and convert over progressive follow-up intervals
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Group By selector */}
          <div className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-0.5 text-xs">
            <button
              onClick={() => setGroupBy("day")}
              className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                groupBy === "day"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setGroupBy("week")}
              className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                groupBy === "week"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setGroupBy("month")}
              className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                groupBy === "month"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              Month
            </button>
          </div>

          {/* Date range preset */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-2.5 py-1 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-[var(--color-text)]"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Previous Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* KPI Cards Row */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 border-b border-[var(--color-border)] bg-[var(--color-background)]/50 divide-x divide-[var(--color-border)]">
          <div className="p-3.5 text-center">
            <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider block">
              Tracked Cohorts
            </span>
            <span className="text-xl font-bold text-[var(--color-heading)] mt-0.5 block">
              {data.total_cohorts}
            </span>
          </div>
          <div className="p-3.5 text-center">
            <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider block">
              Tracked Prospects
            </span>
            <span className="text-xl font-bold text-[var(--color-heading)] mt-0.5 block">
              {data.total_tracked_prospects}
            </span>
          </div>
          <div className="p-3.5 text-center">
            <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider block">
              Overall Qualification Rate
            </span>
            <span className="text-xl font-bold text-emerald-600 mt-0.5 block">
              {data.overall_qualification_rate}%
            </span>
          </div>
          <div className="p-3.5 text-center">
            <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider block">
              Overall Conversion Rate
            </span>
            <span className="text-xl font-bold text-indigo-600 mt-0.5 block">
              {data.overall_conversion_rate}%
            </span>
          </div>
        </div>
      )}

      {/* Main Cohort Heatmap Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-[var(--color-muted)]">
            Loading cohort progression data...
          </div>
        ) : !data || data.cohorts.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--color-muted)]">
            No cohort records found for the selected date range and filter criteria.
          </div>
        ) : (
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-[var(--color-background)]/75 border-b border-[var(--color-border)] text-[var(--color-muted)] font-semibold">
                <th className="py-3 px-4 min-w-[160px]">Cohort (Acquisition)</th>
                <th className="py-3 px-3 text-center min-w-[90px]">Prospects</th>
                <th className="py-3 px-3 text-center min-w-[110px]">
                  {groupBy === "day" ? "Day 0" : (groupBy === "month" ? "Month 0" : "Week 0 (Initial)")}
                </th>
                <th className="py-3 px-3 text-center min-w-[110px]">
                  {groupBy === "day" ? "Day 1" : (groupBy === "month" ? "Month 1" : "Week 1")}
                </th>
                <th className="py-3 px-3 text-center min-w-[110px]">
                  {groupBy === "day" ? "Day 2" : (groupBy === "month" ? "Month 2" : "Week 2")}
                </th>
                <th className="py-3 px-3 text-center min-w-[110px]">
                  {groupBy === "day" ? "Day 3" : (groupBy === "month" ? "Month 3" : "Week 3")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]/60">
              {data.cohorts.map((cohort: CohortGroup) => (
                <tr key={cohort.cohort_key} className="hover:bg-[var(--color-background)]/40 transition-colors">
                  <td className="py-3 px-4 font-semibold text-[var(--color-heading)]">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                      <span>{cohort.cohort_label}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-[var(--color-text)]">
                    {cohort.initial_prospects}
                  </td>
                  {cohort.stages.map((st) => (
                    <td key={st.interval_index} className="py-2.5 px-3 text-center">
                      <div
                        className={`inline-block w-full py-1.5 px-2 rounded-md text-center transition-all ${getCellBg(
                          st.qualified_pct
                        )}`}
                      >
                        <div className="text-xs font-semibold">{st.qualified_pct}%</div>
                        <div className="text-[10px] opacity-80">
                          {st.qualified_count} qual ({st.engaged_count} engaged)
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Heatmap Legend */}
      <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-background)]/30 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
        <span>Heatmap metric: % of cohort prospects qualified in that interval</span>
        <div className="flex items-center gap-1.5">
          <span>0%</span>
          <div className="flex items-center gap-0.5">
            <span className="w-4 h-3 rounded-xs bg-slate-500/10"></span>
            <span className="w-4 h-3 rounded-xs bg-indigo-500/20"></span>
            <span className="w-4 h-3 rounded-xs bg-indigo-500/40"></span>
            <span className="w-4 h-3 rounded-xs bg-indigo-600/70"></span>
            <span className="w-4 h-3 rounded-xs bg-indigo-600"></span>
          </div>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
