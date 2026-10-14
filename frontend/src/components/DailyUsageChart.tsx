import React, { useState } from 'react';
import { DailyUsageMetric } from '../types';
import { BarChart3, Calendar } from 'lucide-react';

interface DailyUsageChartProps {
  metrics: DailyUsageMetric[];
  days: number;
  onDaysChange: (days: number) => void;
  className?: string;
}

export const DailyUsageChart: React.FC<DailyUsageChartProps> = ({
  metrics,
  days,
  onDaysChange,
  className = ''
}) => {
  const [hoveredDay, setHoveredDay] = useState<DailyUsageMetric | null>(null);

  // Find max minutes for relative bar height scaling
  const maxMinutes = Math.max(5, ...metrics.map((m) => m.total_minutes));

  return (
    <div className={`p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs ${className}`}>
      {/* Header and range toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-muted)] text-[var(--color-heading)] flex items-center justify-center border border-[var(--color-border)]">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--color-heading)]">Daily Minute & Token Consumption</h3>
            <p className="text-[11px] text-[var(--color-muted)]">Actual talk-time consumed by all organization calls</p>
          </div>
        </div>

        {/* Time range buttons */}
        <div className="flex items-center gap-1 bg-[var(--color-surface-muted)] p-1 rounded-lg border border-[var(--color-border)] text-xs">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-2.5 py-1 rounded-md font-medium text-[11px] transition-colors ${
                days === d
                  ? 'bg-[var(--color-surface)] text-[var(--color-heading)] shadow-xs'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-heading)]'
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas Area */}
      {metrics.length === 0 ? (
        <div className="h-44 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[var(--color-border)] rounded-lg">
          <Calendar className="w-6 h-6 text-[var(--color-muted)] mb-1 opacity-50" />
          <p className="text-xs text-[var(--color-muted)]">No calls placed in the selected time window.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Tooltip Overlay */}
          {hoveredDay && (
            <div className="absolute top-0 right-2 z-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-md p-2.5 text-xs pointer-events-none transition-all">
              <div className="font-semibold text-[var(--color-heading)] mb-1">{hoveredDay.date_key}</div>
              <div className="space-y-0.5 text-[11px] text-[var(--color-muted)]">
                <div>Duration: <span className="font-mono font-medium text-[var(--color-heading)]">{hoveredDay.total_minutes.toFixed(2)} min</span></div>
                <div>Calls Placed: <span className="font-mono font-medium text-[var(--color-heading)]">{hoveredDay.call_count}</span></div>
                <div>Tokens Processed: <span className="font-mono font-medium text-[var(--color-heading)]">{hoveredDay.total_tokens.toLocaleString()}</span></div>
              </div>
            </div>
          )}

          {/* Bar Chart Container */}
          <div className="h-44 flex items-end gap-1.5 pt-6 pb-2 px-1">
            {metrics.map((m, idx) => {
              const heightPercent = Math.max(8, (m.total_minutes / maxMinutes) * 100);
              const isHovered = hoveredDay?.date_key === m.date_key;

              return (
                <div
                  key={m.date_key || idx}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                  onMouseEnter={() => setHoveredDay(m)}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  {/* Bar */}
                  <div
                    className={`w-full rounded-t-md transition-all duration-200 ${
                      isHovered
                        ? 'bg-emerald-400 scale-y-105'
                        : m.total_minutes > 0
                        ? 'bg-emerald-500/80 hover:bg-emerald-500'
                        : 'bg-[var(--color-surface-muted)]'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                  />

                  {/* X-axis Label (Sample every N days to prevent crowding) */}
                  {(metrics.length <= 14 || idx % 3 === 0) && (
                    <span className="text-[9px] font-mono text-[var(--color-muted)] mt-1.5 truncate max-w-full">
                      {m.date_key.slice(5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
