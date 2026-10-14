import React from 'react';
import { OrgCreditStatus } from '../types';
import { BatteryCharging, BatteryLow, BatteryWarning, Zap } from 'lucide-react';

interface HeaderCreditWidgetProps {
  creditStatus: OrgCreditStatus | null;
  onNavigateToDashboard: () => void;
}

export const HeaderCreditWidget: React.FC<HeaderCreditWidgetProps> = ({
  creditStatus,
  onNavigateToDashboard
}) => {
  if (!creditStatus) return null;

  const totalMin = creditStatus.total_credits_minutes || 0;
  const remMin = creditStatus.remaining_minutes || 0;
  const usedMin = creditStatus.used_minutes || 0;

  // Compute percentage remaining (0 to 100)
  const remainingPct = totalMin > 0 ? Math.max(0, Math.min(100, Math.round((remMin / totalMin) * 100))) : 0;
  const isExhausted = creditStatus.status === 'exhausted' || remMin <= 0;
  const isLow = creditStatus.status === 'warning' || creditStatus.status === 'critical' || remainingPct <= (creditStatus.low_credit_threshold_pct || 20);

  return (
    <button
      type="button"
      onClick={onNavigateToDashboard}
      className={`group relative flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium transition-all cursor-pointer select-none shadow-2xs ${
        isExhausted
          ? 'bg-rose-500/10 border-rose-500/40 text-rose-500 hover:bg-rose-500/20 hover:border-rose-500'
          : isLow
          ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 hover:bg-amber-500/20 hover:border-amber-500'
          : 'bg-[var(--color-surface-muted)] border-[var(--color-border)] text-[var(--color-heading)] hover:border-emerald-500/50 hover:bg-[var(--color-surface)]'
      }`}
      title={`Organization Credit Pool: ${remMin.toFixed(1)} / ${totalMin} min remaining (${remainingPct}%). Click to view usage dashboard.`}
    >
      {/* Battery / Charging Icon */}
      <div className="flex items-center">
        {isExhausted ? (
          <BatteryWarning className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
        ) : isLow ? (
          <BatteryLow className="w-3.5 h-3.5 text-amber-500" />
        ) : (
          <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />
        )}
      </div>

      {/* Mini battery gauge bar */}
      <div className="w-7 h-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden flex items-center p-0.5">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isExhausted
              ? 'bg-rose-500 w-full opacity-60'
              : isLow
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${isExhausted ? 100 : Math.max(8, remainingPct)}%` }}
        />
      </div>

      {/* Percentage & Minute Readout */}
      <div className="flex items-center gap-1 font-mono text-[11px]">
        <span className={`font-bold ${isExhausted ? 'text-rose-500' : isLow ? 'text-amber-500' : 'text-[var(--color-heading)]'}`}>
          {isExhausted ? '0%' : `${remainingPct}%`}
        </span>
        <span className="text-[10px] text-[var(--color-muted)] hidden sm:inline">
          ({remMin.toFixed(0)}m)
        </span>
      </div>

      {/* Warning pills on responsive displays */}
      {isLow && !isExhausted && (
        <span className="hidden lg:inline text-[9px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
          Low Balance
        </span>
      )}
      {isExhausted && (
        <span className="hidden lg:inline text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-500 border border-rose-500/30 animate-pulse">
          Limit Hit
        </span>
      )}
    </button>
  );
};
