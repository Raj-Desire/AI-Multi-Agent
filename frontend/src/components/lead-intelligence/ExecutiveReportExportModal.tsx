import React, { useState } from "react";
import { X, FileSpreadsheet, FileText, Download, CheckCircle2, Calendar, Sparkles, Printer } from "lucide-react";
import { Button } from "../ui/Button";
import { LeadKPISummary, CampaignLeadStat, AgentLeadStat, LeadListItem } from "../../types";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface ExecutiveReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: LeadKPISummary | null;
  campaigns: CampaignLeadStat[];
  agents: AgentLeadStat[];
  leads: LeadListItem[];
  dateRangeLabel: string;
}

export function ExecutiveReportExportModal({
  isOpen,
  onClose,
  summary,
  campaigns,
  agents,
  leads,
  dateRangeLabel,
}: ExecutiveReportExportModalProps) {
  const [activeFormat, setActiveFormat] = useState<"excel" | "pdf">("excel");
  const [isExporting, setIsExporting] = useState<boolean>(false);

  if (!isOpen) return null;

  // 1. Excel Export (Multi-Tab Workbook via SheetJS xlsx)
  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive KPI Overview
      const overviewData = [
        ["AI Voice Platform - Executive Call Intelligence Summary"],
        ["Period", dateRangeLabel],
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
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(wb, wsOverview, "Executive KPIs");

      // Sheet 2: Leads Roster
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
      const leadsRows = leads.map((l) => [
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
      XLSX.utils.book_append_sheet(wb, wsLeads, "Leads Intelligence");

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
      toast.success("Excel Executive Report generated successfully");
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
            <div className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              Report Scope Included
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-muted)]">
              <div>&bull; Total Calls Analyzed: <strong className="text-[var(--color-text)]">{summary?.total_leads || 0}</strong></div>
              <div>&bull; Qualified / Interested: <strong className="text-emerald-600">{summary?.interested || 0}</strong></div>
              <div>&bull; Callbacks Scheduled: <strong className="text-purple-600">{summary?.callback_requested || 0}</strong></div>
              <div>&bull; Avg Lead Score: <strong className="text-indigo-600">{summary?.avg_lead_score || 0}/100</strong></div>
            </div>
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
