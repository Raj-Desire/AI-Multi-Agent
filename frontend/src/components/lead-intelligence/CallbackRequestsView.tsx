import React from "react";
import { CallbackListItem } from "../../types";
import {
  PhoneForwarded,
  Calendar,
  Clock,
  Phone,
  Building,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { Button } from "../ui/Button";

interface CallbackRequestsViewProps {
  callbacks: CallbackListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (newPage: number) => void;
  onSelectProspect: (prospectId: string) => void;
  onQuickCall?: (phoneNumber: string) => void;
}

export function CallbackRequestsView({
  callbacks,
  total,
  page,
  pageSize,
  totalPages,
  isLoading,
  onPageChange,
  onSelectProspect,
  onQuickCall,
}: CallbackRequestsViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse h-28"
          />
        ))}
      </div>
    );
  }

  if (callbacks.length === 0) {
    return (
      <div className="py-16 px-4 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-center flex flex-col items-center justify-center space-y-3 shadow-2xs">
        <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
          <PhoneForwarded className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h4 className="text-sm font-bold text-[var(--color-heading)]">
            No Callback Requests
          </h4>
          <p className="text-xs text-[var(--color-muted)] leading-relaxed">
            When prospects ask to be contacted back at a specific time, they will be organized
            here for rapid action.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* List Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <PhoneForwarded className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-bold text-[var(--color-heading)]">
            Active Callback Requests
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold font-mono">
            {total} Pending
          </span>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {callbacks.map((cb) => (
          <div
            key={cb.prospect_id}
            onClick={() => onSelectProspect(cb.prospect_id)}
            className="p-4 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-purple-500/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3 group"
          >
            {/* Top Row: Contact Info & Callback Schedule Tag */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <h4 className="font-bold text-sm text-[var(--color-heading)] group-hover:text-[var(--color-primary)] transition-colors">
                  {cb.full_name}
                </h4>
                <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  {cb.company && (
                    <span className="flex items-center gap-1 font-medium text-[var(--color-text)]">
                      <Building className="w-3 h-3 text-[var(--color-muted)]" />
                      <span>{cb.company}</span>
                    </span>
                  )}
                  <span className="font-mono">{cb.phone_number}</span>
                </div>
              </div>

              {/* Urgency Badge */}
              <div className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold flex items-center gap-1.5 shrink-0">
                <Calendar className="w-3 h-3" />
                <span>{cb.requested_datetime || "Requested Callback"}</span>
              </div>
            </div>

            {/* Middle: AI Call Summary */}
            <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-background)]/70 border border-[var(--color-border)]/60 text-xs text-[var(--color-muted)] leading-relaxed">
              <span className="font-semibold text-[var(--color-heading)] mr-1">AI Note:</span>
              <span>{cb.summary || "Customer asked for a follow-up conversation."}</span>
            </div>

            {/* Bottom Row: Campaign & Actions */}
            <div className="pt-2 border-t border-[var(--color-border)]/60 flex items-center justify-between gap-2 text-xs">
              <div className="text-[11px] text-[var(--color-muted)] truncate max-w-[200px]">
                Campaign: <span className="font-medium text-[var(--color-text)]">{cb.campaign_name || "Direct Call"}</span>
              </div>

              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                {onQuickCall && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onQuickCall(cb.phone_number)}
                    leftIcon={<Phone className="w-3.5 h-3.5 text-emerald-500" />}
                    className="cursor-pointer font-medium"
                  >
                    Call Now
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onSelectProspect(cb.prospect_id)}
                  rightIcon={<ArrowRight className="w-3 h-3" />}
                  className="cursor-pointer font-medium"
                >
                  View Details
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-[var(--color-muted)]">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="px-2 font-mono font-semibold text-[var(--color-heading)]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
