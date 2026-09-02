import React, { useState } from "react";
import { CampaignLeadStat, AgentLeadStat } from "../../types";
import {
  Search,
  X,
  Download,
  Sparkles,
  PhoneForwarded,
  HelpCircle,
  PhoneOff,
  SlidersHorizontal
} from "lucide-react";
import { Button } from "../ui/Button";

export interface LeadFilterState {
  search: string;
  dateRange: string;
  customStart: string;
  customEnd: string;
  campaignId: string;
  outcome: string;
  interestLevel: string;
  scoreRange: string;
  agentId: string;
  prospectStatus: string;
  followUp: string;
}

interface LeadFilterBarProps {
  filters: LeadFilterState;
  onFilterChange: (newFilters: Partial<LeadFilterState>) => void;
  onResetFilters: () => void;
  campaigns: CampaignLeadStat[];
  agents: AgentLeadStat[];
  onExportCsv: () => void;
  isExporting: boolean;
}

export function LeadFilterBar({
  filters,
  onFilterChange,
  onResetFilters,
  campaigns,
  agents,
  onExportCsv,
  isExporting,
}: LeadFilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.search);

  // Synchronize local search if parent clears filter
  React.useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  // Debounce search input by 300ms
  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFilterChange({ search: localSearch });
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearch, filters.search, onFilterChange]);

  // Quick Preset Handlers
  const applyPreset = (preset: string) => {
    switch (preset) {
      case "interested":
        onFilterChange({
          outcome: "Interested",
          interestLevel: "all",
          scoreRange: "all",
          campaignId: "all",
        });
        break;
      case "callbacks":
        onFilterChange({
          outcome: "Callback Requested",
          followUp: "all",
          interestLevel: "all",
        });
        break;
      case "needs_followup":
        onFilterChange({
          followUp: "needs_follow_up",
          outcome: "all",
          interestLevel: "all",
        });
        break;
      case "no_answer":
        onFilterChange({
          outcome: "No Answer",
          interestLevel: "all",
          scoreRange: "all",
        });
        break;
      default:
        onResetFilters();
    }
  };

  // Build active filter chips
  const activeChips: Array<{ id: string; label: string; onRemove: () => void }> = [];

  if (filters.search.trim()) {
    activeChips.push({
      id: "search",
      label: `Search: "${filters.search}"`,
      onRemove: () => onFilterChange({ search: "" }),
    });
  }
  if (filters.dateRange !== "all") {
    const dateLabels: Record<string, string> = {
      today: "Today",
      yesterday: "Yesterday",
      "7d": "Last 7 Days",
      "30d": "Last 30 Days",
      this_month: "This Month",
      previous_month: "Previous Month",
      custom: "Custom Date Range",
    };
    activeChips.push({
      id: "dateRange",
      label: dateLabels[filters.dateRange] || filters.dateRange,
      onRemove: () => onFilterChange({ dateRange: "all", customStart: "", customEnd: "" }),
    });
  }
  if (filters.campaignId !== "all" && filters.campaignId) {
    const cmpName = campaigns.find((c) => c.campaign_id === filters.campaignId)?.campaign_name || filters.campaignId;
    activeChips.push({
      id: "campaignId",
      label: `Campaign: ${cmpName}`,
      onRemove: () => onFilterChange({ campaignId: "all" }),
    });
  }
  if (filters.outcome !== "all" && filters.outcome) {
    activeChips.push({
      id: "outcome",
      label: `Outcome: ${filters.outcome}`,
      onRemove: () => onFilterChange({ outcome: "all" }),
    });
  }
  if (filters.interestLevel !== "all" && filters.interestLevel) {
    activeChips.push({
      id: "interestLevel",
      label: `Interest: ${filters.interestLevel}`,
      onRemove: () => onFilterChange({ interestLevel: "all" }),
    });
  }
  if (filters.scoreRange !== "all" && filters.scoreRange) {
    const scoreLabels: Record<string, string> = {
      "70_100": "Score 70–100 (High)",
      "40_69": "Score 40–69 (Moderate)",
      "0_39": "Score 0–39 (Low)",
    };
    activeChips.push({
      id: "scoreRange",
      label: scoreLabels[filters.scoreRange] || filters.scoreRange,
      onRemove: () => onFilterChange({ scoreRange: "all" }),
    });
  }
  if (filters.agentId !== "all" && filters.agentId) {
    const agName = agents.find((a) => a.agent_id === filters.agentId)?.agent_name || filters.agentId;
    activeChips.push({
      id: "agentId",
      label: `Agent: ${agName}`,
      onRemove: () => onFilterChange({ agentId: "all" }),
    });
  }
  if (filters.prospectStatus !== "all" && filters.prospectStatus) {
    activeChips.push({
      id: "prospectStatus",
      label: `Status: ${filters.prospectStatus}`,
      onRemove: () => onFilterChange({ prospectStatus: "all" }),
    });
  }
  if (filters.followUp !== "all" && filters.followUp) {
    const fuLabels: Record<string, string> = {
      needs_follow_up: "Needs Follow-up",
      scheduled: "Callback Scheduled",
      none: "No Follow-up",
    };
    activeChips.push({
      id: "followUp",
      label: fuLabels[filters.followUp] || filters.followUp,
      onRemove: () => onFilterChange({ followUp: "all" }),
    });
  }

  return (
    <div className="space-y-2.5">
      {/* Quick Saved Views Pills */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-bold text-[var(--color-muted)] uppercase tracking-wider mr-1">
            Quick Views:
          </span>
          <button
            onClick={() => onResetFilters()}
            className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all cursor-pointer ${
              activeChips.length === 0
                ? "bg-[var(--color-heading)] text-[var(--color-background)] font-semibold shadow-xs"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            All Leads
          </button>
          <button
            onClick={() => applyPreset("interested")}
            className="px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all cursor-pointer flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Interested</span>
          </button>
          <button
            onClick={() => applyPreset("callbacks")}
            className="px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-purple-500/50 hover:bg-purple-500/10 transition-all cursor-pointer flex items-center gap-1"
          >
            <PhoneForwarded className="w-3.5 h-3.5 text-purple-500" />
            <span>Callbacks</span>
          </button>
          <button
            onClick={() => applyPreset("needs_followup")}
            className="px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-blue-500/50 hover:bg-blue-500/10 transition-all cursor-pointer flex items-center gap-1"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
            <span>Needs Follow-up</span>
          </button>
          <button
            onClick={() => applyPreset("no_answer")}
            className="px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-slate-500/50 hover:bg-slate-500/10 transition-all cursor-pointer flex items-center gap-1"
          >
            <PhoneOff className="w-3.5 h-3.5 text-slate-500" />
            <span>No Answer</span>
          </button>
        </div>

        {/* Export CSV Action */}
        <div className="shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            disabled={isExporting}
            leftIcon={<Download className="w-3.5 h-3.5" />}
            className="cursor-pointer font-medium"
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Primary Filter Bar */}
      <div className="p-3 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            placeholder="Search prospect, company, phone, email..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          {localSearch && (
            <button
              onClick={() => {
                setLocalSearch("");
                onFilterChange({ search: "" });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-text)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Dropdown Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Range Dropdown */}
          <select
            value={filters.dateRange}
            onChange={(e) => onFilterChange({ dateRange: e.target.value })}
            className="px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
          >
            <option value="all">Date: All Time</option>
            <option value="today">Date: Today</option>
            <option value="yesterday">Date: Yesterday</option>
            <option value="7d">Date: Last 7 Days</option>
            <option value="30d">Date: Last 30 Days</option>
            <option value="this_month">Date: This Month</option>
            <option value="previous_month">Date: Previous Month</option>
            <option value="custom">Date: Custom Range</option>
          </select>

          {/* Campaign Dropdown */}
          <select
            value={filters.campaignId}
            onChange={(e) => onFilterChange({ campaignId: e.target.value })}
            className="px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer max-w-[180px] truncate"
          >
            <option value="all">Campaign: All</option>
            {campaigns.map((cmp) => (
              <option key={cmp.campaign_id} value={cmp.campaign_id}>
                {cmp.campaign_name}
              </option>
            ))}
          </select>

          {/* Outcome Dropdown */}
          <select
            value={filters.outcome}
            onChange={(e) => onFilterChange({ outcome: e.target.value })}
            className="px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
          >
            <option value="all">Outcome: All</option>
            <option value="Interested">Interested</option>
            <option value="Callback Requested">Callback Requested</option>
            <option value="Information Requested">Information Requested</option>
            <option value="No Answer">No Answer</option>
          </select>

          {/* Interest Level Dropdown */}
          <select
            value={filters.interestLevel}
            onChange={(e) => onFilterChange({ interestLevel: e.target.value })}
            className="px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
          >
            <option value="all">Interest: All</option>
            <option value="Interested">Interested</option>
            <option value="Callback">Callback</option>
            <option value="No Answer">No Answer</option>
          </select>

          {/* Toggle More Filters */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-2.5 py-1.5 text-xs rounded-[var(--radius-main,0.375rem)] border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showAdvanced
                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30 font-semibold"
                : "bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showAdvanced ? "Fewer Filters" : "More Filters"}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Advanced Filters Bar */}
      {showAdvanced && (
        <div className="p-3.5 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)]/80 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-in fade-in-50 duration-200">
          {/* Lead Score Range */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
              Lead Score (0-100)
            </label>
            <select
              value={filters.scoreRange}
              onChange={(e) => onFilterChange({ scoreRange: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
            >
              <option value="all">All Scores</option>
              <option value="70_100">70–100 (High)</option>
              <option value="40_69">40–69 (Moderate)</option>
              <option value="0_39">0–39 (Low)</option>
            </select>
          </div>

          {/* AI Voice Agent */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
              AI Voice Agent
            </label>
            <select
              value={filters.agentId}
              onChange={(e) => onFilterChange({ agentId: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
            >
              <option value="all">All Agents</option>
              {agents.map((ag) => (
                <option key={ag.agent_id} value={ag.agent_id}>
                  {ag.agent_name}
                </option>
              ))}
            </select>
          </div>

          {/* Prospect CRM Status */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
              Prospect CRM Status
            </label>
            <select
              value={filters.prospectStatus}
              onChange={(e) => onFilterChange({ prospectStatus: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
            >
              <option value="all">All CRM Statuses</option>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Interested">Interested</option>
              <option value="Callback Requested">Callback Requested</option>
              <option value="Do Not Contact">Do Not Call (DNC)</option>
            </select>
          </div>

          {/* Follow-up Action */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
              Follow-up Action
            </label>
            <select
              value={filters.followUp}
              onChange={(e) => onFilterChange({ followUp: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
            >
              <option value="all">All Follow-ups</option>
              <option value="needs_follow_up">Needs Follow-up</option>
              <option value="scheduled">Callback Scheduled</option>
              <option value="none">No Follow-up</option>
            </select>
          </div>

          {/* Custom Date Inputs if 'custom' dateRange is selected */}
          {filters.dateRange === "custom" && (
            <div className="sm:col-span-2 lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--color-border)]/60">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.customStart}
                  onChange={(e) => onFilterChange({ customStart: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.customEnd}
                  onChange={(e) => onFilterChange({ customEnd: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Filter Chips & Clear All */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[11px] text-[var(--color-muted)] mr-1">
            Active Filters ({activeChips.length}):
          </span>
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="hover:opacity-75 cursor-pointer ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={onResetFilters}
            className="text-[11px] text-[var(--color-muted)] hover:text-rose-500 underline ml-2 cursor-pointer font-medium"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
