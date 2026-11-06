import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, FileSpreadsheet, FileText, Download, CheckCircle2, Sparkles, Printer, Filter } from "lucide-react";
import { Button } from "../ui/Button";
import { LeadKPISummary, CampaignLeadStat, AgentLeadStat, LeadListItem, LeadListPaginationResponse, QualificationTier } from "../../types";
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
  activeTab: "all_leads" | "interested" | "callbacks" | "calendar" | "analytics" | "cohorts";
  dateRangeLabel: string;
  qualificationTiers?: QualificationTier[];
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
  qualificationTiers = [],
}: ExecutiveReportExportModalProps) {
  const [activeFormat, setActiveFormat] = useState<"excel" | "pdf">("excel");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [filteredLeadsCount, setFilteredLeadsCount] = useState<number>(leads.length);
  const [isFetchingCount, setIsFetchingCount] = useState<boolean>(false);

  // Helper to build query parameters matching all active filters
  const buildFilterQueryParams = (page: number = 1, pageSize: number = 250) => {
    const params = new URLSearchParams({
      page: page.toString(),
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

    if (filters.selectedTiers && filters.selectedTiers.length > 0) {
      params.set("qualification_tiers", filters.selectedTiers.join(","));
    }

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

  // Helper to determine tier name for any lead
  const getLeadTierName = (lead: LeadListItem) => {
    if (lead.tier_label) return lead.tier_label;
    if (qualificationTiers && qualificationTiers.length > 0) {
      const sorted = [...qualificationTiers].sort((a, b) => b.min_score - a.min_score);
      const match = sorted.find((t) => lead.lead_score >= t.min_score);
      if (match) return match.name;
    }
    if (lead.lead_score >= 70) return "Qualified (Hot)";
    if (lead.lead_score >= 40) return "Warm Interested";
    return "Cold Lead";
  };

  // Helper to fetch all filtered leads across all pages cleanly
  const fetchAllMatchingLeads = async (): Promise<LeadListItem[]> => {
    const allItems: LeadListItem[] = [];
    const pageSize = 250;
    let currentPage = 1;
    let totalItems = 0;

    // First page
    const params = buildFilterQueryParams(currentPage, pageSize);
    const firstRes = await fetchApi<LeadListPaginationResponse>(`/lead-intelligence/leads?${params.toString()}`);
    if (firstRes?.items) {
      allItems.push(...firstRes.items);
      totalItems = firstRes.total || firstRes.items.length;
    }

    const totalPages = Math.ceil(totalItems / pageSize);
    while (currentPage < totalPages && currentPage < 20) {
      currentPage += 1;
      const nextParams = buildFilterQueryParams(currentPage, pageSize);
      const nextRes = await fetchApi<LeadListPaginationResponse>(`/lead-intelligence/leads?${nextParams.toString()}`);
      if (nextRes?.items && nextRes.items.length > 0) {
        allItems.push(...nextRes.items);
      } else {
        break;
      }
    }

    return allItems.length > 0 ? allItems : leads;
  };

  // Fetch count of matching leads across all pages when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsFetchingCount(true);

    const fetchCount = async () => {
      try {
        const params = buildFilterQueryParams(1, 1);
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

  // 1. High-Quality Excel Export (All filtered pages, styled columns)
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const fullLeads = await fetchAllMatchingLeads();

      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive KPI Overview
      const overviewData = [
        ["Executive Lead Intelligence & Performance Report"],
        ["Report Generated", new Date().toLocaleString()],
        ["Analysis Period", dateRangeLabel],
        [],
        ["APPLIED FILTER CONFIGURATION"],
        ["Search Query", filters.search ? `"${filters.search}"` : "None (All Prospects)"],
        ["Campaign", filters.campaignId !== "all" ? filters.campaignId : "All Campaigns"],
        ["AI Voice Agent", filters.agentId !== "all" ? filters.agentId : "All Agents"],
        ["Call Outcome", filters.outcome !== "all" ? filters.outcome : "All Outcomes"],
        ["Qualification Tiers", filters.selectedTiers && filters.selectedTiers.length > 0 ? filters.selectedTiers.join(", ") : "All Tiers"],
        ["Score Range", filters.scoreRange !== "all" ? filters.scoreRange : "All Scores (0-100)"],
        ["CRM Status", filters.prospectStatus !== "all" ? filters.prospectStatus : "All Statuses"],
        ["Follow-up Filter", filters.followUp !== "all" ? filters.followUp : "All Follow-ups"],
        [],
        ["EXECUTIVE SUMMARY METRICS"],
        ["Metric Name", "Value", "Details / Context"],
        ["Total Leads Exported", fullLeads.length, "Filtered Result Set"],
        ["Total Calls Analyzed in Period", summary?.total_leads || fullLeads.length, summary?.total_leads_change_pct ? `${summary.total_leads_change_pct}% period change` : "Current Period"],
        ["Qualified / Interested Leads", summary?.interested || 0, summary?.interested_change_pct ? `${summary.interested_change_pct}% period change` : "High Priority"],
        ["Scheduled Callbacks", summary?.callback_requested || 0, summary?.callback_change_pct ? `${summary.callback_change_pct}% period change` : "Actionable Follow-up"],
        ["Requires Follow-Up", summary?.needs_follow_up || 0, "Scheduled & pending outreach"],
        ["No Answer / Voicemail", summary?.no_answer || 0, "Outreach retries queued"],
        ["Average Lead Viability Score", summary?.avg_lead_score || 0, "Scale of 0 - 100"],
        ["Average Call Duration (seconds)", summary?.avg_call_duration_seconds || 0, "Conversation depth"],
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
      wsOverview["!cols"] = [{ wch: 32 }, { wch: 28 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(wb, wsOverview, "Overview & KPIs");

      // Sheet 2: Filtered Leads Roster (Includes all pages)
      const leadsHeaders = [
        "#",
        "Prospect Name",
        "Phone Number",
        "Email",
        "Company",
        "Campaign",
        "AI Agent",
        "Outcome",
        "Qualification Tier",
        "Lead Score (0-100)",
        "Last Call Date",
        "Duration (s)",
        "Callback Scheduled",
        "Next Recommended Action",
        "CRM Status",
        "Call Summary & Insights",
      ];
      const leadsRows = fullLeads.map((l, idx) => [
        idx + 1,
        l.full_name || "Unknown Prospect",
        l.phone_number || "",
        l.email || "",
        l.company || "",
        l.campaign_name || "AI Dialer",
        l.agent_name || "AI Agent",
        l.business_outcome || "Not Set",
        getLeadTierName(l),
        l.lead_score ?? 0,
        l.last_call_at ? new Date(l.last_call_at).toLocaleString() : "",
        l.last_call_duration ?? 0,
        l.callback_datetime ? new Date(l.callback_datetime).toLocaleString() : "",
        l.next_action || "",
        l.prospect_status || "Lead",
        l.summary || "",
      ]);
      const wsLeads = XLSX.utils.aoa_to_sheet([leadsHeaders, ...leadsRows]);
      wsLeads["!cols"] = [
        { wch: 6 },
        { wch: 24 },
        { wch: 18 },
        { wch: 26 },
        { wch: 20 },
        { wch: 18 },
        { wch: 26 },
        { wch: 18 },
        { wch: 20 },
        { wch: 18 },
        { wch: 20 },
        { wch: 14 },
        { wch: 22 },
        { wch: 34 },
        { wch: 16 },
        { wch: 50 },
      ];
      XLSX.utils.book_append_sheet(wb, wsLeads, "Qualified Leads Roster");

      // Sheet 3: Campaign Performance
      if (campaigns && campaigns.length > 0) {
        const campaignHeaders = [
          "Campaign Name",
          "Status",
          "Total Prospects",
          "Interested",
          "Callbacks",
          "Conversion Rate (%)",
        ];
        const campaignRows = campaigns.map((c) => [
          c.campaign_name || c.campaign_id,
          c.status,
          c.total_leads,
          c.interested,
          c.callback_requested,
          c.conversion_rate,
        ]);
        const wsCampaigns = XLSX.utils.aoa_to_sheet([campaignHeaders, ...campaignRows]);
        wsCampaigns["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsCampaigns, "Campaign Performance");
      }

      // Sheet 4: Voice Agent Performance
      if (agents && agents.length > 0) {
        const agentHeaders = [
          "Voice Agent Name",
          "Total Calls Handled",
          "Interested Leads",
          "Callbacks Scheduled",
          "Avg Lead Score",
        ];
        const agentRows = agents.map((a) => [
          a.agent_name || a.agent_id,
          a.total_calls,
          a.interested_leads,
          a.callback_leads,
          a.avg_lead_score,
        ]);
        const wsAgents = XLSX.utils.aoa_to_sheet([agentHeaders, ...agentRows]);
        wsAgents["!cols"] = [{ wch: 32 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsAgents, "Agent Performance");
      }

      const fileName = `Lead_Intelligence_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      fetchApi("/activity/event", { method: "POST", body: JSON.stringify({ event: "export_report_excel" }) }).catch(() => {});
      toast.success(`Executive Excel report exported with ${fullLeads.length} leads across all pages.`);
      onClose();
    } catch (err: any) {
      toast.error("Failed to generate Excel report: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // 2. High-Density Executive PDF Document (Clean, professional, multi-page layout via dedicated print window)
  const handlePrintPDF = async () => {
    setIsExporting(true);
    try {
      // 1. Fetch ALL matching leads across all pages
      const fullLeads = await fetchAllMatchingLeads();

      // 2. Prepare filter description tags
      const filterBadges: string[] = [];
      if (filters.search.trim()) filterBadges.push(`Search: "${filters.search.trim()}"`);
      if (filters.campaignId !== "all") filterBadges.push(`Campaign: ${filters.campaignId}`);
      if (filters.agentId !== "all") {
        const foundAgent = agents.find((a) => a.agent_id === filters.agentId);
        filterBadges.push(`Agent: ${foundAgent ? foundAgent.agent_name : filters.agentId}`);
      }
      if (filters.outcome !== "all") filterBadges.push(`Outcome: ${filters.outcome}`);
      if (filters.selectedTiers && filters.selectedTiers.length > 0) {
        filterBadges.push(`Tiers: ${filters.selectedTiers.join(", ")}`);
      }
      if (filters.scoreRange !== "all") filterBadges.push(`Score: ${filters.scoreRange}`);
      if (filters.prospectStatus !== "all") filterBadges.push(`Status: ${filters.prospectStatus}`);
      if (filters.followUp !== "all") filterBadges.push(`Follow-up: ${filters.followUp}`);

      const totalLeadsCount = fullLeads.length;
      const interestedCount = summary?.interested ?? fullLeads.filter(l => l.business_outcome === "interested").length;
      const callbackCount = summary?.callback_requested ?? fullLeads.filter(l => l.business_outcome === "callback_requested").length;
      const avgScore = summary?.avg_lead_score ?? (fullLeads.length ? Math.round(fullLeads.reduce((a, b) => a + (b.lead_score || 0), 0) / fullLeads.length) : 0);

      // 3. Build HTML table rows
      const tableRowsHtml = fullLeads
        .map((lead, idx) => {
          const tier = getLeadTierName(lead);
          let outcomeColor = "#475569";
          let outcomeBg = "#f1f5f9";
          const outcomeLower = (lead.business_outcome || "").toLowerCase();
          if (outcomeLower.includes("interest") || outcomeLower.includes("qualified")) {
            outcomeColor = "#047857";
            outcomeBg = "#ecfdf5";
          } else if (outcomeLower.includes("callback")) {
            outcomeColor = "#6d28d9";
            outcomeBg = "#f5f3ff";
          } else if (outcomeLower.includes("follow")) {
            outcomeColor = "#b45309";
            outcomeBg = "#fffbeb";
          } else if (outcomeLower.includes("not") || outcomeLower.includes("wrong")) {
            outcomeColor = "#b91c1c";
            outcomeBg = "#fef2f2";
          }

          let tierBadgeColor = "#334155";
          let tierBadgeBg = "#f1f5f9";
          const tierLower = tier.toLowerCase();
          if (tierLower.includes("hot") || tierLower.includes("qualif")) {
            tierBadgeColor = "#059669";
            tierBadgeBg = "#ecfdf5";
          } else if (tierLower.includes("warm")) {
            tierBadgeColor = "#d97706";
            tierBadgeBg = "#fffbeb";
          } else if (tierLower.includes("cold")) {
            tierBadgeColor = "#64748b";
            tierBadgeBg = "#f8fafc";
          }

          const callTime = lead.last_call_at
            ? new Date(lead.last_call_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : "—";

          return `
            <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
              <td style="padding: 7px 8px; font-size: 11px; color: #64748b; text-align: center;">${idx + 1}</td>
              <td style="padding: 7px 8px;">
                <div style="font-weight: 600; font-size: 11.5px; color: #0f172a;">${lead.full_name || "Prospect"}</div>
                <div style="font-size: 10px; color: #64748b; margin-top: 1px;">${lead.phone_number || ""}</div>
              </td>
              <td style="padding: 7px 8px; font-size: 11px; color: #334155;">${lead.campaign_name || "AI Dialer"}</td>
              <td style="padding: 7px 8px; font-size: 11px; color: #334155;">${lead.agent_name || "AI Voice Agent"}</td>
              <td style="padding: 7px 8px;">
                <span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; background: ${outcomeBg}; color: ${outcomeColor}; text-transform: capitalize;">
                  ${(lead.business_outcome || "Unknown").replace(/_/g, " ")}
                </span>
              </td>
              <td style="padding: 7px 8px;">
                <span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; background: ${tierBadgeBg}; color: ${tierBadgeColor}; border: 1px solid ${tierBadgeColor}25;">
                  ${tier}
                </span>
              </td>
              <td style="padding: 7px 8px; text-align: center;">
                <div style="font-weight: 700; font-size: 11.5px; color: ${lead.lead_score >= 70 ? "#059669" : lead.lead_score >= 40 ? "#d97706" : "#64748b"};">
                  ${lead.lead_score ?? 0}
                </div>
              </td>
              <td style="padding: 7px 8px; font-size: 10.5px; color: #64748b; white-space: nowrap;">${callTime}</td>
              <td style="padding: 7px 8px; font-size: 10.5px; color: #334155; max-width: 220px;">
                <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lead.next_action || lead.summary || "—"}</div>
              </td>
            </tr>
          `;
        })
        .join("");

      // 4. Construct high-fidelity HTML report for clean print preview
      const reportHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Lead Intelligence Executive Report - ${new Date().toISOString().slice(0, 10)}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 12mm 10mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .header-bar {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 14px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .title-area h1 {
              font-size: 19px;
              font-weight: 800;
              margin: 0 0 4px 0;
              color: #0f172a;
              letter-spacing: -0.3px;
            }
            .title-area p {
              font-size: 11px;
              color: #64748b;
              margin: 0;
            }
            .meta-box {
              text-align: right;
              font-size: 10.5px;
              color: #64748b;
              line-height: 1.4;
            }
            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 14px;
            }
            .kpi-card {
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 9px 12px;
              background: #f8fafc;
            }
            .kpi-card .label {
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748b;
            }
            .kpi-card .value {
              font-size: 20px;
              font-weight: 800;
              color: #0f172a;
              margin-top: 2px;
            }
            .filter-banner {
              background: #f1f5f9;
              border-radius: 6px;
              padding: 6px 12px;
              font-size: 10.5px;
              color: #334155;
              margin-bottom: 12px;
              display: flex;
              flex-wrap: wrap;
              gap: 6px;
              align-items: center;
            }
            .badge {
              background: #ffffff;
              border: 1px solid #cbd5e1;
              padding: 1px 6px;
              border-radius: 4px;
              font-weight: 500;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
            }
            thead th {
              background: #f8fafc;
              border-bottom: 2px solid #cbd5e1;
              padding: 8px 8px;
              text-align: left;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.4px;
              color: #475569;
            }
            .footer-note {
              margin-top: 14px;
              border-top: 1px solid #e2e8f0;
              padding-top: 8px;
              font-size: 9.5px;
              color: #94a3b8;
              display: flex;
              justify-content: space-between;
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <div class="title-area">
              <h1>Lead Intelligence &amp; Performance Executive Report</h1>
              <p>Period: <strong>${dateRangeLabel}</strong> &bull; Generated: ${new Date().toLocaleString()}</p>
            </div>
            <div class="meta-box">
              <div><strong>AI Voice Platform</strong></div>
              <div>Matching Leads: <strong>${totalLeadsCount}</strong></div>
              <div>Confidential Business Document</div>
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="label">Exported Leads</div>
              <div class="value">${totalLeadsCount}</div>
            </div>
            <div class="kpi-card">
              <div class="label">Qualified / Interested</div>
              <div class="value" style="color: #059669;">${interestedCount}</div>
            </div>
            <div class="kpi-card">
              <div class="label">Callbacks Scheduled</div>
              <div class="value" style="color: #7c3aed;">${callbackCount}</div>
            </div>
            <div class="kpi-card">
              <div class="label">Average Lead Score</div>
              <div class="value" style="color: #2563eb;">${avgScore}<span style="font-size: 12px; font-weight: normal; color: #64748b;">/100</span></div>
            </div>
          </div>

          <div class="filter-banner">
            <strong>Applied Filters:</strong>
            ${filterBadges.length > 0
              ? filterBadges.map((b) => `<span class="badge">${b}</span>`).join(" ")
              : "<span class=\"badge\">All Leads (Unfiltered)</span>"}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 28px; text-align: center;">#</th>
                <th style="width: 150px;">Prospect &amp; Phone</th>
                <th style="width: 90px;">Campaign</th>
                <th style="width: 130px;">AI Agent</th>
                <th style="width: 90px;">Outcome</th>
                <th style="width: 110px;">Qualification Tier</th>
                <th style="width: 50px; text-align: center;">Score</th>
                <th style="width: 95px;">Last Call</th>
                <th>Next Action / AI Note</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>

          <div class="footer-note">
            <span>AI Voice Platform &bull; Lead Qualification &amp; Performance Telemetry</span>
            <span>Total Exported: ${totalLeadsCount} Records &bull; Multi-Page Executive Dataset</span>
          </div>
        </body>
        </html>
      `;

      // 5. Open clean print window and trigger native print/save as PDF
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Pop-up blocked. Please allow pop-ups for this site to generate the PDF report.");
        return;
      }

      printWindow.document.open();
      printWindow.document.write(reportHtml);
      printWindow.document.close();

      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };

      fetchApi("/activity/event", { method: "POST", body: JSON.stringify({ event: "export_report_pdf" }) }).catch(() => {});
      toast.success(`Executive PDF report prepared for ${totalLeadsCount} leads across all pages.`);
      onClose();
    } catch (err: any) {
      toast.error("Failed to prepare PDF report: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.75rem)] shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-heading)]">
                Export Lead Intelligence Report
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Period: {dateRangeLabel} &bull; Complete dataset across all pages
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
            Choose Export Format
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
                Multi-tab structured workbook with KPIs, full leads roster with qualification tiers, campaigns &amp; agents.
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
                Clean, high-density executive report with structured table columns, KPI summary cards &amp; applied filter tags.
              </p>
            </div>
          </div>

          {/* Report Preview Highlights */}
          <div className="p-3.5 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Report Scope &amp; Filter Summary
              </div>
              <div className="text-[11px] font-medium text-[var(--color-primary)] flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>
                  {isFetchingCount ? "Calculating total..." : `${filteredLeadsCount} Leads to Export`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-muted)]">
              <div>&bull; Total Calls Analyzed: <strong className="text-[var(--color-text)]">{summary?.total_leads || filteredLeadsCount}</strong></div>
              <div>&bull; Qualified / Interested: <strong className="text-emerald-600">{summary?.interested || 0}</strong></div>
              <div>&bull; Callbacks Scheduled: <strong className="text-purple-600">{summary?.callback_requested || 0}</strong></div>
              <div>&bull; Avg Lead Score: <strong className="text-[var(--color-primary)]">{summary?.avg_lead_score || 0}/100</strong></div>
            </div>
            {filters.outcome !== "all" || filters.campaignId !== "all" || filters.scoreRange !== "all" || (filters.selectedTiers && filters.selectedTiers.length > 0) || filters.search.trim() ? (
              <div className="pt-1.5 border-t border-[var(--color-border)] text-[10px] text-[var(--color-muted)] flex flex-wrap gap-1.5 items-center">
                <span className="font-semibold text-[var(--color-heading)]">Active Filters:</span>
                {filters.outcome !== "all" && <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">Outcome: {filters.outcome}</span>}
                {filters.campaignId !== "all" && <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">Campaign: {filters.campaignId}</span>}
                {filters.selectedTiers && filters.selectedTiers.length > 0 && <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">Tiers: {filters.selectedTiers.join(", ")}</span>}
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
            {isExporting ? "Generating..." : activeFormat === "excel" ? "Download Excel (.xlsx)" : "Generate & Print PDF"}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
