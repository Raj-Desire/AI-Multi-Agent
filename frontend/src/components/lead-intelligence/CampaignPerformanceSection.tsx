import React, { useState } from "react";
import { CampaignLeadStat } from "../../types";
import { Megaphone, ArrowUpDown, ChevronRight } from "lucide-react";

interface CampaignPerformanceSectionProps {
  campaigns: CampaignLeadStat[];
  isLoading: boolean;
  selectedCampaignId: string;
  onSelectCampaign: (campaignId: string) => void;
}

type SortField = "total_leads" | "interested" | "callback_requested" | "needs_follow_up" | "no_answer" | "conversion_rate" | "campaign_name";

export function CampaignPerformanceSection({
  campaigns,
  isLoading,
  selectedCampaignId,
  onSelectCampaign,
}: CampaignPerformanceSectionProps) {
  const [sortField, setSortField] = useState<SortField>("total_leads");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    let valA = a[sortField] ?? 0;
    let valB = b[sortField] ?? 0;

    if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = (valB as string).toLowerCase();
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    }

    return sortOrder === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
  });

  return (
    <div className="p-4 sm:p-5 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[var(--color-primary)]" />
            <h3 className="text-sm font-bold text-[var(--color-heading)]">
              Leads by Campaign
            </h3>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Identify which outbound campaigns yield the highest lead volume
          </p>
        </div>

        {selectedCampaignId && selectedCampaignId !== "all" && (
          <button
            onClick={() => onSelectCampaign("all")}
            className="text-xs text-[var(--color-primary)] hover:underline font-medium cursor-pointer self-start sm:self-auto"
          >
            Show All Campaigns
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 py-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-[var(--color-border)]/40 rounded animate-pulse" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-muted)]">
          No campaign data available for this range.
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[700px] text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)] font-semibold bg-[var(--color-background)]/50">
                <th
                  onClick={() => handleSort("campaign_name")}
                  className="py-2.5 px-3 cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Campaign</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("interested")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Interested</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("callback_requested")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Callbacks</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("needs_follow_up")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Information Requested</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("no_answer")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>No Answer</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("total_leads")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--color-text)] transition-colors font-bold text-[var(--color-heading)]"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total Leads</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("conversion_rate")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--color-text)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Yield Rate</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-center w-10">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]/60">
              {sortedCampaigns.map((cmp) => {
                const isSelected = selectedCampaignId === cmp.campaign_id;
                return (
                  <tr
                    key={cmp.campaign_id}
                    onClick={() => onSelectCampaign(cmp.campaign_id)}
                    className={`transition-colors cursor-pointer group hover:bg-[var(--color-surface-hover,var(--color-border)/20)] ${
                      isSelected ? "bg-[var(--color-primary)]/10 font-semibold" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-medium text-[var(--color-heading)]">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[200px]">{cmp.campaign_name}</span>
                        {isSelected && (
                          <span className="text-[10px] bg-[var(--color-primary)] text-[var(--color-on-primary,white)] px-1.5 py-0.2 rounded font-semibold shrink-0">
                            Active Filter
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      {cmp.interested}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-purple-600 dark:text-purple-400">
                      {cmp.callback_requested}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-blue-600 dark:text-blue-400">
                      {cmp.needs_follow_up}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-500 dark:text-slate-400">
                      {cmp.no_answer}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--color-heading)]">
                      {cmp.total_leads}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[var(--color-muted)]">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <div className="w-12 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden hidden sm:block">
                          <div
                            style={{ width: `${Math.min(cmp.conversion_rate, 100)}%` }}
                            className="h-full bg-[var(--color-primary)] rounded-full"
                          />
                        </div>
                        <span>{cmp.conversion_rate}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="w-4 h-4 inline-block" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
