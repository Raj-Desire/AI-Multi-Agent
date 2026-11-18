import React, { useEffect, useState } from "react";
import {
  Bot,
  Check,
  Key,
  Phone,
  PhoneForwarded,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { fetchApi } from "../api-client";
import { AvailableAgentsResponse, PlivoConfig } from "../types";
import { Alert } from "./ui/Alert";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { FormSection } from "./ui/FormSection";
import { Input } from "./ui/Input";
import { LoadingState } from "./ui/LoadingState";
import { PageHeader } from "./ui/PageHeader";
import { StatusIndicator } from "./ui/StatusIndicator";
import { Tabs } from "./ui/Tabs";

type Message = { text: string; type: "success" | "danger" };

const selectClass =
  "w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium";

/** Settings for the domestic network: credentials, phone numbers and inbound call routing (same layout as the international page). */
export function PlivoSettingsForm() {
  const [config, setConfig] = useState<PlivoConfig | null>(null);
  const [activeTab, setActiveTab] = useState<string>("numbers");
  const [authId, setAuthId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [defaultAgentId, setDefaultAgentId] = useState("agt_receptionist_default");
  const [forwardMode, setForwardMode] = useState<"global" | "per_number" | "disabled">("global");
  const [forwardNumber, setForwardNumber] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [alertEmail, setAlertEmail] = useState("");
  const [agents, setAgents] = useState<AvailableAgentsResponse>({ my_agents: [], default_agents: [] });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  function applyConfig(data: PlivoConfig | null) {
    setConfig(data);
    if (!data) return;
    setAuthId(data.auth_id || "");
    setAuthToken(data.auth_token_masked || "");
    setPhoneNumbers((data.phone_number || "").split(",").map((n) => n.trim()).filter(Boolean));
    setPublicBaseUrl(data.public_base_url || "");
    setDefaultAgentId(data.default_agent_id || "agt_receptionist_default");
    setForwardMode(data.inbound_forward_mode || "global");
    setForwardNumber(data.inbound_forward_global_number || "");
    setAlertsEnabled(data.escalation_alerts_enabled !== false);
    setAlertEmail(data.escalation_alert_email || "");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, available] = await Promise.all([
          fetchApi<PlivoConfig | null>("/plivo/configuration"),
          fetchApi<AvailableAgentsResponse>("/agents/available").catch(() => null),
        ]);
        if (cancelled) return;
        applyConfig(cfg);
        if (available) setAgents(available);
      } catch (e: any) {
        if (!cancelled) setMessage({ text: e.message || "Could not load telephony settings.", type: "danger" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function addNumber() {
    const value = newNumber.trim();
    if (value && !phoneNumbers.includes(value)) setPhoneNumbers([...phoneNumbers, value]);
    setNewNumber("");
  }

  function saveEdit(index: number) {
    const value = editingValue.trim();
    if (value) setPhoneNumbers(phoneNumbers.map((n, i) => (i === index ? value : n)));
    setEditingIndex(null);
  }

  async function handleFetchNumbers() {
    try {
      setFetching(true);
      setMessage(null);
      const found = await fetchApi<string[]>("/plivo/fetch-numbers", {
        method: "POST",
        body: JSON.stringify({ auth_id: authId, auth_token: authToken }),
      });
      setPhoneNumbers(Array.from(new Set([...phoneNumbers, ...found])));
      setMessage({ text: `${found.length} number(s) found on the account.`, type: "success" });
    } catch (e: any) {
      setMessage({ text: e.message || "Could not fetch numbers.", type: "danger" });
    } finally {
      setFetching(false);
    }
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    if (phoneNumbers.length === 0) {
      setMessage({ text: "Please configure at least one phone number.", type: "danger" });
      setActiveTab("numbers");
      return;
    }
    try {
      setSaving(true);
      setMessage(null);
      const updated = await fetchApi<PlivoConfig>("/plivo/configuration", {
        method: "POST",
        body: JSON.stringify({
          auth_id: authId,
          auth_token: authToken,
          phone_number: phoneNumbers.join(", "),
          public_base_url: publicBaseUrl,
          inbound_forward_mode: forwardMode,
          inbound_forward_global_number: forwardNumber,
          default_agent_id: defaultAgentId,
          escalation_alerts_enabled: alertsEnabled,
          escalation_alert_email: alertEmail,
        }),
      });
      applyConfig(updated);
      setMessage({ text: "Domestic phone settings, numbers and AI agent routing saved successfully.", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Could not save telephony settings.", type: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    try {
      setTesting(true);
      setMessage(null);
      const res = await fetchApi<{ success: boolean; message: string }>("/plivo/test-connection", { method: "POST" });
      setMessage({ text: res.message, type: res.success ? "success" : "danger" });
    } catch (e: any) {
      setMessage({ text: e.message || "Connection test failed.", type: "danger" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <LoadingState message="Loading domestic phone & voice configuration..." subMessage="Fetching phone numbers and inbound agent assignment" size="lg" />
      </div>
    );
  }

  const isConnected = config?.status === "CONNECTED";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domestic Phone & Voice Setup"
        description="Connect your domestic calling account, manage active caller IDs, and configure inbound AI agent routing."
        badge={<StatusIndicator status={isConnected ? "connected" : "idle"} label={isConnected ? "Connected & Ready" : "Not configured"} />}
        actions={
          <div className="flex items-center gap-2">
            {config && (
              <Button variant="outline" size="sm" onClick={handleTest} isLoading={testing} leftIcon={<Zap className="w-3.5 h-3.5 text-amber-500" />}>
                Test Connection
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => handleSave()} isLoading={saving} leftIcon={<Save className="w-3.5 h-3.5" />}>
              Save Changes
            </Button>
          </div>
        }
      />

      {message && (
        <Alert type={message.type} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {!config && (
        <Alert type="info" title="Not set up yet">
          Enter your credentials and phone numbers below, then save. Calls on this network start working once they are saved.
        </Alert>
      )}

      <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] bg-[var(--color-surface)] overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 flex items-start gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/30">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0 shadow-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-heading)]">Account credentials</h3>
            <p className="text-xs text-[var(--color-muted)] mt-1">
              Enter your <strong>Auth ID</strong> and <strong>Auth Token</strong>. Saving connects your numbers to this platform automatically.
            </p>
          </div>
        </div>
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--color-surface)]">
          <Input
            label="Auth ID"
            type="text"
            required
            value={authId}
            onChange={(e) => setAuthId(e.target.value)}
            placeholder="MAxxxxxxxxxxxxxxxxxx"
            className="font-mono text-xs"
            leftIcon={<Key className="w-3.5 h-3.5" />}
            helperText="Shown on your provider console dashboard."
          />
          <Input
            label="Auth Token"
            type="password"
            required
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="••••••••••••••••••••••••••••••••"
            className="font-mono text-xs"
            leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
            helperText="Stored securely and encrypted at rest."
            autoComplete="off"
          />
          <Input
            label="Public Base URL"
            type="text"
            value={publicBaseUrl}
            onChange={(e) => setPublicBaseUrl(e.target.value)}
            placeholder="https://your-server.example.com"
            className="font-mono text-xs sm:col-span-2"
            helperText="The public HTTPS address of this platform, so incoming calls and call events reach it."
          />
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "numbers", label: "Phone Numbers", icon: <Phone className="w-3.5 h-3.5" /> },
          { id: "routing", label: "Inbound Call Routing & AI Agents", icon: <PhoneForwarded className="w-3.5 h-3.5" /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />

      <form onSubmit={handleSave} className="space-y-2">
        {activeTab === "numbers" && (
          <div className="divide-y divide-[var(--color-border)]">
            <FormSection
              title="Phone Numbers"
              description="Numbers used for outbound caller ID and inbound calls. The first number is the primary caller ID."
              actions={
                <Button type="button" variant="outline" size="sm" onClick={handleFetchNumbers} isLoading={fetching} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                  Sync from account
                </Button>
              }
            >
              <div className="space-y-4">
                <div className="flex items-end gap-2">
                  <Input
                    label="Add number"
                    placeholder="+91 80000 00000"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    className="font-mono text-xs max-w-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addNumber();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addNumber} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                    Add Number
                  </Button>
                </div>

                {phoneNumbers.length === 0 ? (
                  <div className="p-4 border border-dashed border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-center text-xs text-[var(--color-muted)]">
                    No phone numbers added yet. Click <strong>Sync from account</strong> or type one above.
                  </div>
                ) : (
                  <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] divide-y divide-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
                    {phoneNumbers.map((num, idx) => (
                      <div key={num} className="p-2.5 flex items-center justify-between text-xs">
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
                                  saveEdit(idx);
                                }
                              }}
                            />
                            <Button size="sm" type="button" onClick={() => saveEdit(idx)} className="h-7 px-2 text-xs">
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-[var(--color-heading)]">{num}</span>
                            {idx === 0 && (
                              <Badge variant="primary" size="sm">
                                Primary Caller ID
                              </Badge>
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
                              aria-label={`Remove ${num}`}
                              onClick={() => setPhoneNumbers(phoneNumbers.filter((_, i) => i !== idx))}
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

        {activeTab === "routing" && (
          <div className="divide-y divide-[var(--color-border)]">
            <FormSection title="Inbound AI Agent" description="Which AI agent answers calls to your numbers." >
              <div className="space-y-1.5 max-w-md">
                <label htmlFor="plivo-agent" className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-heading)]">
                  <Bot className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>Primary Voice Agent</span>
                </label>
                <select id="plivo-agent" value={defaultAgentId} onChange={(e) => setDefaultAgentId(e.target.value)} className={selectClass}>
                  {agents.my_agents.length > 0 && (
                    <optgroup label="My Organization Agents">
                      {agents.my_agents.map((a) => (
                        <option key={`my_${a.agent_id}`} value={a.agent_id}>
                          {a.name} - {a.role}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {agents.default_agents.length > 0 && (
                    <optgroup label="Default Agents">
                      {agents.default_agents.map((a) => (
                        <option key={`def_${a.agent_id}`} value={a.agent_id}>
                          {a.name} - {a.role}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="agt_receptionist_default">Default receptionist</option>
                </select>
              </div>
            </FormSection>

            <FormSection title="Human Forwarding" description="Send inbound calls straight to a person instead of the AI agent, or turn inbound calling off.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                <div className="space-y-1.5">
                  <label htmlFor="plivo-forward" className="block text-xs font-medium text-[var(--color-heading)]">
                    Forwarding mode
                  </label>
                  <select id="plivo-forward" value={forwardMode} onChange={(e) => setForwardMode(e.target.value as any)} className={selectClass}>
                    <option value="global">One number for all calls</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
                {forwardMode === "global" && (
                  <Input
                    label="Forward to number"
                    value={forwardNumber}
                    onChange={(e) => setForwardNumber(e.target.value)}
                    placeholder="+91 98000 00000"
                    className="font-mono text-xs"
                    helperText="Leave empty to let the AI agent answer."
                  />
                )}
              </div>
            </FormSection>

            <FormSection title="Escalation Alerts" description="Get an email when a call needs a person's attention.">
              <div className="space-y-3 max-w-md">
                <Input label="Alert email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="alerts@example.com" />
                <label className="flex items-center gap-2 text-xs text-[var(--color-heading)]">
                  <input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} />
                  Send escalation alerts
                </label>
              </div>
            </FormSection>
          </div>
        )}
      </form>
    </div>
  );
}
