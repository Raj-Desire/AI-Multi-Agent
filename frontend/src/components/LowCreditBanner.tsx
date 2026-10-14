import React, { useState } from 'react';
import { CreditHealthStatus } from '../types';
import { AlertTriangle, AlertOctagon, XCircle, X, ChevronRight } from 'lucide-react';

interface LowCreditBannerProps {
  status: CreditHealthStatus;
  remainingMinutes: number;
  totalMinutes: number;
  onNavigateToDashboard?: () => void;
  className?: string;
}

export const LowCreditBanner: React.FC<LowCreditBannerProps> = ({
  status,
  remainingMinutes,
  totalMinutes,
  onNavigateToDashboard,
  className = ''
}) => {
  const [dismissed, setDismissed] = useState(false);

  // Only display banner if status is warning, critical, or exhausted
  if (status === 'healthy' || dismissed) {
    return null;
  }

  const isExhausted = status === 'exhausted' || remainingMinutes <= 0;
  const isCritical = status === 'critical';

  return (
    <div
      className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-xs border-b transition-all ${
        isExhausted
          ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
          : isCritical
          ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 animate-pulse'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
      } ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isExhausted ? (
          <XCircle className="w-4 h-4 shrink-0" />
        ) : isCritical ? (
          <AlertOctagon className="w-4 h-4 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        )}

        <div className="truncate">
          <span className="font-semibold mr-1.5">
            {isExhausted
              ? 'Call Credits Exhausted:'
              : isCritical
              ? 'Critical Credit Alert:'
              : 'Low Credit Notice:'}
          </span>
          <span className="text-[var(--color-heading)] opacity-90">
            {isExhausted
              ? '0 minutes remaining. Outbound calling is currently paused. Please top up your subscription.'
              : `Only ${remainingMinutes.toFixed(1)} minutes remaining out of ${totalMinutes} allocated.`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onNavigateToDashboard && (
          <button
            onClick={onNavigateToDashboard}
            className="flex items-center gap-1 font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Usage Dashboard
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {!isExhausted && (
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
