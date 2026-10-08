import React, { useState, useEffect } from "react";
import { X, FileSpreadsheet, FileText, Download, CheckCircle2, Calendar, Sparkles, Printer, Filter } from "lucide-react";
import { Button } from "../ui/Button";
import { LeadKPISummary, CampaignLeadStat, AgentLeadStat, LeadListItem, LeadListPaginationResponse } from "../../types";
import { LeadFilterState } from "./LeadFilterBar";
import { fetchApi } from "../../api-client";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface ExecutiveReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: LeadKPISummary | null;
  campaigns: CampaignLeadStat[];
  agents: AgentLeadStat[];
  leads: LeadListItem[];
  filters: LeadFilterState;
  activeTab: "all_leads" | "interested" | "callbacks" | "analytics" | "cohorts";
  dateRangeLabel: string;
}

export function ExecutiveReportExportModal({
  isOpen,
  onClose,
  summary,
  campaigns,
  agents,
  leads,
  filters,
  activeTab,
  dateRangeLabel,
}: ExecutiveReportExportModalProps) {
  const [activeFormat, setActiveFormat] = useState<"excel" | "pdf">("excel");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [filteredLeadsCount, setFilteredLeadsCount] = useState<number>(leads.length);
  const [isFetchingCount, setIsFetchingCount] = useState<boolean>(false);

  // Helper to build query parameters matching current active filters
  const buildFilterQueryParams = (pageSize: number = 50000) => {
    const params = new URLSearchParams({
      page: "1",
      page_size: pageSize.toString(),
      sort_by: "last_call_at",
      sort_order: "desc",
    });

    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.dateRange !== "all") params.set("date_range", filters.dateRange);
    if (filters.customStart) params.set("custom_start", filters.customStart);
    if (filters.customEnd) params.set("custom_end", filters.customEnd);
    if (filters.campaignId !== "all") params.set("campaign_id", filters.campaignId);
    if (filters.outcome !== "all") params.set("outcome", filters.outcome);
    if (filters.interestLevel !== "all") params.set("interest_level", filters.interestLevel);
    if (filters.agentId !== "all") params.set("agent_id", filters.agentId);
    if (filters.prospectStatus !== "all") params.set("prospect_status", filters.prospectStatus);
    if (filters.followUp !== "all") params.set("follow_up", filters.followUp);

    if (filters.scoreRange === "70_100" || filters.scoreRange === "81_100") {
      params.set("min_score", "70");
      params.set("max_score", "100");
    } else if (filters.scoreRange === "40_69" || filters.scoreRange === "61_80") {
      params.set("min_score", "40");
      params.set("max_score", "69");
    } else if (filters.scoreRange === "0_39" || filters.scoreRange === "0_30" || filters.scoreRange === "31_60") {
      params.set("min_score", "0");
      params.set("max_score", "39");
    }

    const isOnlyHighValue = activeTab === "interested" && filters.outcome === "all";
    params.set("only_high_value", isOnlyHighValue ? "true" : "false");

    return params;
  };

  // Fetch count of matching leads when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsFetchingCount(true);

    const fetchCount = async () => {
      try {
        const params = buildFilterQueryParams(1);
        const res = await fetchApi<LeadListPaginationResponse>(`/lead-intelligence/leads?${params.toString()}`);
        if (isMounted && res) {
          setFilteredLeadsCount(res.total ?? leads.length);
        }
      } catch (err) {
        if (isMounted) setFilteredLeadsCount(leads.length);
      } finally {
        if (isMounted) setIsFetchingCount(false);
      }
    };

    fetchCount();

    return () => {
      isMounted = false;
    };
  }, [isOpen, filters, activeTab]);

  if (!isOpen) return null;

  // 1. Excel Export (Multi-Tab Workbook via SheetJS xlsx)
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      // Fetch all leads that match active filters
      const params = buildFilterQueryParams(50000);
      const res = await fetchApi<LeadListPaginationResponse>(`/lead-intelligence/leads?${params.toString()}`);
      const fullLeads = res?.items && res.items.length > 0 ? res.items : leads;

      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive KPI Overview
      const overviewData = [
        ["AI Voice Platform - Executive Call Intelligence Summary"],
        ["Period", dateRangeLabel],
        ["Filter Applied - Search", filters.search || "None"],
        ["Filter Applied - Campaign", filters.campaignId !== "all" ? filters.campaignId : "All Campaigns"],
        ["Filter Applied - Outcome", filters.outcome !== "all" ? filters.outcome : "All Outcomes"],
        ["Filter Applied - Status", filters.prospectStatus !== "all" ? filters.prospectStatus : "All Statuses"],
        ["Filter Applied - Score Range", filters.scoreRange !== "all" ? filters.scoreRange : "All Scores"],
        ["Report Generated At (UTC)", new Date().toISOString()],
        [],
        ["Metric", "Value", "Period Comparison"],
        ["Total Analyzed Calls/Leads", summary?.total_leads || 0, summary?.total_leads_change_pct ? `${summary.total_leads_change_pct}%` : "N/A"],
        ["Interested Prospects", summary?.interested || 0, summary?.interested_change_pct ? `${summary.interested_change_pct}%` : "N/A"],
        ["Callbacks Scheduled", summary?.callback_requested || 0, summary?.callback_change_pct ? `${summary.callback_change_pct}%` : "N/A"],
        ["Needs Follow-up", summary?.needs_follow_up || 0, summary?.needs_follow_up_change_pct ? `${summary.needs_follow_up_change_pct}%` : "N/A"],
        ["No Answer / Voicemail", summary?.no_answer || 0, summary?.no_answer_change_pct ? `${summary.no_answer_change_pct}%` : "N/A"],
        ["Average Lead Score", summary?.avg_lead_score || 0, "Scale 0 - 100"],
        ["Average Call Duration (sec)", summary?.avg_call_duration_seconds || 0, "Seconds"],
        ["Exported Leads Count (Matching Filters)", fullLeads.length, "Unique Prospects"],
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(wb, wsOverview, "Executive KPIs");

      // Sheet 2: Leads Roster (Full filtered leads dataset)
      const leadsHeaders = [
        "Full Name",
        "Company",
        "Phone Number",
        "Email",
        "Campaign",
        "Voice Agent",
        "Business Outcome",
        "Interest Level",
        "Lead Score",
        "Call Duration (sec)",
        "Callback Scheduled",
        "Next Action",
        "CRM Status",
        "AI Executive Summary",
      ];
      const leadsRows = fullLeads.map((l) => [
        l.full_name,
        l.company || "",
        l.phone_number,
        l.email || "",
        l.campaign_name || "",
        l.agent_name || "",
        l.business_outcome,
        l.interest_level,
        l.lead_score,
        l.last_call_duration,
        l.callback_datetime || "",
        l.next_action || "",
        l.prospect_status,
        l.summary || "",
      ]);
      const wsLeads = XLSX.utils.aoa_to_sheet([leadsHeaders, ...leadsRows]);
      XLSX.utils.book_append_sheet(wb, wsLeads, "Filtered Leads");

      // Sheet 3: Campaign Performance
      const campaignHeaders = [
        "Campaign ID",
        "Campaign Name",
        "Status",
        "Total Prospects",
        "Interested",
        "Callbacks",
        "Conversion Rate (%)",
      ];
      const campaignRows = campaigns.map((c) => [
        c.campaign_id,
        c.campaign_name,
        c.status,
        c.total_leads,
        c.interested,
        c.callback_requested,
        c.conversion_rate,
      ]);
      const wsCampaigns = XLSX.utils.aoa_to_sheet([campaignHeaders, ...campaignRows]);
      XLSX.utils.book_append_sheet(wb, wsCampaigns, "Campaigns");

      // Sheet 4: Voice Agent Performance
      const agentHeaders = [
        "Agent ID",
        "Agent Name",
        "Total Calls Handled",
        "Interested Generated",
        "Callbacks Captured",
        "Avg Lead Score",
      ];
      const agentRows = agents.map((a) => [
        a.agent_id,
        a.agent_name,
        a.total_calls,
        a.interested_leads,
        a.callback_leads,
        a.avg_lead_score,
      ]);
      const wsAgents = XLSX.utils.aoa_to_sheet([agentHeaders, ...agentRows]);
      XLSX.utils.book_append_sheet(wb, wsAgents, "Voice Agents");

      // Download file
      const fileName = `Executive_Call_Analytics_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Excel report exported with ${fullLeads.length} filtered leads.`);
      onClose();
    } catch (err: any) {
      toast.error("Failed to generate Excel report: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // 2. High-Density Executive PDF Summary View / Browser Print
  const handlePrintPDF = () => {
    window.print();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.75rem)] shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-heading)]">
                Export Executive Summary Report
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Period: {dateRangeLabel} &bull; Generated from real-time call telemetry
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-text)] p-1.5 rounded-md hover:bg-[var(--color-background)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selection */}
        <div className="p-6 space-y-4">
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
            Choose Report Format
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Excel Option */}
            <div
              onClick={() => setActiveFormat("excel")}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                activeFormat === "excel"
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]"
                  : "border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-muted)]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-600">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                {activeFormat === "excel" && (
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-primary)]" />
                )}
              </div>
              <div className="text-sm font-bold text-[var(--color-heading)]">
                Excel Workbook (.xlsx)
              </div>
              <p className="text-[11px] text-[var(--color-muted)] mt-1">
                Multi-tab workbook with Executive KPIs, Leads Roster, Campaign Performance, and Agent metrics.
              </p>
            </div>

            {/* PDF Option */}
            <div
              onClick={() => setActiveFormat("pdf")}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                activeFormat === "pdf"
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]"
                  : "border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-muted)]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-md bg-rose-500/10 text-rose-600">
                  <FileText className="w-5 h-5" />
                </div>
                {activeFormat === "pdf" && (
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-primary)]" />
                )}
              </div>
              <div className="text-sm font-bold text-[var(--color-heading)]">
                Executive PDF Document
              </div>
              <p className="text-[11px] text-[var(--color-muted)] mt-1">
                High-density, print-ready executive summary format with KPI badges and conversion breakdown.
              </p>
            </div>
          </div>

          {/* Report Preview Highlights */}
          <div className="p-3.5 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Report Scope &amp; Active Filter Roster
              </div>
              <div className="text-[11px] font-medium text-[var(--color-primary)] flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>
                  {isFetchingCount ? "Calculating..." : `${filteredLeadsCount} Leads to Export`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-muted)]">
              <div>&bull; Total Calls Analyzed: <strong className="text-[var(--color-text)]">{summary?.total_leads || 0}</strong></div>
              <div>&bull; Qualified / Interested: <strong className="text-emerald-600">{summary?.interested || 0}</strong></div>
              <div>&bull; Callbacks Scheduled: <strong className="text-purple-600">{summary?.callback_requested || 0}</strong></div>
              <div>&bull; Avg Lead Score: <strong className="text-indigo-600">{summary?.avg_lead_score || 0}/100</strong></div>
            </div>
            {filters.outcome !== "all" || filters.campaignId !== "all" || filters.scoreRange !== "all" || filters.search.trim() ? (
              <div className="pt-1.5 border-t border-[var(--color-border)] text-[10px] text-[var(--color-muted)] flex flex-wrap gap-1.5 items-center">
                <span className="font-semibold text-[var(--color-heading)]">Active Filters:</span>
                {filters.outcome !== "all" && <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">Outcome: {filters.outcome}</span>}
                {filters.campaignId !== "all" && <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">Campaign: {filters.campaignId}</span>}
                {filters.scoreRange !== "all" && <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">Score: {filters.scoreRange}</span>}
                {filters.search.trim() && <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">Search: "{filters.search.trim()}"</span>}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={activeFormat === "excel" ? handleExportExcel : handlePrintPDF}
            disabled={isExporting}
            leftIcon={activeFormat === "excel" ? <FileSpreadsheet className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
          >
            {isExporting ? "Generating..." : activeFormat === "excel" ? "Download Excel Workbook" : "Print / Save PDF"}
          </Button>
        </div>
      </div>
    </div>
  );
}
