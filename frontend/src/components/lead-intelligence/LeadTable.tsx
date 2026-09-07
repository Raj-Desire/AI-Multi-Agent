import React from "react";
import { LeadListItem } from "../../types";
import {
  Sparkles,
  PhoneForwarded,
  HelpCircle,
  PhoneOff,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Phone,
  ArrowRight
} from "lucide-react";
import { Button } from "../ui/Button";

interface LeadTableProps {
  leads: LeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (field: string) => void;
  onPageChange: (newPage: number) => void;
  onSelectLead: (lead: LeadListItem) => void;
  onResetFilters: () => void;
  onQuickCall?: (phoneNumber: string) => void;
}

export function LeadTable({
  leads,
  total,
  page,
  pageSize,
  totalPages,
  isLoading,
  sortBy,
  sortOrder,
  onSortChange,
  onPageChange,
  onSelectLead,
  onResetFilters,
  onQuickCall,
}: LeadTableProps) {
  const getOutcomeBadge = (outcome: string) => {
    const o = outcome.toLowerCase();
    if (o.includes("callback")) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
          <PhoneForwarded className="w-3 h-3" />
          <span>Callback Requested</span>
        </span>
      );
    }
    if (o.includes("information") || o.includes("detail") || o.includes("follow")) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <HelpCircle className="w-3 h-3" />
          <span>Information Requested</span>
        </span>
      );
    }
    if (o.includes("interested") || o.includes("positive") || o.includes("warm") || o.includes("qualified") || o.includes("converted")) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <Sparkles className="w-3 h-3" />
          <span>Interested</span>
        </span>
      );
    }
    // All other outcomes go to No Answer
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
        <PhoneOff className="w-3 h-3" />
        <span>No Answer</span>
      </span>
    );
  };

  const getInterestBadge = (level: string, outcome: string) => {
    const l = (level || "").toLowerCase();
    const o = (outcome || "").toLowerCase();

    if (o.includes("callback") || l.includes("callback")) {
      return (
        <span className="inline-flex items-center text-[11px] font-semibold text-purple-500">
          <span>Callback</span>
        </span>
      );
    }
    if (o.includes("interested") || o.includes("information") || l.includes("interested") || l === "hot" || l === "warm") {
      return (
        <span className="inline-flex items-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <span>Interested</span>
        </span>
      );
    }
    // All other goes to No Answer
    return (
      <span className="inline-flex items-center text-[11px] text-[var(--color-muted)] font-medium">
        <span>No Answer</span>
      </span>
    );
  };

  const getScoreMeter = (score: number) => {
    let color = "bg-rose-500";
    if (score >= 70) color = "bg-emerald-500";
    else if (score >= 40) color = "bg-blue-500";
    else if (score > 0) color = "bg-amber-500";
    else color = "bg-[var(--color-border)]";

    return (
      <div className="flex items-center gap-2">
        <div className="w-12 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
          <div
            style={{ width: `${Math.min(score, 100)}%` }}
            className={`h-full ${color} rounded-full`}
          />
        </div>
        <span className="font-mono font-bold text-xs text-[var(--color-heading)]">
          {score}
        </span>
      </div>
    );
  };

  const formatLastCallTime = (isoString?: string | null) => {
    if (!isoString) return "N/A";
    try {
      const d = new Date(isoString);
      const now = new Date();
      const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);

      if (diffHours < 24 && d.getDate() === now.getDate()) {
        return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      } else if (diffHours < 48) {
        return `Yesterday ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      }
      return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs overflow-hidden flex flex-col">
      {/* Table Top Header Info */}
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--color-heading)]">
            Priority Leads
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-semibold font-mono">
            {total} {total === 1 ? "Lead" : "Leads"}
          </span>
        </div>

        <div className="text-xs text-[var(--color-muted)]">
          Page {page} of {totalPages}
        </div>
      </div>

      {/* Main Table Content */}
      {isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-[var(--color-border)]/40 rounded animate-pulse" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="py-16 px-4 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[var(--color-border)]/40 flex items-center justify-center text-[var(--color-muted)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h4 className="text-sm font-bold text-[var(--color-heading)]">
              No matching campaign leads found
            </h4>
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">
              Once AI voice agent campaigns generate prospective interest, callback requests, or information requests,
              they will be automatically organized here.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onResetFilters} className="cursor-pointer">
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)] font-semibold bg-[var(--color-background)]/60">
                <th
                  onClick={() => onSortChange("name")}
                  className="py-3 px-4 cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Prospect</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-3">Company</th>
                <th className="py-3 px-3">Campaign</th>
                <th className="py-3 px-3">Outcome</th>
                <th className="py-3 px-2">Interest</th>
                <th
                  onClick={() => onSortChange("lead_score")}
                  className="py-3 px-3 cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Lead Score</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => onSortChange("last_call_at")}
                  className="py-3 px-3 cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Last Call</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-3">Next Action</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]/60">
              {leads.map((lead) => (
                <tr
                  key={lead.prospect_id}
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-[var(--color-surface-hover,var(--color-border)/20)] transition-colors cursor-pointer group"
                >
                  {/* Prospect Name & Phone/Email */}
                  <td className="py-3 px-4">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[var(--color-heading)] text-xs flex items-center gap-1.5 group-hover:text-[var(--color-primary)] transition-colors">
                        <span>{lead.full_name}</span>
                      </div>
                      <div className="text-[11px] text-[var(--color-muted)] font-mono">
                        {lead.phone_number}
                      </div>
                    </div>
                  </td>

                  {/* Company */}
                  <td className="py-3 px-3 text-[var(--color-text)]">
                    {lead.company ? (
                      <span className="truncate max-w-[140px] block font-medium">
                        {lead.company}
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted)] italic text-[11px]">—</span>
                    )}
                  </td>

                  {/* Campaign */}
                  <td className="py-3 px-3">
                    <span className="inline-block max-w-[150px] truncate text-xs text-[var(--color-text)] font-medium">
                      {lead.campaign_name || "Campaign Call"}
                    </span>
                  </td>

                  {/* Outcome */}
                  <td className="py-3 px-3">{getOutcomeBadge(lead.business_outcome)}</td>

                  {/* Interest Level */}
                  <td className="py-3 px-2">{getInterestBadge(lead.interest_level, lead.business_outcome)}</td>

                  {/* Lead Score */}
                  <td className="py-3 px-3">{getScoreMeter(lead.lead_score)}</td>

                  {/* Last Call */}
                  <td className="py-3 px-3 text-[var(--color-muted)] text-[11px] whitespace-nowrap">
                    {formatLastCallTime(lead.last_call_at)}
                  </td>

                  {/* Next Action */}
                  <td className="py-3 px-3">
                    <span className="inline-block max-w-[180px] truncate text-xs font-medium text-[var(--color-heading)]">
                      {lead.next_action || "Follow up with prospect"}
                    </span>
                  </td>

                  {/* CRM Status */}
                  <td className="py-3 px-3">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-muted)] font-medium">
                      {lead.prospect_status === "Converted" || lead.prospect_status === "Qualified" ? "Interested" : lead.prospect_status}
                    </span>
                  </td>

                  {/* Quick Action Button */}
                  <td
                    className="py-3 px-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      {onQuickCall && (
                        <button
                          type="button"
                          onClick={() => onQuickCall(lead.phone_number)}
                          className="p-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] bg-[var(--color-background)] transition-colors cursor-pointer"
                          title={`Call ${lead.full_name}`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectLead(lead)}
                        className="px-2.5 py-1 text-xs font-medium rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>View</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2 bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
          <div>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} leads
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-background)] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono font-semibold text-[var(--color-heading)]">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-background)] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
