import React from "react";
import { LeadOutcomeDistributionResponse } from "../../types";
import { PieChart } from "lucide-react";

interface LeadOutcomeDistributionProps {
  data: LeadOutcomeDistributionResponse | null;
  isLoading: boolean;
  selectedOutcomeFilter: string;
  onSelectOutcomeFilter: (outcome: string) => void;
}

export function LeadOutcomeDistribution({
  data,
  isLoading,
  selectedOutcomeFilter,
  onSelectOutcomeFilter,
}: LeadOutcomeDistributionProps) {
  if (isLoading && !data) {
    return (
      <div className="p-4 sm:p-5 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse space-y-4">
        <div className="h-5 bg-[var(--color-border)]/60 rounded w-1/3" />
        <div className="h-4 bg-[var(--color-border)]/40 rounded w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-[var(--color-border)]/30 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const items = data?.distribution || [];
  const totalCalls = data?.total_analyzed_calls || 0;

  return (
    <div className="p-4 sm:p-5 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs space-y-4 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-[var(--color-primary)]" />
            <h3 className="text-sm font-bold text-[var(--color-heading)]">
              Lead Outcome Distribution
            </h3>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Total of {totalCalls.toLocaleString()} {totalCalls === 1 ? "lead" : "leads"} analyzed
          </p>
        </div>

        {selectedOutcomeFilter !== "all" && (
          <button
            onClick={() => onSelectOutcomeFilter("all")}
            className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1 cursor-pointer font-medium"
          >
            Reset Filter
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-muted)]">
          No outcome data recorded for this range.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Segmented Proportion Progress Bar */}
          <div className="w-full h-3 rounded-full bg-[var(--color-border)]/40 flex overflow-hidden p-0.5 gap-0.5 shadow-inner">
            {items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: item.color_hint,
                }}
                className="h-full rounded-xs transition-all duration-300 hover:opacity-85 cursor-pointer relative group"
                onClick={() => onSelectOutcomeFilter(item.outcome)}
                title={`${item.outcome}: ${item.count} (${item.percentage}%)`}
              />
            ))}
          </div>

          {/* Detailed Outcome Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {items.map((item, idx) => {
              const isSelected = selectedOutcomeFilter === item.outcome;
              return (
                <button
                  key={idx}
                  onClick={() => onSelectOutcomeFilter(item.outcome)}
                  className={`text-left p-3 rounded-[var(--radius-main,0.375rem)] border text-xs transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-[var(--color-surface)] ring-2 ring-[var(--color-primary)] border-transparent shadow-xs"
                      : "bg-[var(--color-background)]/60 border-[var(--color-border)]/80 hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color_hint }}
                    />
                    <span
                      className="font-semibold text-[var(--color-heading)] text-xs truncate leading-tight"
                      title={item.outcome}
                    >
                      {item.outcome}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-1 mt-1">
                    <span className="font-mono font-bold text-sm text-[var(--color-text)]">
                      {item.count.toLocaleString()}
                    </span>
                    <span className="text-[var(--color-muted)] font-mono text-[11px] font-medium">
                      {item.percentage}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
