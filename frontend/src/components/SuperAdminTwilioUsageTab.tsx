import React, { useState, useEffect } from "react";
import {
  TwilioDirectAccountUsageResponse,
  TwilioUsageRecordItem,
  TwilioConfiguredOrg,
  TwilioPhoneNumberDetail,
  TwilioRecordingInventory,
  TwilioPurgeResponse,
  EscalationAlertConfig,
} from "../types";
import { fetchApi } from "../api-client";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  PhoneCall,
  RefreshCw,
  Building2,
  Calendar,
  Layers,
  Search,
  Download,
  AlertCircle,
  HelpCircle,
  Hash,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowUpRight,
  Filter,
  Globe,
  Radio,
  Trash2,
  Sparkles,
  HardDrive,
  Mail,
  Send,
} from "lucide-react";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { DataTable, Column } from "./ui/DataTable";

export const SuperAdminTwilioUsageTab: React.FC = () => {
  const [data, setData] = useState<TwilioDirectAccountUsageResponse | null>(null);
  const [orgs, setOrgs] = useState<TwilioConfiguredOrg[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<string>("this_month");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [recordingInventory, setRecordingInventory] = useState<TwilioRecordingInventory | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  // Escalation Email Alert State
  const [alertConfig, setAlertConfig] = useState<EscalationAlertConfig | null>(null);
  const [alertRecipientEmail, setAlertRecipientEmail] = useState("ponkiyaraj7@gmail.com");
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [isSavingAlertConfig, setIsSavingAlertConfig] = useState(false);
  const [isSendingTestAlert, setIsSendingTestAlert] = useState(false);

  const loadOrgs = async () => {
    try {
      setLoadingOrgs(true);
      const res = await fetchApi<TwilioConfiguredOrg[]>("/superadmin/twilio-configured-organizations");
      setOrgs(res || []);
      if (res && res.length > 0 && !selectedOrgId) {
        setSelectedOrgId(res[0].organization_id);
      }
    } catch (e: any) {
      console.error("Failed to load Twilio organizations:", e);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const fetchRecordingInventory = async () => {
    try {
      const url = selectedOrgId
        ? `/superadmin/twilio-recording-inventory?organization_id=${encodeURIComponent(selectedOrgId)}`
        : `/superadmin/twilio-recording-inventory`;
      const res = await fetchApi<TwilioRecordingInventory>(url);
      setRecordingInventory(res);
    } catch (e) {
      console.error("Failed to load recording inventory:", e);
    }
  };

  const handlePurgeOldRecordings = async () => {
    if (!recordingInventory || recordingInventory.older_than_28_days === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${recordingInventory.older_than_28_days} recordings older than 28 days (${recordingInventory.older_minutes} minutes) from Twilio to stop storage fees?\n\nTranscripts in Cosmos DB will remain completely safe.`
    );
    if (!confirmed) return;

    try {
      setIsPurging(true);
      setError(null);
      setSuccessMsg(null);
      const url = selectedOrgId
        ? `/superadmin/twilio-purge-recordings?days=28&organization_id=${encodeURIComponent(selectedOrgId)}`
        : `/superadmin/twilio-purge-recordings?days=28`;
      const res = await fetchApi<TwilioPurgeResponse>(url, { method: "POST" });
      if (res?.success) {
        setSuccessMsg(res?.message || "Recordings purged successfully.");
        await Promise.all([fetchUsage(), fetchRecordingInventory()]);
      } else {
        setError(res?.error || res?.message || "Purge operation failed.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to purge old recordings.");
    } finally {
      setIsPurging(false);
    }
  };

  const fetchUsage = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = selectedOrgId
        ? `/superadmin/twilio-account-usage?organization_id=${encodeURIComponent(selectedOrgId)}&time_range=${timeRange}`
        : `/superadmin/twilio-account-usage?time_range=${timeRange}`;
      const res = await fetchApi<TwilioDirectAccountUsageResponse>(url);
      setData(res);
      if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load Twilio account usage.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAlertConfig = async () => {
    try {
      const url = selectedOrgId
        ? `/superadmin/escalation-alert-config?organization_id=${encodeURIComponent(selectedOrgId)}`
        : `/superadmin/escalation-alert-config`;
      const res = await fetchApi<EscalationAlertConfig>(url);
      setAlertConfig(res);
      setAlertEnabled(res.enabled);
      if (res.recipient_email) {
        setAlertRecipientEmail(res.recipient_email);
      }
    } catch (e) {
      console.error("Failed to load escalation alert config:", e);
    }
  };

  const handleSaveAlertConfig = async () => {
    if (!alertRecipientEmail.trim()) {
      setError("Please specify a valid notification recipient email address.");
      return;
    }
    try {
      setIsSavingAlertConfig(true);
      setError(null);
      setSuccessMsg(null);
      const res = await fetchApi<any>("/superadmin/escalation-alert-config", {
        method: "POST",
        body: JSON.stringify({
          organization_id: selectedOrgId || undefined,
          enabled: alertEnabled,
          recipient_email: alertRecipientEmail.trim(),
        }),
      });
      setSuccessMsg(res?.message || "Escalation alert settings updated successfully.");
      await fetchAlertConfig();
    } catch (err: any) {
      setError(err?.message || "Failed to save alert configuration.");
    } finally {
      setIsSavingAlertConfig(false);
    }
  };

  const handleSendTestAlert = async () => {
    if (!alertRecipientEmail.trim()) {
      setError("Please provide an email address to send the test alert to.");
      return;
    }
    try {
      setIsSendingTestAlert(true);
      setError(null);
      setSuccessMsg(null);
      const res = await fetchApi<{ success: boolean; message: string }>("/superadmin/send-test-escalation-alert", {
        method: "POST",
        body: JSON.stringify({
          recipient_email: alertRecipientEmail.trim(),
          organization_id: selectedOrgId || undefined,
        }),
      });
      setSuccessMsg(`Test alert email dispatched successfully to ${alertRecipientEmail.trim()} via Microsoft 365 Graph API.`);
    } catch (err: any) {
      setError(err.message || "Failed to dispatch test alert email.");
    } finally {
      setIsSendingTestAlert(false);
    }
  };

  useEffect(() => {
    loadOrgs();
  }, []);

  useEffect(() => {
    fetchUsage();
    fetchRecordingInventory();
    fetchAlertConfig();
  }, [selectedOrgId, timeRange]);

  const exportCSV = () => {
    if (!data || !data.records.length) return;
    const headers = [
      "Category",
      "Description",
      "Usage Count",
      "Count Unit",
      "Usage Quantity",
      "Usage Unit",
      "Price / Charge ($)",
      "Currency",
      "Type",
      "Period Start",
      "Period End",
    ];

    const rows = filteredRecords.map((r) => [
      `"${r.category}"`,
      `"${r.description || ""}"`,
      r.count || "0",
      `"${r.count_unit || ""}"`,
      r.usage || "0",
      `"${r.usage_unit || ""}"`,
      r.price.toFixed(4),
      r.price_unit,
      r.is_fixed_recurring ? "Monthly Fixed Lease" : "Pay-As-You-Go Usage",
      `"${r.start_date || ""}"`,
      `"${r.end_date || ""}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `twilio_usage_${data.account_sid || "account"}_${timeRange}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRecords = (data?.records || []).filter((r) => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "fixed") return r.is_fixed_recurring;
    if (categoryFilter === "variable") return !r.is_fixed_recurring;
    return r.category.toLowerCase().includes(categoryFilter.toLowerCase());
  });

  const columns: Column<TwilioUsageRecordItem>[] = [
    {
      key: "category",
      header: "Charge Category",
      sortable: true,
      render: (item) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 font-medium text-xs text-[var(--color-heading)]">
            <span>{item.category}</span>
            {item.is_fixed_recurring && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Monthly Fixed
              </span>
            )}
          </div>
          <span className="text-[11px] text-[var(--color-muted)] truncate max-w-xs">
            {item.description || item.category}
          </span>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Quantity / Volume",
      sortable: true,
      render: (item) => (
        <div className="text-xs font-mono text-[var(--color-heading)]">
          {item.usage && item.usage !== "0" ? (
            <span>
              {Number(item.usage).toLocaleString()}{" "}
              <span className="text-[10px] text-[var(--color-muted)] font-sans">
                {item.usage_unit || ""}
              </span>
            </span>
          ) : item.count && item.count !== "0" ? (
            <span>
              {Number(item.count).toLocaleString()}{" "}
              <span className="text-[10px] text-[var(--color-muted)] font-sans">
                {item.count_unit || "events"}
              </span>
            </span>
          ) : (
            <span className="text-[var(--color-muted)]">--</span>
          )}
        </div>
      ),
    },
    {
      key: "price",
      header: "Billed Deductions",
      sortable: true,
      className: "text-right",
      render: (item) => (
        <div className="text-right">
          <div className="font-mono text-xs font-semibold text-[var(--color-heading)]">
            ${item.price.toFixed(4)}
          </div>
          <div className="text-[10px] text-[var(--color-muted)] font-mono">
            {item.price_unit}
          </div>
        </div>
      ),
    },
    {
      key: "start_date",
      header: "Billing Period",
      render: (item) => (
        <div className="text-[11px] font-mono text-[var(--color-muted)]">
          {item.start_date || "--"} {item.end_date ? `→ ${item.end_date}` : ""}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls Bar */}
      <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Account / Org Selector */}
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--color-muted)]" />
              <label className="text-xs font-medium text-[var(--color-heading)]">
                Account:
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                disabled={loadingOrgs}
                className="h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] text-[var(--color-heading)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] focus:outline-none focus:ring-1 focus:ring-[var(--color-focus)] min-w-[200px]"
              >
                {orgs.map((o) => (
                  <option key={o.organization_id} value={o.organization_id}>
                    {o.org_name} ({o.account_sid.substring(0, 10)}...)
                  </option>
                ))}
                {!orgs.length && (
                  <option value="">Default Connected Twilio Account</option>
                )}
              </select>
            </div>

            {/* Time Period Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--color-muted)]" />
              <label className="text-xs font-medium text-[var(--color-heading)]">
                Period:
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] text-[var(--color-heading)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] focus:outline-none focus:ring-1 focus:ring-[var(--color-focus)]"
              >
                <option value="this_month">Current Month (Active Cycle)</option>
                <option value="last_month">Last Month</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="all_time">All Time</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsage}
              isLoading={loading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync Live Twilio
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              disabled={!data || !data.records.length}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert type="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Success Alert */}
      {successMsg && (
        <Alert type="success" onDismiss={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {/* Smart Recording Retention & 28-Day Purge Optimizer */}
      <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-primary-ring)] bg-[var(--color-primary-subtle)] space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded bg-[var(--color-primary-light)] text-[var(--color-primary)] mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-2">
                <span>Smart Recording Retention & Cost Optimizer</span>
                <Badge variant="primary" size="sm">Auto Credit Protection</Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRecordingInventory}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              className="text-xs"
            >
              Refresh Inventory
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handlePurgeOldRecordings}
              isLoading={isPurging}
              disabled={!recordingInventory || recordingInventory.older_than_28_days === 0}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              className="text-xs font-medium"
            >
              Purge Recordings ≥ 28 Days ({recordingInventory?.older_than_28_days || 0})
            </Button>
          </div>
        </div>

        {/* Live Recording Inventory Counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[var(--color-border)]">
          <div className="p-2.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between">
            <div>
              <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider block">
                Total Twilio Recordings
              </span>
              <span className="text-sm font-bold font-mono text-[var(--color-heading)]">
                {recordingInventory ? recordingInventory.total_count : "--"} calls
              </span>
            </div>
            <div className="text-right text-[11px] font-mono text-[var(--color-muted)]">
              {recordingInventory ? `${recordingInventory.total_minutes} min` : ""}
            </div>
          </div>

          <div className="p-2.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between">
            <div>
              <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider block">
                Retained Active (&lt; 28 Days)
              </span>
              <span className="text-sm font-bold font-mono text-emerald-500">
                {recordingInventory ? recordingInventory.newer_than_28_days : "--"} calls
              </span>
            </div>
            <Badge variant="success" size="sm" className="text-[10px]">
              Within Free/Initial Cycle
            </Badge>
          </div>

          <div className="p-2.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between">
            <div>
              <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider block">
                Eligible for Purge (≥ 28 Days)
              </span>
              <span className="text-sm font-bold font-mono text-amber-500">
                {recordingInventory ? recordingInventory.older_than_28_days : "--"} calls
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-amber-500 block">
                {recordingInventory ? `${recordingInventory.older_minutes} min` : ""}
              </span>
              <span className="text-[9px] text-[var(--color-muted)]">Avoids next month billing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Escalation Recording Email Alert Configuration Card */}
      <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-rose-500/20 bg-rose-500/5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded bg-rose-500/10 text-rose-500 mt-0.5">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-2">
                <span>Escalation Recording Email Notification Alerts</span>
                <Badge variant={alertEnabled ? "danger" : "neutral"} size="sm">
                  {alertEnabled ? "Active & Monitoring" : "Alerts Paused"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendTestAlert}
              isLoading={isSendingTestAlert}
              leftIcon={<Send className="w-3.5 h-3.5" />}
              className="text-xs"
            >
              Send Test Alert
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveAlertConfig}
              isLoading={isSavingAlertConfig}
              className="text-xs font-medium"
            >
              Save Alert Settings
            </Button>
          </div>
        </div>

        {/* Configuration Controls Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-rose-500/15 items-center">
          {/* Toggle ON/OFF */}
          <div className="md:col-span-3 flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--color-heading)] flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alertEnabled}
                onChange={(e) => setAlertEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--color-border)] text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span>Enable Email Alerts</span>
            </label>
          </div>

          {/* Recipient Email Input */}
          <div className="md:col-span-5 flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted)] shrink-0 font-medium">
              Recipient:
            </span>
            <input
              type="email"
              value={alertRecipientEmail}
              onChange={(e) => setAlertRecipientEmail(e.target.value)}
              placeholder="e.g. ponkiyaraj7@gmail.com"
              className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface)] text-[var(--color-heading)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono"
            />
          </div>

          {/* Sender & Graph Status */}
          <div className="md:col-span-4 flex items-center justify-start md:justify-end gap-1.5 text-[11px] text-[var(--color-muted)]">
            <span className="font-sans">Dispatched from:</span>
            <span className="font-mono text-emerald-500 font-medium truncate max-w-[200px]">
              {alertConfig?.mail_sender || "jashpalP@t12y7.onmicrosoft.com"}
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          </div>
        </div>
      </div>

      {/* Account Balance & Billing KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Twilio Live Balance */}
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-[var(--color-muted)] text-xs font-medium">
            <span>Twilio Account Credits</span>
            <div className="w-6 h-6 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[var(--color-heading)]">
              {data?.current_balance !== null && data?.current_balance !== undefined
                ? `$${data.current_balance.toFixed(2)}`
                : "--"}
            </span>
            <span className="text-[10px] font-mono text-[var(--color-muted)] uppercase">
              {data?.currency || "USD"}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-500 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>Active live balance available</span>
          </div>
        </div>

        {/* Card 2: Period Total Spend */}
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center justify-between text-[var(--color-muted)] text-xs font-medium">
            <span>Period Total Deductions</span>
            <div className="w-6 h-6 rounded bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[var(--color-heading)]">
              ${(data?.total_spend || 0).toFixed(4)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--color-muted)]">
            Total deductions billed across selected period
          </div>
        </div>

        {/* Card 3: Monthly Fixed Charges */}
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center justify-between text-[var(--color-muted)] text-xs font-medium">
            <span>Monthly Fixed Charges</span>
            <div className="w-6 h-6 rounded bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-500">
              ${((data?.fixed_charges?.total_fixed_cost || data?.fixed_recurring_spend || 0)).toFixed(2)}
            </span>
            <span className="text-[10px] text-[var(--color-muted)] font-mono">
              ({data?.fixed_charges?.active_numbers_count || data?.phone_numbers?.length || 0} active #s)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--color-muted)]">
            Fixed monthly country number leases
          </div>
        </div>

        {/* Card 4: Variable Pay-As-You-Go Usage */}
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center justify-between text-[var(--color-muted)] text-xs font-medium">
            <span>Pay-As-You-Go Usage</span>
            <div className="w-6 h-6 rounded bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <PhoneCall className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-purple-400">
              ${(data?.variable_usage_spend || 0).toFixed(4)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--color-muted)]">
            Voice minutes, recording & carrier lookups
          </div>
        </div>
      </div>

      {/* Monthly Fixed Charges & Multi-Country Phone Number Breakdown */}
      <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-amber-500/20 bg-amber-500/5 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded bg-amber-500/10 text-amber-500 mt-0.5">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-2">
                <span>Monthly Recurring Phone Number Leases & Country Tariffs</span>
                <Badge variant="warning" size="sm">Fixed Monthly Leases</Badge>
              </div>
              <div className="text-[11px] text-[var(--color-muted)] mt-1 max-w-2xl">
                Twilio bills fixed monthly rental fees for each active telephone number. Different countries and number types (e.g., Local DID, Mobile, National VoIP) carry distinct recurring tariffs:
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider block">
              Estimated Monthly Number Lease
            </span>
            <span className="text-base font-mono text-amber-500 font-bold">
              ${(data?.fixed_charges?.total_fixed_cost || 0).toFixed(2)} / month
            </span>
          </div>
        </div>

        {/* Per-Country Number Cards */}
        {data?.phone_numbers && data.phone_numbers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-amber-500/15">
            {data.phone_numbers.map((pn) => (
              <div
                key={pn.phone_number}
                className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium text-xs text-[var(--color-heading)]">
                      <span className="text-base">{pn.flag_emoji}</span>
                      <span>{pn.country_name}</span>
                    </div>
                    <Badge variant="outline" size="sm" className="text-[10px]">
                      {pn.number_type}
                    </Badge>
                  </div>
                  <div className="mt-2 font-mono text-sm font-semibold text-[var(--color-heading)] tracking-wide">
                    {pn.phone_number}
                  </div>
                  {pn.friendly_name && pn.friendly_name !== pn.phone_number && (
                    <div className="text-[10px] text-[var(--color-muted)] truncate mt-0.5">
                      {pn.friendly_name}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <Radio className="w-3 h-3 text-emerald-500" />
                    <span>
                      {pn.capabilities.voice ? "Voice" : ""}{pn.capabilities.sms ? " • SMS" : ""}{pn.capabilities.mms ? " • MMS" : ""}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-amber-500">
                      ${pn.monthly_rental_usd.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-[var(--color-muted)] font-mono ml-0.5">
                      /mo
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-[var(--color-muted)] italic pt-1">
            No individual phone numbers retrieved.
          </div>
        )}
      </div>

      {/* Usage Records Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--color-muted)]" />
            <h3 className="text-sm font-semibold text-[var(--color-heading)]">
              Itemized Twilio Usage Records & Deduction Logs
            </h3>
            <Badge variant="outline" size="sm" className="font-mono">
              {filteredRecords.length} Categories
            </Badge>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <Button
              variant={categoryFilter === "all" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
              className="text-xs h-7 px-2.5"
            >
              All Records
            </Button>
            <Button
              variant={categoryFilter === "fixed" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter("fixed")}
              className="text-xs h-7 px-2.5"
            >
              Monthly Fixed
            </Button>
            <Button
              variant={categoryFilter === "variable" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter("variable")}
              className="text-xs h-7 px-2.5"
            >
              Pay-As-You-Go
            </Button>
            <Button
              variant={categoryFilter === "calls" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter("calls")}
              className="text-xs h-7 px-2.5"
            >
              Calls
            </Button>
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredRecords}
          isLoading={loading}
          loadingMessage="Querying official Twilio Usage Records..."
          searchKey="category"
          searchPlaceholder="Search charges by category name..."
          emptyTitle="No usage records recorded for this period"
          emptyDescription="Twilio has not recorded billable charges for this account in the selected time range."
          pagination={true}
          pageSize={10}
        />
      </div>
    </div>
  );
};
