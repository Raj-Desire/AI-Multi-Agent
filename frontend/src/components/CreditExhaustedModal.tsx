import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { OrgCreditStatus } from '../types';
import { ShieldAlert, Coins, ArrowRight, UserCheck } from 'lucide-react';

interface CreditExhaustedModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditStatus: OrgCreditStatus | null;
  onNavigateToDashboard: () => void;
  customMessage?: string | null;
}

export const CreditExhaustedModal: React.FC<CreditExhaustedModalProps> = ({
  isOpen,
  onClose,
  creditStatus,
  onNavigateToDashboard,
  customMessage
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Calling Credit Limit Reached"
      maxWidth="md"
    >
      <div className="space-y-4 text-xs text-[var(--color-text)]">
        {/* Warning Banner Card */}
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3 text-rose-500">
          <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-[var(--color-heading)]">Outbound Calling Blocked</h4>
            <p className="text-xs text-[var(--color-heading)] opacity-90 leading-relaxed">
              {customMessage || (
                <>
                  Your organization has reached its allocated calling time limit (<strong>0 available minutes remaining</strong>).
                  In accordance with your workspace credit plan, live conversational calls and automated campaigns are stopped.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Administrator Guidance */}
        <div className="p-3.5 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border)] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[var(--color-heading)]">
            <UserCheck className="w-4 h-4 text-emerald-500" />
            <span>Next Steps for Resolution</span>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
            Please reach out to your <strong>Workspace Administrator</strong> or <strong>Platform SuperAdmin</strong> to assign additional talk-time minutes or upgrade your organization's subscription tier.
          </p>

          {creditStatus && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--color-border)] text-center font-mono">
              <div className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
                <div className="text-[10px] text-[var(--color-muted)] font-sans">Active Plan</div>
                <div className="font-bold text-xs text-[var(--color-heading)]">{creditStatus.plan_name || 'Standard'}</div>
              </div>
              <div className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
                <div className="text-[10px] text-[var(--color-muted)] font-sans">Used Time</div>
                <div className="font-bold text-xs text-rose-500">{creditStatus.used_minutes.toFixed(1)}m</div>
              </div>
              <div className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
                <div className="text-[10px] text-[var(--color-muted)] font-sans">Total Allocated</div>
                <div className="font-bold text-xs text-[var(--color-heading)]">{creditStatus.total_credits_minutes}m</div>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="pt-2 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Dismiss
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              onNavigateToDashboard();
            }}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            View Usage & Credits
          </Button>
        </div>
      </div>
    </Modal>
  );
};
