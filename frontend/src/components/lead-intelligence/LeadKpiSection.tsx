import React from "react";
import { LeadKPISummary } from "../../types";
import {
  Users,
  Sparkles,
  PhoneForwarded,
  HelpCircle,
  PhoneOff,
  TrendingUp,
  TrendingDown,
  Clock,
  Flame
} from "lucide-react";

interface LeadKpiSectionProps {
  summary: LeadKPISummary | null;
  isLoading: boolean;
  selectedOutcomeFilter: string;
  onSelectOutcomeFilter: (outcome: string) => void;
}

export function LeadKpiSection({
  summary,
  isLoading,
  selectedOutcomeFilter,
  onSelectOutcomeFilter,
}: LeadKpiSectionProps) {
  if (isLoading && !summary) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="p-4 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse h-28 flex flex-col justify-between"
          >
            <div className="h-4 bg-[var(--color-border)]/60 rounded w-2/3" />
            <div className="h-7 bg-[var(--color-border)]/60 rounded w-1/2" />
            <div className="h-3 bg-[var(--color-border)]/40 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  const s = summary || {
    total_leads: 0,
    interested: 0,
    callback_requested: 0,
    needs_follow_up: 0,
    not_interested: 0,
    no_answer: 0,
    avg_lead_score: 0,
    avg_call_duration_seconds: 0,
    period_label: "Selected Period",
  };

  const renderDelta = (pct?: number | null) => {
    if (pct === undefined || pct === null) return null;
    const isPositive = pct >= 0;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
          isPositive
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
        }`}
      >
        {isPositive ? (
          <TrendingUp className="w-3 h-3 shrink-0" />
        ) : (
          <TrendingDown className="w-3 h-3 shrink-0" />
        )}
        {isPositive ? `+${pct}%` : `${pct}%`}
      </span>
    );
  };

  const cards = [
    {
      id: "all",
      label: "TOTAL LEADS",
      count: s.total_leads,
      delta: s.total_leads_change_pct,
      icon: Users,
      color: "text-indigo-500 dark:text-indigo-400",
      bgColor: "bg-indigo-500/10",
      activeRing: "ring-2 ring-indigo-500",
      description: "All campaign leads",
    },
    {
      id: "Interested",
      label: "INTERESTED",
      count: s.interested,
      delta: s.interested_change_pct,
      icon: Sparkles,
      color: "text-emerald-500 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10",
      activeRing: "ring-2 ring-emerald-500",
      description: "Positive prospect response",
    },
    {
      id: "Callback Requested",
      label: "CALLBACK REQUESTED",
      count: s.callback_requested,
      delta: s.callback_change_pct,
      icon: PhoneForwarded,
      color: "text-purple-500 dark:text-purple-400",
      bgColor: "bg-purple-500/10",
      activeRing: "ring-2 ring-purple-500",
      description: "Specific time requested",
    },
    {
      id: "Information Requested",
      label: "INFORMATION REQUESTED",
      count: s.needs_follow_up,
      delta: s.needs_follow_up_change_pct,
      icon: HelpCircle,
      color: "text-blue-500 dark:text-blue-400",
      bgColor: "bg-blue-500/10",
      activeRing: "ring-2 ring-blue-500",
      description: "Details or follow-up needed",
    },
    {
      id: "No Answer",
      label: "NO ANSWER",
      count: s.no_answer,
      delta: s.no_answer_change_pct,
      icon: PhoneOff,
      color: "text-slate-500 dark:text-slate-400",
      bgColor: "bg-slate-500/10",
      activeRing: "ring-2 ring-slate-500",
      description: "Unanswered, voicemail, other",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const isSelected = selectedOutcomeFilter === card.id;

          return (
            <button
              key={card.id}
              onClick={() => onSelectOutcomeFilter(card.id)}
              type="button"
              className={`text-left p-3.5 sm:p-4 rounded-[var(--radius-main,0.5rem)] border transition-all duration-150 cursor-pointer flex flex-col justify-between group hover:shadow-md ${
                isSelected
                  ? `bg-[var(--color-surface)] ${card.activeRing} shadow-sm border-transparent`
                  : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-hover,var(--color-border))]"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-2 w-full">
                <span className="text-[11px] font-bold tracking-wider text-[var(--color-muted)] uppercase truncate">
                  {card.label}
                </span>
                <div
                  className={`w-7 h-7 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center shrink-0 ${card.bgColor} ${card.color}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div className="flex items-baseline justify-between gap-2 w-full">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-heading)]">
                  {card.count.toLocaleString()}
                </span>
                {renderDelta(card.delta)}
              </div>

              <div className="mt-2 pt-2 border-t border-[var(--color-border)]/60 flex items-center justify-between text-[11px] text-[var(--color-muted)] w-full">
                <span className="truncate">{card.description}</span>
                {isSelected && (
                  <span className="text-[10px] font-semibold text-[var(--color-primary)] shrink-0 ml-1">
                    Filtered
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Secondary Quick Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 bg-[var(--color-surface)]/60 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-xs text-[var(--color-muted)]">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Avg Lead Viability Score:</span>
            <span className="font-semibold text-[var(--color-heading)]">
              {s.avg_lead_score > 0 ? `${s.avg_lead_score}/100` : "N/A"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>Avg Call Talking Time:</span>
            <span className="font-semibold text-[var(--color-heading)]">
              {s.avg_call_duration_seconds > 0
                ? `${Math.floor(s.avg_call_duration_seconds / 60)}m ${s.avg_call_duration_seconds % 60}s`
                : "0s"}
            </span>
          </div>
        </div>

        <div className="text-[11px] opacity-80">
          Showing metrics for: <span className="font-medium text-[var(--color-heading)]">{s.period_label}</span>
          {s.comparison_label && (
            <span className="ml-1 text-[var(--color-muted)]">({s.comparison_label})</span>
          )}
        </div>
      </div>
    </div>
  );
}
