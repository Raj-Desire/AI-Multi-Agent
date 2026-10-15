import React from 'react';
import { CreditHealthStatus } from '../types';
import { AlertTriangle, CheckCircle2, AlertOctagon, XCircle } from 'lucide-react';

interface CreditHealthBarProps {
  usedMinutes: number;
  totalMinutes: number;
  remainingMinutes: number;
  usagePercentage: number;
  status: CreditHealthStatus;
  isEnforced?: boolean;
  className?: string;
}

export const CreditHealthBar: React.FC<CreditHealthBarProps> = ({
  usedMinutes,
  totalMinutes,
  remainingMinutes,
  usagePercentage,
  status,
  isEnforced = true,
  className = ''
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'exhausted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Credits Exhausted
          </span>
        );
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
            <AlertOctagon className="w-3.5 h-3.5" />
            Critical Balance (&lt;5% left)
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Running Low
          </span>
        );
      case 'healthy':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Healthy Balance
          </span>
        );
    }
  };

  const getBarColor = () => {
    switch (status) {
      case 'exhausted':
        return 'bg-rose-500';
      case 'critical':
        return 'bg-rose-500';
      case 'warning':
        return 'bg-amber-500';
      case 'healthy':
      default:
        return 'bg-emerald-500';
    }
  };

  return (
    <div className={`p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-muted)]">Credit Pool Consumption</span>
          {getStatusBadge()}
          {!isEnforced && (
            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-500/10 text-slate-400 font-mono">
              Unrestricted (Testing Mode)
            </span>
          )}
        </div>
        <div className="text-xs font-mono font-medium text-[var(--color-heading)]">
          <span className="font-semibold text-sm">{usedMinutes.toLocaleString()}</span> / {totalMinutes.toLocaleString()} min ({usagePercentage.toFixed(1)}%)
        </div>
      </div>

      {/* Progress Bar Track */}
      <div className="w-full h-3 rounded-full bg-[var(--color-surface-muted)] overflow-hidden p-0.5 border border-[var(--color-border)]">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${getBarColor()}`}
          style={{ width: `${Math.min(100, Math.max(0, usagePercentage))}%` }}
        />
      </div>

      <div className="flex justify-between items-center mt-2 text-[11px] text-[var(--color-muted)]">
        <span>0 min used</span>
        <span className="font-medium text-[var(--color-heading)]">
          {remainingMinutes.toLocaleString()} minutes remaining
        </span>
        <span>{totalMinutes.toLocaleString()} min cap</span>
      </div>
    </div>
  );
};
