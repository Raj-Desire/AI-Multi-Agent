import React, { useState, useEffect } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig, OrganizationSummary, AvailableAgentsResponse, AgentConfig, AutoSetupTwilioResponse, TwilioBalance } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  Key,
  Phone,
  PhoneForwarded,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  Zap,
  Building2,
  Code2,
  Globe,
  Sliders,
  Check,
  Radio,
  Bot,
  Sparkles,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Wallet,
  CreditCard,
  AlertTriangle
} from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { StatusIndicator } from "./ui/StatusIndicator";
import { FormSection } from "./ui/FormSection";
import { Tabs } from "./ui/Tabs";
import { LoadingState } from "./ui/LoadingState";
import { Modal } from "./ui/Modal";

export function TwilioSettingsView() {
  const { user, isSuperAdmin } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("credentials");

  const [config, setConfig] = useState<TwilioConfig | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<TwilioBalance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [twimlAppSid, setTwimlAppSid] = useState("");
  const [apiKeySid, setApiKeySid] = useState("");
  const [apiKeySecret, setApiKeySecret] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");

  // Inbound Call Forwarding & Agent states
  const [inboundForwardMode, setInboundForwardMode] = useState<"global" | "per_number" | "disabled">("global");
  const [inboundForwardGlobalNumber, setInboundForwardGlobalNumber] = useState("");
  const [inboundForwardMapping, setInboundForwardMapping] = useState<Record<string, string>>({});
  const [defaultAgentId, setDefaultAgentId] = useState<string>("agt_receptionist_default");
  const [inboundAgentMapping, setInboundAgentMapping] = useState<Record<string, string>>({});

  const [availableAgents, setAvailableAgents] = useState<AvailableAgentsResponse>({
    my_agents: [],
    default_agents: []
  });

  // Master Phone Numbers List state
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [newNumberInput, setNewNumberInput] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [numberToDelete, setNumberToDelete] = useState<{ index: number; number: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [autoSettingUp, setAutoSettingUp] = useState(false);
  const [fetchingNumbers, setFetchingNumbers] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadAgents();
    if (isSuperAdmin) {
      loadOrganizations();
    } else {
      loadConfig();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (selectedOrgId) {
      loadConfig(selectedOrgId);
    }
  }, [selectedOrgId]);

  async function loadAgents() {
    try {
      const res = await fetchApi<AvailableAgentsResponse>("/agents/available");
      setAvailableAgents(res);
    } catch (e) {
      console.warn("Could not load available agents for dropdown:", e);
    }
  }

  async function loadOrganizations() {
    try {
      const orgs = await fetchApi<OrganizationSummary[]>("/superadmin/organizations");
      setOrganizations(orgs);
      if (orgs.length > 0) {
        const initialOrg = user?.organization_id || orgs[0].organization_id;
        setSelectedOrgId(initialOrg);
        loadConfig(initialOrg);
      } else {
        loadConfig();
      }
    } catch (e) {
      loadConfig();
    }
  }

  async function loadBalance(targetOrgId?: string) {
    try {
      setLoadingBalance(true);
      const url = targetOrgId && isSuperAdmin
        ? `/twilio/balance?organization_id=${targetOrgId}`
        : "/twilio/balance";
      const data = await fetchApi<TwilioBalance>(url);
      setBalanceInfo(data);
    } catch (e) {
      console.warn("Could not load Twilio balance:", e);
    } finally {
      setLoadingBalance(false);
    }
  }

  async function loadConfig(targetOrgId?: string) {
    try {
      setLoading(true);
      const url = targetOrgId && isSuperAdmin
        ? `/twilio/configuration?organization_id=${targetOrgId}`
        : "/twilio/configuration";
      const data = await fetchApi<TwilioConfig | null>(url);
      if (data) {
        setConfig(data);
        setAccountSid(data.account_sid || "");
        setAuthToken(data.auth_token_masked || "");
        setTwimlAppSid(data.twiml_app_sid || "");
        setApiKeySid(data.api_key_sid || "");
        setApiKeySecret(data.api_key_secret_masked || "");
        setPublicBaseUrl(data.public_base_url || "");
        setInboundForwardMode(data.inbound_forward_mode || "global");
        setInboundForwardGlobalNumber(data.inbound_forward_global_number || "");
        setInboundForwardMapping(data.inbound_forward_mapping || {});
        setDefaultAgentId(data.default_agent_id || "agt_receptionist_default");
        setInboundAgentMapping(data.inbound_agent_mapping || {});

        const parsed = (data.phone_number || "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        setPhoneNumbers(parsed);

        if (data.status === "CONNECTED") {
          loadBalance(targetOrgId);
        }
      } else {
        setConfig(null);
        setBalanceInfo(null);
        setAccountSid("");
        setAuthToken("");
        setTwimlAppSid("");
        setApiKeySid("");
        setApiKeySecret("");
        setPublicBaseUrl("");
        setInboundForwardMode("global");
        setInboundForwardGlobalNumber("");
        setInboundForwardMapping({});
        setDefaultAgentId("agt_receptionist_default");
        setInboundAgentMapping({});
        setPhoneNumbers([]);
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }

  const handleAutoSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountSid.trim() || !authToken.trim()) {
      setMessage({ text: "Please enter your Account SID and Auth Token to run 1-Click Auto Setup.", type: "error" });
      return;
    }

    try {
      setAutoSettingUp(true);
      setMessage(null);
      const setupUrl = isSuperAdmin && selectedOrgId
        ? `/twilio/auto-setup?organization_id=${selectedOrgId}`
        : "/twilio/auto-setup";

      const res = await fetchApi<AutoSetupTwilioResponse>(setupUrl, {
        method: "POST",
        body: JSON.stringify({
          account_sid: accountSid.trim(),
          auth_token: authToken.trim(),
          friendly_name: "AI Calling Platform"
        }),
      });

      setTwimlAppSid(res.twiml_app_sid);
      setApiKeySid(res.api_key_sid);
      setPhoneNumbers(res.phone_numbers || []);
      
      // Reload config to reflect latest masked secrets & status
      await loadConfig(selectedOrgId || undefined);
      
      setMessage({
        text: `Auto-Setup complete! Discovered ${res.phone_numbers_found} phone numbers, configured TwiML App, and generated WebRTC voice keys.`,
        type: "success"
      });
    } catch (err: any) {
      setMessage({ text: err.message || "Auto-Setup failed. Please verify your Account SID and Auth Token.", type: "error" });
    } finally {
      setAutoSettingUp(false);
    }
  };

  const handleAutoFetchNumbers = async () => {
    if (!accountSid.trim() || !authToken.trim()) {
      setMessage({ text: "Please enter your Twilio Account SID and Auth Token first.", type: "error" });
      return;
    }

    try {
      setFetchingNumbers(true);
      setMessage(null);
      const fetched = await fetchApi<string[]>("/twilio/fetch-numbers", {
        method: "POST",
        body: JSON.stringify({
          account_sid: accountSid,
          auth_token: authToken,
        }),
      });

      if (!fetched || fetched.length === 0) {
        setMessage({ text: "No purchased phone numbers found on this Twilio account.", type: "error" });
        return;
      }

      const combined = Array.from(new Set([...phoneNumbers, ...fetched]));
      setPhoneNumbers(combined);
      setMessage({ text: `Fetched ${fetched.length} phone number(s). Click Save to apply changes.`, type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to fetch numbers from Twilio.", type: "error" });
    } finally {
      setFetchingNumbers(false);
    }
  };

  const handleAddNumber = () => {
    const trimmed = newNumberInput.trim();
    if (!trimmed) return;
    if (phoneNumbers.includes(trimmed)) {
      setMessage({ text: `Phone number ${trimmed} already exists in your list.`, type: "error" });
      return;
    }
    setPhoneNumbers([...phoneNumbers, trimmed]);
    setNewNumberInput("");
    setMessage(null);
  };

  const handleSaveEdit = (index: number) => {
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    const oldNum = phoneNumbers[index];
    const updated = [...phoneNumbers];
    updated[index] = trimmed;
    setPhoneNumbers(updated);

    if (inboundForwardMapping[oldNum]) {
      const newMapping = { ...inboundForwardMapping };
      newMapping[trimmed] = newMapping[oldNum];
      delete newMapping[oldNum];
      setInboundForwardMapping(newMapping);
    }

    if (inboundAgentMapping[oldNum]) {
      const newAgentMapping = { ...inboundAgentMapping };
      newAgentMapping[trimmed] = newAgentMapping[oldNum];
      delete newAgentMapping[oldNum];
      setInboundAgentMapping(newAgentMapping);
    }

    setEditingIndex(null);
    setEditingValue("");
  };

  const confirmDeleteNumber = () => {
    if (!numberToDelete) return;
    const { index, number: numToDelete } = numberToDelete;
    const updated = phoneNumbers.filter((_, i) => i !== index);
    setPhoneNumbers(updated);

    if (inboundForwardMapping[numToDelete]) {
      const newMapping = { ...inboundForwardMapping };
      delete newMapping[numToDelete];
      setInboundForwardMapping(newMapping);
    }

    if (inboundAgentMapping[numToDelete]) {
      const newAgentMapping = { ...inboundAgentMapping };
      delete newAgentMapping[numToDelete];
      setInboundAgentMapping(newAgentMapping);
    }
    setNumberToDelete(null);
  };

  const handlePerNumberForwardChange = (twilioNum: string, targetNum: string) => {
    setInboundForwardMapping((prev) => ({
      ...prev,
      [twilioNum]: targetNum,
    }));
  };

  const handlePerNumberAgentChange = (twilioNum: string, agentId: string) => {
    setInboundAgentMapping((prev) => ({
      ...prev,
      [twilioNum]: agentId,
    }));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (phoneNumbers.length === 0) {
      setMessage({ text: "Please configure at least one Twilio phone number.", type: "error" });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      const joinedNumbers = phoneNumbers.join(", ");
      const saveUrl = isSuperAdmin && selectedOrgId
        ? `/twilio/configuration?organization_id=${selectedOrgId}`
        : "/twilio/configuration";

      const updated = await fetchApi<TwilioConfig>(saveUrl, {
        method: "POST",
        body: JSON.stringify({
          account_sid: accountSid,
          auth_token: authToken,
          phone_number: joinedNumbers,
          twiml_app_sid: twimlAppSid,
          api_key_sid: apiKeySid,
          api_key_secret: apiKeySecret,
          public_base_url: publicBaseUrl,
          inbound_forward_mode: inboundForwardMode,
          inbound_forward_global_number: inboundForwardGlobalNumber,
          inbound_forward_mapping: inboundForwardMapping,
          default_agent_id: defaultAgentId,
          inbound_agent_mapping: inboundAgentMapping,
        }),
      });
      setConfig(updated);
      setAuthToken(updated.auth_token_masked);
      if (updated.api_key_secret_masked) {
        setApiKeySecret(updated.api_key_secret_masked);
      }
      setMessage({ text: "Twilio settings, phone numbers, and AI Agent routing saved successfully.", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      setMessage(null);
      const testUrl = isSuperAdmin && selectedOrgId
        ? `/twilio/test-connection?organization_id=${selectedOrgId}`
        : "/twilio/test-connection";

      const res = await fetchApi<{ success: boolean; message: string }>(testUrl, {
        method: "POST",
      });
      if (res.success) {
        setMessage({ text: res.message, type: "success" });
      } else {
        setMessage({ text: res.message, type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Connection test failed", type: "error" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <LoadingState
          message="Loading Twilio & AI Voice configurations..."
          subMessage="Fetching phone numbers and inbound agent assignments"
          size="lg"
        />
      </div>
    );
  }

  const isConnected = config?.status === "CONNECTED";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Phone & Voice Setup"
        description="Connect your Twilio account, manage active caller IDs, and configure inbound AI agent routing."
        badge={
          <StatusIndicator
            status={isConnected ? "connected" : "idle"}
            label={isConnected ? "Connected & Ready" : "Not configured"}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            {config && balanceInfo?.balance && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] text-xs shadow-2xs">
                <Wallet className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                <span className="font-semibold text-[var(--color-heading)] font-mono">
                  {parseFloat(balanceInfo.balance).toLocaleString("en-US", { style: "currency", currency: balanceInfo.currency || "USD" })}
                </span>
                <span className="text-[10px] text-[var(--color-muted)] font-medium uppercase">
                  {balanceInfo.currency || "USD"}
                </span>
                <button
                  type="button"
                  onClick={() => loadBalance(selectedOrgId || undefined)}
                  disabled={loadingBalance}
                  title="Refresh Balance"
                  className="ml-1 p-0.5 text-[var(--color-muted)] hover:text-[var(--color-heading)] transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingBalance ? "animate-spin text-[var(--color-primary)]" : ""}`} />
                </button>
              </div>
            )}
            {config && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                isLoading={testing}
                leftIcon={<Zap className="w-3.5 h-3.5 text-amber-500" />}
              >
                Test Connection
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={saving}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Save Changes
            </Button>
          </div>
        }
      />

      {/* Superadmin Tenant Selector */}
      {isSuperAdmin && organizations.length > 0 && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-main,0.375rem)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-amber-900 dark:text-amber-200">Organization Override</span>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">Managing Twilio credentials for selected tenant.</p>
            </div>
          </div>
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded bg-[var(--color-surface)] border border-amber-500/30 text-[var(--color-heading)] focus:outline-none"
          >
            {organizations.map((org) => (
              <option key={org.organization_id} value={org.organization_id}>
                {org.org_name} ({org.organization_id})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Interactive Helper / Step-by-Step Guide Accordion */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] bg-[var(--color-surface)] overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          className="w-full px-4 py-3 bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/10 flex items-center justify-between transition-colors text-left"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] flex items-center justify-center">
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                How to find your Twilio Account SID & Auth Token
                <span className="text-[10px] bg-[var(--color-primary)] text-white px-1.5 py-0.2 rounded-full font-medium">Quick Guide</span>
              </span>
              <p className="text-[11px] text-[var(--color-muted)]">Step-by-step instructions with direct links to your Twilio Console.</p>
            </div>
          </div>
          <div className="text-[var(--color-muted)]">
            {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showGuide && (
          <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-background)] space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Step 1 */}
              <div className="p-3 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[var(--color-primary)] font-semibold">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center">1</span>
                    <span>Open Twilio Console</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    Log in to your Twilio account dashboard. If you don't have one, you can sign up for a free trial.
                  </p>
                </div>
                <a
                  href="https://console.twilio.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-primary)] hover:underline pt-1"
                >
                  <span>Go to Twilio Console</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Step 2 */}
              <div className="p-3 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[var(--color-primary)] font-semibold">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center">2</span>
                    <span>Find Account Info Section</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    Scroll down on the main Dashboard to the <strong>Account Info</strong> card.
                  </p>
                </div>
                <div className="text-[10px] text-[var(--color-muted)] bg-[var(--color-background)] p-1.5 rounded font-mono">
                  Account SID: Starts with "AC..."
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-3 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[var(--color-primary)] font-semibold">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center">3</span>
                    <span>Copy SID & Auth Token</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    Click <strong>Copy</strong> on your Account SID and click <strong>Show</strong> to copy your Auth Token.
                  </p>
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Paste both below & click 1-Click Auto Setup
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {message && (
        <Alert
          type={message.type === "success" ? "success" : "danger"}
          onDismiss={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      {/* 1-Click Auto Provisioning Card */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] bg-[var(--color-surface)] overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/30">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--color-heading)]">
                  1-Click Auto-Provisioning
                </h3>
                <span className="text-[10px] uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Enter your <strong>Account SID</strong> and <strong>Auth Token</strong>. We will discover your phone numbers, create a TwiML App, and configure voice webhooks automatically.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleAutoSetup}
            isLoading={autoSettingUp}
            leftIcon={<Sparkles className="w-4 h-4" />}
            className="shrink-0 shadow-xs"
          >
            Connect & Auto-Configure
          </Button>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--color-surface)]">
          <Input
            label="Twilio Account SID"
            type="text"
            required
            value={accountSid}
            onChange={(e) => setAccountSid(e.target.value)}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="font-mono text-xs"
            leftIcon={<Key className="w-3.5 h-3.5" />}
            helperText="Located on your Twilio Console dashboard (starts with AC)."
          />
          <Input
            label="Twilio Auth Token"
            type="password"
            required
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="••••••••••••••••••••••••••••••••"
            className="font-mono text-xs"
            leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
            helperText="Stored securely and encrypted at rest."
          />
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <Tabs
        tabs={[
          { id: "credentials", label: "Phone Numbers & Manual Keys", icon: <Phone className="w-3.5 h-3.5" /> },
          { id: "routing", label: "Inbound Call Routing & AI Agents", icon: <PhoneForwarded className="w-3.5 h-3.5" /> },
          { id: "developer", label: "Advanced WebRTC Softphone", icon: <Code2 className="w-3.5 h-3.5" /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />

      <form onSubmit={handleSave} className="space-y-2">
        {/* TAB 1: Credentials & Numbers */}
        {activeTab === "credentials" && (
          <div className="divide-y divide-[var(--color-border)]">
            {/* Account Balance Overview Card */}
            {config && (
              <FormSection
                title="Twilio Account Balance & Billing"
                description="Live balance on your connected Twilio account. Keep a positive balance for uninterrupted outbound and inbound AI calls."
                actions={
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => loadBalance(selectedOrgId || undefined)}
                      isLoading={loadingBalance}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                    >
                      Refresh Balance
                    </Button>
                    <a
                      href="https://console.twilio.com/us1/billing/manage-billing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-main,0.375rem)] text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-heading)] hover:border-[var(--color-primary)] transition-colors shadow-2xs"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Top Up / Manage Billing</span>
                      <ExternalLink className="w-3 h-3 text-[var(--color-muted)]" />
                    </a>
                  </div>
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Balance Metric Card */}
                  <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[var(--color-muted)] font-medium">Available Balance</span>
                      <Wallet className="w-4 h-4 text-[var(--color-primary)]" />
                    </div>
                    <div className="text-xl font-bold font-mono text-[var(--color-heading)]">
                      {balanceInfo?.balance
                        ? parseFloat(balanceInfo.balance).toLocaleString("en-US", { style: "currency", currency: balanceInfo.currency || "USD" })
                        : loadingBalance
                        ? "Loading..."
                        : balanceInfo?.error
                        ? "Unavailable"
                        : "$0.00 USD"}
                    </div>
                    <div className="text-[10px] text-[var(--color-muted)] flex items-center gap-1">
                      <span>Currency:</span>
                      <strong className="font-mono text-[var(--color-heading)] uppercase">{balanceInfo?.currency || "USD"}</strong>
                    </div>
                  </div>

                  {/* Status Indicator Card */}
                  <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[var(--color-muted)] font-medium">Balance Health</span>
                      {balanceInfo?.balance && parseFloat(balanceInfo.balance) < 5 ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      )}
                    </div>
                    <div className="text-sm font-semibold text-[var(--color-heading)] pt-0.5">
                      {!balanceInfo?.balance
                        ? "Checking status..."
                        : parseFloat(balanceInfo.balance) <= 0
                        ? "Depleted (Calls will fail)"
                        : parseFloat(balanceInfo.balance) < 5
                        ? "Low Balance Warning"
                        : "Healthy Balance"}
                    </div>
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {!balanceInfo?.balance || parseFloat(balanceInfo.balance) >= 5
                        ? "Sufficient funds for outbound & inbound AI voice calls."
                        : "Please add funds in Twilio to prevent call disruption."}
                    </p>
                  </div>

                  {/* Connected Account Info Card */}
                  <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[var(--color-muted)] font-medium">Twilio Account SID</span>
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="text-xs font-mono font-medium text-[var(--color-heading)] truncate pt-1">
                      {config.account_sid}
                    </div>
                    <p className="text-[10px] text-[var(--color-muted)]">
                      Credentials validated & connected to Azure Cosmos DB.
                    </p>
                  </div>
                </div>
              </FormSection>
            )}

            {/* Phone Numbers Management */}
            <FormSection
              title="Active Phone Numbers"
              description="Phone numbers purchased in Twilio that this organization can use for outbound caller IDs and receiving calls."
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFetchNumbers}
                  isLoading={fetchingNumbers}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Sync from Twilio
                </Button>
              }
            >
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="+1 (555) 000-0000"
                    value={newNumberInput}
                    onChange={(e) => setNewNumberInput(e.target.value)}
                    className="font-mono text-xs max-w-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddNumber();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddNumber}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Number
                  </Button>
                </div>

                {phoneNumbers.length === 0 ? (
                  <div className="p-4 border border-dashed border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-center text-xs text-[var(--color-muted)]">
                    No phone numbers added yet. Click <strong>Sync from Twilio</strong> or type one above.
                  </div>
                ) : (
                  <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] divide-y divide-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
                    {phoneNumbers.map((num, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                        {editingIndex === idx ? (
                          <div className="flex items-center gap-2 flex-1 max-w-sm">
                            <Input
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              className="font-mono text-xs h-7"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveEdit(idx);
                                }
                              }}
                            />
                            <Button size="sm" type="button" onClick={() => handleSaveEdit(idx)} className="h-7 px-2 text-xs">
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-[var(--color-heading)]">{num}</span>
                            {idx === 0 && (
                              <Badge variant="primary" size="sm">Primary Caller ID</Badge>
                            )}
                          </div>
                        )}
                        {editingIndex !== idx && (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingIndex(idx);
                                setEditingValue(num);
                              }}
                              className="h-7 px-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setNumberToDelete({ index: idx, number: num })}
                              className="h-7 px-2 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FormSection>
          </div>
        )}

        {/* TAB 2: Inbound Call Routing & AI Agents */}
        {activeTab === "routing" && (
          <div className="divide-y divide-[var(--color-border)]">
            {/* Primary Default AI Agent Assignment */}
            <FormSection
              title="Default AI Voice Agent"
              description="Select the primary AI Voice Agent that answers inbound phone calls and acts as default for the calling console."
            >
              <div className="max-w-md">
                <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>Primary Voice Agent</span>
                </label>
                <select
                  value={defaultAgentId}
                  onChange={(e) => setDefaultAgentId(e.target.value)}
                  className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
                >
                  {availableAgents.my_agents && availableAgents.my_agents.length > 0 && (
                    <optgroup label="My Organization Agents">
                      {availableAgents.my_agents.map((a) => (
                        <option key={`my_def_${a.agent_id}`} value={a.agent_id}>
                          {a.name} (v{a.version}) - {a.role}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {availableAgents.default_agents && availableAgents.default_agents.length > 0 && (
                    <optgroup label="Platform Default Agents">
                      {availableAgents.default_agents
                        .filter((da) => !(availableAgents.my_agents || []).some((ma) => ma.agent_id === da.agent_id))
                        .map((a) => (
                          <option key={`platform_def_${a.agent_id}`} value={a.agent_id}>
                            {a.name} - {a.role}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-[11px] text-[var(--color-muted)] mt-1">
                  Used when no specific per-number mapping is configured.
                </p>
              </div>
            </FormSection>

            {/* Per-Number Inbound AI Agent Assignment */}
            {phoneNumbers.length > 0 && (
              <FormSection
                title="Per-Number AI Agent Assignment"
                description="Assign distinct AI Voice Agents to answer each of your specific Twilio phone numbers."
              >
                <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] divide-y divide-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
                  {phoneNumbers.map((num) => {
                    const currentAssigned = inboundAgentMapping[num] || defaultAgentId;
                    return (
                      <div key={num} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                          <span className="font-mono font-medium text-[var(--color-heading)]">{num}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--color-muted)] text-[11px]">Assigned Agent:</span>
                          <select
                            value={currentAssigned}
                            onChange={(e) => handlePerNumberAgentChange(num, e.target.value)}
                            className="h-8 px-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
                          >
                            {availableAgents.my_agents && availableAgents.my_agents.length > 0 && (
                              <optgroup label="My Organization Agents">
                                {availableAgents.my_agents.map((a) => (
                                  <option key={`my_map_${num}_${a.agent_id}`} value={a.agent_id}>
                                    {a.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {availableAgents.default_agents && availableAgents.default_agents.length > 0 && (
                              <optgroup label="Platform Defaults">
                                {availableAgents.default_agents
                                  .filter((da) => !(availableAgents.my_agents || []).some((ma) => ma.agent_id === da.agent_id))
                                  .map((a) => (
                                    <option key={`platform_map_${num}_${a.agent_id}`} value={a.agent_id}>
                                      {a.name}
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FormSection>
            )}

            {/* Inbound Routing Strategy */}
            <FormSection
              title="Inbound Routing Strategy"
              description="Choose how incoming customer calls to your Twilio phone numbers are handled."
            >
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: "global", label: "AI Voice Agent (Standard)", desc: "Route inbound calls directly to assigned AI voice agent" },
                    { id: "per_number", label: "Human PSTN Forwarding", desc: "Forward inbound calls to external mobile or office numbers" },
                    { id: "disabled", label: "Disabled", desc: "Do not answer or forward inbound calls" },
                  ].map((mode) => (
                    <label
                      key={mode.id}
                      className={`p-3 rounded-[var(--radius-main,0.375rem)] border cursor-pointer transition-colors block ${
                        inboundForwardMode === mode.id
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="forward_mode"
                        value={mode.id}
                        checked={inboundForwardMode === mode.id}
                        onChange={() => setInboundForwardMode(mode.id as any)}
                        className="sr-only"
                      />
                      <div className="font-medium text-xs text-[var(--color-heading)]">{mode.label}</div>
                      <div className="text-[11px] text-[var(--color-muted)] mt-1">{mode.desc}</div>
                    </label>
                  ))}
                </div>

                {/* Global Forwarding Target Number */}
                {inboundForwardMode === "global" && (
                  <div className="pt-2">
                    <Input
                      label="Fallback Forwarding Destination (Optional)"
                      value={inboundForwardGlobalNumber}
                      onChange={(e) => setInboundForwardGlobalNumber(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="font-mono text-xs"
                      helperText="If the AI agent transfers to a human representative, calls bridge here."
                    />
                  </div>
                )}

                {/* Per-Number Forwarding Mapping Table */}
                {inboundForwardMode === "per_number" && (
                  <div className="pt-2 space-y-2">
                    <label className="block text-xs font-medium text-[var(--color-heading)]">
                      Per-Number Human Forwarding Mapping
                    </label>
                    <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] divide-y divide-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
                      {phoneNumbers.map((num) => (
                        <div key={num} className="p-2.5 flex items-center justify-between gap-4 text-xs">
                          <span className="font-mono font-medium text-[var(--color-heading)] min-w-[120px]">{num}</span>
                          <span className="text-[var(--color-muted)] text-[11px]">&rarr; forwards to</span>
                          <Input
                            value={inboundForwardMapping[num] || ""}
                            onChange={(e) => handlePerNumberForwardChange(num, e.target.value)}
                            placeholder="+1 (555) 000-0000"
                            className="font-mono text-xs h-7 max-w-[200px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </FormSection>
          </div>
        )}

        {/* TAB 3: Developer & WebRTC */}
        {activeTab === "developer" && (
          <div className="divide-y divide-[var(--color-border)]">
            <FormSection
              title="WebRTC Softphone Keys"
              description="Required for direct in-browser microphone audio dialing and softphone access tokens."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="API Key SID"
                  type="text"
                  value={apiKeySid}
                  onChange={(e) => setApiKeySid(e.target.value)}
                  placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="font-mono text-xs"
                  helperText="Twilio Standard API Key SID (starts with SK)."
                />
                <Input
                  label="API Key Secret"
                  type="password"
                  value={apiKeySecret}
                  onChange={(e) => setApiKeySecret(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="font-mono text-xs"
                  helperText="API Key Secret paired with the SID."
                />
                <Input
                  label="TwiML App SID"
                  type="text"
                  value={twimlAppSid}
                  onChange={(e) => setTwimlAppSid(e.target.value)}
                  placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="font-mono text-xs"
                  helperText="TwiML App configured with the voice webhook URL."
                />
              </div>
            </FormSection>
          </div>
        )}
      </form>

      {/* Delete Phone Number Confirmation Modal */}
      <Modal
        isOpen={!!numberToDelete}
        onClose={() => setNumberToDelete(null)}
        title="Remove Phone Number"
        description="Are you sure you want to remove this phone number from your organization?"
        maxWidth="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNumberToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={confirmDeleteNumber}
            >
              Remove Number
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold font-mono text-[var(--color-heading)] text-sm">
                {numberToDelete?.number}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                Active Organization Caller ID
              </p>
            </div>
          </div>
          <p className="text-[var(--color-muted)] leading-relaxed">
            Removing this number will unbind any custom inbound call forwarding or dedicated AI agent mappings configured for it.
          </p>
        </div>
      </Modal>
    </div>
  );
}
