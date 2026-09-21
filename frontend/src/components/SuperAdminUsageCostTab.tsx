import React, { useState, useEffect } from "react";
import { SuperAdminCostTelemetryResponse, OrgCostUsage } from "../types";
import { fetchApi } from "../api-client";
import {
  DollarSign,
  TrendingUp,
  Clock,
  Cpu,
  PhoneCall,
  RefreshCw,
  Building2,
  PieChart,
  Sliders,
  ChevronDown,
  Download,
  Info,
  ShieldCheck,
  Flame,
  Volume2,
  Mic,
  MessageSquare
} from "lucide-react";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { DataTable, Column } from "./ui/DataTable";

export const SuperAdminUsageCostTab: React.FC = () => {
  const [data, setData] = useState<SuperAdminCostTelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>("all");
  const [markupMultiplier, setMarkupMultiplier] = useState<number>(2.5);
  const [showRateSettings, setShowRateSettings] = useState(false);

  const fetchTelemetry = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchApi<SuperAdminCostTelemetryResponse>(
        `/superadmin/usage-cost-breakdown?time_range=${timeRange}&markup=${markupMultiplier}`
      );
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load usage and cost breakdown.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [timeRange, markupMultiplier]);

  const exportCSV = () => {
    if (!data || !data.organizations.length) return;
    const headers = [
      "Organization Name",
      "Organization ID",
      "Total Calls",
      "Total Minutes",
      "Total Tokens",
      "Telephony Cost ($)",
      "STT Cost ($)",
      "LLM Cost ($)",
      "TTS Cost ($)",
      "Total Infra Cost ($)",
      "Suggested Billed ($)",
      "Projected Margin ($)",
    ];

    const rows = data.organizations.map((org) => [
      `"${org.org_name}"`,
      `"${org.organization_id}"`,
      org.total_calls,
      org.billed_minutes,
      org.total_tokens,
      org.telephony_cost.toFixed(4),
      org.stt_cost.toFixed(4),
      org.llm_cost.toFixed(4),
      org.tts_cost.toFixed(4),
      org.total_cost.toFixed(4),
      org.suggested_billed.toFixed(4),
      org.margin.toFixed(4),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `tenant_usage_cost_breakdown_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: Column<OrgCostUsage>[] = [
    {
      key: "org_name",
      header: "Organization",
      sortable: true,
      render: (org) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[var(--color-surface-muted)] text-[var(--color-heading)] flex items-center justify-center font-medium text-xs border border-[var(--color-border)]">
            <Building2 className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="font-medium text-xs text-[var(--color-heading)] flex items-center gap-1.5">
              {org.org_name}
              {org.total_calls > 5 && (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  Active
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-[var(--color-muted)]">{org.organization_id}</div>
          </div>
        </div>
      ),
    },
    {
      key: "total_calls",
      header: "Calls & Mins",
      sortable: true,
      render: (org) => (
        <div>
          <div className="text-xs font-semibold font-mono text-[var(--color-heading)]">
            {org.total_calls} <span className="text-[10px] font-normal text-[var(--color-muted)]">calls</span>
          </div>
          <div className="text-[10px] text-[var(--color-muted)] font-mono">
            {org.billed_minutes} mins ({org.duration_seconds}s)
          </div>
        </div>
      ),
    },
    {
      key: "total_tokens",
      header: "LLM Tokens",
      sortable: true,
      render: (org) => (
        <div>
          <div className="text-xs font-semibold font-mono text-purple-600 dark:text-purple-400">
            {org.total_tokens.toLocaleString()}
          </div>
          <div className="text-[10px] text-[var(--color-muted)]">
            In: {org.input_tokens.toLocaleString()} | Out: {org.output_tokens.toLocaleString()}
          </div>
        </div>
      ),
    },
    {
      key: "telephony_cost",
      header: "Telephony (Twilio)",
      sortable: true,
      render: (org) => (
        <span className="font-mono text-xs text-[var(--color-heading)]">
          ${org.telephony_cost.toFixed(3)}
        </span>
      ),
    },
    {
      key: "stt_cost",
      header: "STT (Audio)",
      sortable: true,
      render: (org) => (
        <span className="font-mono text-xs text-[var(--color-heading)]">
          ${org.stt_cost.toFixed(3)}
        </span>
      ),
    },
    {
      key: "llm_cost",
      header: "LLM Think",
      sortable: true,
      render: (org) => (
        <span className="font-mono text-xs text-[var(--color-heading)]">
          ${org.llm_cost.toFixed(3)}
        </span>
      ),
    },
    {
      key: "tts_cost",
      header: "TTS Voice",
      sortable: true,
      render: (org) => (
        <span className="font-mono text-xs text-[var(--color-heading)]">
          ${org.tts_cost.toFixed(3)}
        </span>
      ),
    },
    {
      key: "total_cost",
      header: "Wholesale Cost",
      sortable: true,
      render: (org) => (
        <div className="text-right sm:text-left">
          <div className="text-xs font-bold font-mono text-rose-600 dark:text-rose-400">
            ${org.total_cost.toFixed(3)}
          </div>
          <div className="text-[10px] text-[var(--color-muted)]">Direct provider cost</div>
        </div>
      ),
    },
    {
      key: "suggested_billed",
      header: `Suggested Bill (${markupMultiplier}x)`,
      sortable: true,
      render: (org) => (
        <div>
          <div className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
            ${org.suggested_billed.toFixed(3)}
          </div>
          <div className="text-[10px] text-emerald-700/80 dark:text-emerald-300 font-mono">
            +${org.margin.toFixed(3)} margin
          </div>
        </div>
      ),
    },
  ];

  const summary = data?.summary;
  const costBreakdown = summary?.cost_by_service;
  const totalCost = summary?.total_infrastructure_cost || 0.0001;

  const telPct = costBreakdown ? Math.round((costBreakdown.telephony / totalCost) * 100) : 0;
  const sttPct = costBreakdown ? Math.round((costBreakdown.stt / totalCost) * 100) : 0;
  const llmPct = costBreakdown ? Math.round((costBreakdown.llm / totalCost) * 100) : 0;
  const ttsPct = costBreakdown ? Math.round((costBreakdown.tts / totalCost) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)] font-medium">Reporting Window:</span>
          <div className="inline-flex rounded-md shadow-xs" role="group">
            {[
              { id: "all", label: "All Time" },
              { id: "30d", label: "Last 30 Days" },
              { id: "7d", label: "Last 7 Days" },
              { id: "today", label: "Today" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTimeRange(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium border first:rounded-l-md last:rounded-r-md transition-colors ${
                  timeRange === tab.id
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                    : "bg-[var(--color-surface)] text-[var(--color-heading)] border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRateSettings(!showRateSettings)}
            leftIcon={<Sliders className="w-3.5 h-3.5" />}
          >
            Margin Multiplier ({markupMultiplier}x)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export CSV
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTelemetry}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Optional Markup & Rates Config Drawer */}
      {showRateSettings && (
        <div className="p-4 rounded-lg border border-indigo-500/20 bg-indigo-500/5 space-y-3 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-semibold text-[var(--color-heading)]">
                Billing Rate & Profit Margin Settings
              </span>
            </div>
            <button
              onClick={() => setShowRateSettings(false)}
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)]"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[var(--color-muted)] block mb-1">Pricing Multiplier (Markup):</label>
              <select
                value={markupMultiplier}
                onChange={(e) => setMarkupMultiplier(parseFloat(e.target.value))}
                className="w-full h-8 px-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-heading)] font-mono"
              >
                <option value={1.5}>1.5x (50% Markup)</option>
                <option value={2.0}>2.0x (100% Markup)</option>
                <option value={2.5}>2.5x (Recommended - 150% Markup)</option>
                <option value={3.0}>3.0x (200% Markup)</option>
                <option value={4.0}>4.0x (300% Markup)</option>
              </select>
            </div>
            <div>
              <span className="text-[var(--color-muted)] block mb-1">Telephony Base Cost:</span>
              <span className="font-mono text-[var(--color-heading)] font-medium">$0.0140 / min</span>
            </div>
            <div>
              <span className="text-[var(--color-muted)] block mb-1">STT Audio Stream:</span>
              <span className="font-mono text-[var(--color-heading)] font-medium">$0.0043 / min</span>
            </div>
            <div>
              <span className="text-[var(--color-muted)] block mb-1">TTS Voice Synthesis:</span>
              <span className="font-mono text-[var(--color-heading)] font-medium">$0.0150 / 1K chars</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <Alert type="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Executive Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Provider Cost */}
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-muted)] font-medium">Provider Cost (Wholesale)</span>
            <div className="w-6 h-6 rounded bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2 font-mono">
            ${summary ? summary.total_infrastructure_cost.toFixed(2) : "0.00"}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            Total infrastructure spend across all tenants
          </p>
        </div>

        {/* Card 2: Suggested Client Billing */}
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-muted)] font-medium">Suggested Client Billing</span>
            <div className="w-6 h-6 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
            ${summary ? summary.suggested_client_revenue.toFixed(2) : "0.00"}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px]">
            <span className="text-emerald-700 dark:text-emerald-300 font-semibold font-mono">
              +${summary ? summary.projected_gross_profit.toFixed(2) : "0.00"} profit
            </span>
            <span className="text-[var(--color-muted)]">({summary?.gross_margin_percentage || 0}% margin)</span>
          </div>
        </div>

        {/* Card 3: Total Voice Minutes */}
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-muted)] font-medium">Total Voice Minutes</span>
            <div className="w-6 h-6 rounded bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[var(--color-heading)] mt-2 font-mono">
            {summary ? summary.total_duration_minutes.toLocaleString() : "0"} <span className="text-xs font-normal text-[var(--color-muted)]">mins</span>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            Across {summary ? summary.total_calls : 0} total telephone calls
          </p>
        </div>

        {/* Card 4: Total LLM Tokens */}
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-muted)] font-medium">Total LLM Tokens</span>
            <div className="w-6 h-6 rounded bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2 font-mono">
            {summary ? summary.total_tokens.toLocaleString() : "0"}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            System prompts & conversational reasoning turns
          </p>
        </div>
      </div>

      {/* Provider Cost Breakdown Progress Bar */}
      {costBreakdown && summary.total_infrastructure_cost > 0 && (
        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--color-heading)]">
            <div className="flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-indigo-500" />
              <span>Provider Cost Distribution</span>
            </div>
            <span className="text-[var(--color-muted)] font-mono">
              Total: ${summary.total_infrastructure_cost.toFixed(3)}
            </span>
          </div>

          <div className="h-2.5 w-full bg-[var(--color-surface-muted)] rounded-full flex overflow-hidden">
            <div
              style={{ width: `${telPct}%` }}
              className="bg-blue-500 transition-all"
              title={`Telephony: $${costBreakdown.telephony.toFixed(3)} (${telPct}%)`}
            />
            <div
              style={{ width: `${sttPct}%` }}
              className="bg-emerald-500 transition-all"
              title={`STT: $${costBreakdown.stt.toFixed(3)} (${sttPct}%)`}
            />
            <div
              style={{ width: `${llmPct}%` }}
              className="bg-purple-500 transition-all"
              title={`LLM: $${costBreakdown.llm.toFixed(3)} (${llmPct}%)`}
            />
            <div
              style={{ width: `${ttsPct}%` }}
              className="bg-amber-500 transition-all"
              title={`TTS: $${costBreakdown.tts.toFixed(3)} (${ttsPct}%)`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-[var(--color-muted)]">Telephony:</span>
              <span className="font-mono font-medium text-[var(--color-heading)]">
                ${costBreakdown.telephony.toFixed(3)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-[var(--color-muted)]">STT Audio:</span>
              <span className="font-mono font-medium text-[var(--color-heading)]">
                ${costBreakdown.stt.toFixed(3)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span className="text-[var(--color-muted)]">LLM Tokens:</span>
              <span className="font-mono font-medium text-[var(--color-heading)]">
                ${costBreakdown.llm.toFixed(3)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-[var(--color-muted)]">TTS Voice:</span>
              <span className="font-mono font-medium text-[var(--color-heading)]">
                ${costBreakdown.tts.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Per-Organization Cost & Token Usage Breakdown Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-heading)]">
              Tenant Organization Usage & Margin Ledger
            </h3>
            <p className="text-xs text-[var(--color-muted)]">
              Detailed tracking of exact infrastructure consumption per client organization.
            </p>
          </div>
          <Badge variant="neutral" size="sm">
            {data?.organizations.length || 0} Organizations
          </Badge>
        </div>

        <DataTable
          columns={columns}
          data={data?.organizations || []}
          isLoading={loading}
          loadingMessage="Calculating multi-tenant token and telephony metrics..."
          searchKey="org_name"
          searchPlaceholder="Filter by organization name or ID..."
          emptyTitle="No tenant calls recorded"
          emptyDescription="When organizations make or receive calls, their minute and token consumption will appear here."
          pagination={true}
          pageSize={10}
        />
      </div>
    </div>
  );
};
