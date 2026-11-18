import React, { useEffect, useState } from "react";
import { Plus, Trash2, Zap, Save, RefreshCw } from "lucide-react";
import { fetchApi } from "../api-client";
import { AvailableAgentsResponse, PlivoConfig } from "../types";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Alert } from "./ui/Alert";
import { FormSection } from "./ui/FormSection";
import { LoadingState } from "./ui/LoadingState";

type Message = { text: string; type: "success" | "danger" };

const selectClass =
  "w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium";

export function PlivoSettingsForm() {
  const [config, setConfig] = useState<PlivoConfig | null>(null);
  const [authId, setAuthId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState("");
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (phoneNumbers.length === 0) {
      setMessage({ text: "Please configure at least one phone number.", type: "danger" });
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
      setMessage({ text: "Telephony settings saved successfully.", type: "success" });
    } catch (e: any) {
      setMessage({ text: e.message || "Could not save telephony settings.", type: "danger" });
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
      <div className="py-12">
        <LoadingState message="Loading telephony settings..." subMessage="Fetching numbers and agent routing" size="lg" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {message && (
        <Alert type={message.type} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <FormSection title="Account credentials" description="Your Auth ID and Auth Token from the telephony provider console.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Auth ID" value={authId} onChange={(e) => setAuthId(e.target.value)} placeholder="Auth ID" required />
          <Input
            label="Auth Token"
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Auth Token"
            required
            autoComplete="off"
          />
          <Input
            label="Public Base URL"
            value={publicBaseUrl}
            onChange={(e) => setPublicBaseUrl(e.target.value)}
            placeholder="https://your-server.example.com"
            helperText="Must be reachable from the internet (HTTPS)."
          />
        </div>
      </FormSection>

      <FormSection title="Phone numbers" description="Numbers used for outbound caller ID and inbound calls.">
        <ul className="space-y-1.5">
          {phoneNumbers.map((num, i) => (
            <li key={num} className="flex items-center justify-between px-3 py-1.5 rounded border border-[var(--color-border)] text-sm">
              <span className="font-mono">{num}</span>
              <button
                type="button"
                aria-label={`Remove ${num}`}
                onClick={() => setPhoneNumbers(phoneNumbers.filter((_, idx) => idx !== i))}
                className="text-[var(--color-muted)] hover:text-red-500 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2 mt-3">
          <Input label="Add number" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="+91..." />
          <Button type="button" variant="outline" size="md" onClick={addNumber} leftIcon={<Plus className="w-3.5 h-3.5" />}>
            Add
          </Button>
          <Button type="button" variant="outline" size="md" onClick={handleFetchNumbers} isLoading={fetching} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Fetch from account
          </Button>
        </div>
      </FormSection>

      <FormSection title="Call routing" description="Which agent answers, and where escalations go.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="plivo-agent" className="block text-xs font-medium text-[var(--color-heading)]">Primary Voice Agent</label>
            <select id="plivo-agent" value={defaultAgentId} onChange={(e) => setDefaultAgentId(e.target.value)} className={selectClass}>
              {agents.my_agents.map((a) => (
                <option key={`my_${a.agent_id}`} value={a.agent_id}>{a.name} - {a.role}</option>
              ))}
              {agents.default_agents.map((a) => (
                <option key={`def_${a.agent_id}`} value={a.agent_id}>{a.name} - {a.role}</option>
              ))}
              <option value="agt_receptionist_default">Default receptionist</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="plivo-forward" className="block text-xs font-medium text-[var(--color-heading)]">Human forwarding</label>
            <select id="plivo-forward" value={forwardMode} onChange={(e) => setForwardMode(e.target.value as any)} className={selectClass}>
              <option value="global">One number for all calls</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          {forwardMode === "global" && (
            <Input label="Forward to number" value={forwardNumber} onChange={(e) => setForwardNumber(e.target.value)} placeholder="+91..." />
          )}
          <Input label="Escalation alert email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="alerts@example.com" />
          <label className="flex items-center gap-2 text-xs text-[var(--color-heading)]">
            <input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} />
            Send escalation alerts
          </label>
        </div>
      </FormSection>

      <div className="flex items-center gap-2">
        {config && (
          <Button type="button" variant="outline" onClick={handleTest} isLoading={testing} leftIcon={<Zap className="w-3.5 h-3.5 text-amber-500" />}>
            Test Connection
          </Button>
        )}
        <Button type="submit" variant="primary" isLoading={saving} leftIcon={<Save className="w-3.5 h-3.5" />}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
