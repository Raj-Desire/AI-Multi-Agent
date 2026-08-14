import React, { useState, useEffect } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig } from "../types";
import {
  Key,
  Lock,
  Phone,
  PhoneForwarded,
  ShieldCheck,
  Save,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Globe,
  Radio,
  PhoneIncoming,
  Layers,
  Zap,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";

export function TwilioSettingsView() {
  const [config, setConfig] = useState<TwilioConfig | null>(null);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [twimlAppSid, setTwimlAppSid] = useState("");
  const [apiKeySid, setApiKeySid] = useState("");
  const [apiKeySecret, setApiKeySecret] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");

  // Inbound Call Forwarding states
  const [inboundForwardMode, setInboundForwardMode] = useState<"global" | "per_number" | "disabled">("global");
  const [inboundForwardGlobalNumber, setInboundForwardGlobalNumber] = useState("");
  const [inboundForwardMapping, setInboundForwardMapping] = useState<Record<string, string>>({});

  // Master Phone Numbers List state
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [newNumberInput, setNewNumberInput] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetchingNumbers, setFetchingNumbers] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const data = await fetchApi<TwilioConfig | null>("/twilio/configuration");
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
        const parsed = (data.phone_number || "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        setPhoneNumbers(parsed);
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }

  const handleAutoFetchNumbers = async () => {
    if (!accountSid.trim() || !authToken.trim()) {
      setMessage({ text: "Please enter your Twilio Account SID and Auth Token first to fetch numbers.", type: "error" });
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
        setMessage({ text: "No purchased phone numbers found on this Twilio account. Please purchase a number in Twilio Console.", type: "error" });
        return;
      }

      const combined = Array.from(new Set([...phoneNumbers, ...fetched]));
      setPhoneNumbers(combined);
      setMessage({ text: `Successfully pulled ${fetched.length} purchased Twilio number(s)! Click Save Configuration below to persist.`, type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to fetch phone numbers from Twilio.", type: "error" });
    } finally {
      setFetchingNumbers(false);
    }
  };

  const handleAddNumber = () => {
    const trimmed = newNumberInput.trim();
    if (!trimmed) return;
    if (phoneNumbers.includes(trimmed)) {
      setMessage({ text: `Phone number ${trimmed} is already in your list.`, type: "error" });
      return;
    }
    setPhoneNumbers([...phoneNumbers, trimmed]);
    setNewNumberInput("");
    setMessage(null);
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingValue(phoneNumbers[index]);
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

    setEditingIndex(null);
    setEditingValue("");
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingValue("");
  };

  const handleDeleteNumber = (index: number) => {
    if (phoneNumbers.length === 1) {
      if (!window.confirm("This is your only configured phone number. Remove it?")) {
        return;
      }
    }
    const numToDelete = phoneNumbers[index];
    const updated = phoneNumbers.filter((_, i) => i !== index);
    setPhoneNumbers(updated);

    if (inboundForwardMapping[numToDelete]) {
      const newMapping = { ...inboundForwardMapping };
      delete newMapping[numToDelete];
      setInboundForwardMapping(newMapping);
    }
  };

  const handlePerNumberForwardChange = (twilioNum: string, targetNum: string) => {
    setInboundForwardMapping((prev) => ({
      ...prev,
      [twilioNum]: targetNum,
    }));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (phoneNumbers.length === 0) {
      setMessage({ text: "Please add at least one Twilio phone number.", type: "error" });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      const joinedNumbers = phoneNumbers.join(", ");
      const updated = await fetchApi<TwilioConfig>("/twilio/configuration", {
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
        }),
      });
      setConfig(updated);
      setAuthToken(updated.auth_token_masked);
      if (updated.api_key_secret_masked) {
        setApiKeySecret(updated.api_key_secret_masked);
      }
      setMessage({ text: "Twilio credentials, WebRTC dialer keys, and Inbound forwarding rules saved successfully!", type: "success" });
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
      const res = await fetchApi<{ success: boolean; message: string }>("/twilio/test-connection", {
        method: "POST",
      });
      if (res.success) {
        setMessage({ text: res.message, type: "success" });
      } else {
        setMessage({ text: res.message, type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Twilio connection test failed", type: "error" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4 text-sub">
        <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs font-semibold uppercase tracking-wider">Loading Twilio configuration...</span>
      </div>
    );
  }

  const isConnected = config?.status === "CONNECTED";

  return (
    <div className="w-full space-y-6 pb-16">
      {/* Page Header */}
      <PageHeader
        title="Twilio Voice & WebRTC Settings"
        description="Configure your Programmable Voice account, in-browser WebRTC softphone keys, and automated inbound call forwarding rules."
        badge={
          <Badge variant={isConnected ? "success" : "neutral"} size="md" dot={isConnected}>
            {isConnected ? "Gateway Connected" : "Not Configured"}
          </Badge>
        }
        actions={
          config && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              isLoading={testing}
              leftIcon={<Zap className="w-3.5 h-3.5 text-amber-500" />}
            >
              Test Connection
            </Button>
          )
        }
      />

      {/* Global Status Message Toast */}
      {message && (
        <Alert
          type={message.type === "success" ? "success" : "danger"}
          onDismiss={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* SECTION 1: Core Twilio Credentials */}
        <Card className="bg-white border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                style={{
                  backgroundColor: "var(--color-primary-light)",
                  color: "var(--color-primary)",
                  borderColor: "var(--color-primary-ring)",
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center border"
              >
                <Key className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm">1. Twilio Core Account Credentials</CardTitle>
                <CardDescription>Primary Account SID and Auth Token from Twilio Console</CardDescription>
              </div>
            </div>
            <Badge variant="primary" size="sm">Mandatory</Badge>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Account SID"
                type="text"
                required
                value={accountSid}
                onChange={(e) => setAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono text-xs"
                helperText="Found on the Twilio Console homepage (starts with AC)."
              />

              <Input
                label="Auth Token"
                type="password"
                required
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="font-mono text-xs"
                helperText="Encrypted at rest in Azure Cosmos DB."
              />
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: WebRTC In-Browser Calling Keys */}
        <Card className="bg-white border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                style={{
                  backgroundColor: "var(--color-primary-light)",
                  color: "var(--color-primary)",
                  borderColor: "var(--color-primary-ring)",
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center border"
              >
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm">2. WebRTC Live In-Browser Calling (Softphone Keys)</CardTitle>
                <CardDescription>Required for direct browser mic audio calls via WebRTC.</CardDescription>
              </div>
            </div>
            <Badge variant="primary" size="sm">WebRTC Audio</Badge>
          </CardHeader>

          <CardContent className="space-y-4">
            <Input
              label="TwiML App SID"
              type="text"
              value={twimlAppSid}
              onChange={(e) => setTwimlAppSid(e.target.value)}
              placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-xs"
              helperText="Created under Twilio Console > Voice > TwiML Apps (starts with AP)."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="API Key SID"
                type="text"
                value={apiKeySid}
                onChange={(e) => setApiKeySid(e.target.value)}
                placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono text-xs"
                helperText="Twilio Standard API Key (starts with SK)."
              />

              <Input
                label="API Key Secret"
                type="password"
                value={apiKeySecret}
                onChange={(e) => setApiKeySecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="font-mono text-xs"
                helperText="Secret corresponding to your API Key SID."
              />
            </div>

            <div className="space-y-2 pt-2">
              <Input
                label="Public Webhook Base URL (Host / Tunnel)"
                type="text"
                value={publicBaseUrl}
                onChange={(e) => setPublicBaseUrl(e.target.value)}
                placeholder="https://your-domain.ngrok-free.dev or https://api.yourdomain.com"
                className="font-mono text-xs"
                helperText="Twilio webhook endpoint automatically resolved upon save."
              />
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center gap-2">
                <Globe className="w-4 h-4 theme-primary-text shrink-0" />
                <span className="text-sub">
                  Twilio Webhook Destination:{" "}
                  <code className="font-mono theme-primary-text font-bold">
                    {publicBaseUrl ? `${publicBaseUrl.replace(/\/+$/, "")}/api/v1/twilio/voice/twiml` : "https://<your-host>/api/v1/twilio/voice/twiml"}
                  </code>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3: Configured Phone Numbers */}
        <Card className="bg-white border border-slate-200">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                style={{
                  backgroundColor: "var(--color-primary-light)",
                  color: "var(--color-primary)",
                  borderColor: "var(--color-primary-ring)",
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center border"
              >
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm">3. Twilio Caller ID Phone Numbers ({phoneNumbers.length})</CardTitle>
                <CardDescription>Caller IDs available for outbound dialing and inbound routing.</CardDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoFetchNumbers}
              isLoading={fetchingNumbers}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Auto-Fetch From Twilio
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Add Number Input Row */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newNumberInput}
                onChange={(e) => setNewNumberInput(e.target.value)}
                placeholder="e.g. +15551234567"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddNumber();
                  }
                }}
                className="flex-1 ui-input text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-heading focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
              />
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleAddNumber}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add Number
              </Button>
            </div>

            {/* List */}
            {phoneNumbers.length === 0 ? (
              <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-1 text-xs text-sub">
                <Phone className="w-6 h-6 mx-auto opacity-50 mb-2" />
                <div className="font-bold text-heading">No phone numbers configured yet</div>
                <p>Click "Auto-Fetch From Twilio" above to pull all purchased numbers.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                {phoneNumbers.map((num, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 hover:shadow-xs transition-all"
                  >
                    {editingIndex === index ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--color-primary)] text-xs font-mono focus:outline-none"
                          autoFocus
                        />
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => handleSaveEdit(index)}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div
                            style={{
                              backgroundColor: "var(--color-primary-light)",
                              color: "var(--color-primary)",
                            }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
                          >
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-mono text-xs font-bold text-heading">{num}</div>
                            {index === 0 && (
                              <span
                                style={{ color: "var(--color-primary)" }}
                                className="text-[10px] font-bold uppercase tracking-wider block"
                              >
                                Primary Outbound ID
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(index)}
                            className="p-1.5 text-sub hover:theme-primary-text rounded-lg cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNumber(index)}
                            className="p-1.5 text-sub hover:text-rose-600 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 4: Inbound Call Forwarding */}
        <Card className="bg-white border border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div
                style={{
                  backgroundColor: "var(--color-primary-light)",
                  color: "var(--color-primary)",
                  borderColor: "var(--color-primary-ring)",
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center border"
              >
                <PhoneIncoming className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm">4. Inbound Call Forwarding Rules</CardTitle>
                <CardDescription>Control automated forwarding for incoming customer calls.</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setInboundForwardMode("global")}
                style={{
                  borderColor: inboundForwardMode === "global" ? "var(--color-primary)" : "#e2e8f0",
                  backgroundColor: inboundForwardMode === "global" ? "var(--color-primary-light)" : "#ffffff",
                }}
                className="p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs"
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <PhoneForwarded className="w-3.5 h-3.5 theme-primary-text" />
                  <span className="text-heading">Global Forward</span>
                </div>
                <p className="text-[11px] text-sub mt-1 leading-relaxed">
                  Forward all incoming lines to one master phone.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setInboundForwardMode("per_number")}
                style={{
                  borderColor: inboundForwardMode === "per_number" ? "var(--color-primary)" : "#e2e8f0",
                  backgroundColor: inboundForwardMode === "per_number" ? "var(--color-primary-light)" : "#ffffff",
                }}
                className="p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs"
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Layers className="w-3.5 h-3.5 theme-primary-text" />
                  <span className="text-heading">Per-Number Mapping</span>
                </div>
                <p className="text-[11px] text-sub mt-1 leading-relaxed">
                  Assign individual forward destinations per line.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setInboundForwardMode("disabled")}
                style={{
                  borderColor: inboundForwardMode === "disabled" ? "#94a3b8" : "#e2e8f0",
                  backgroundColor: inboundForwardMode === "disabled" ? "#f1f5f9" : "#ffffff",
                }}
                className="p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs"
              >
                <div className="flex items-center gap-2 font-bold text-xs text-sub">
                  <X className="w-3.5 h-3.5" />
                  <span className="text-heading">Disabled</span>
                </div>
                <p className="text-[11px] text-sub mt-1 leading-relaxed">
                  Do not forward incoming calls.
                </p>
              </button>
            </div>

            {inboundForwardMode === "global" && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <Input
                  label="Master Inbound Forwarding Target (E.164)"
                  type="text"
                  value={inboundForwardGlobalNumber}
                  onChange={(e) => setInboundForwardGlobalNumber(e.target.value)}
                  placeholder="e.g. +15559876543"
                  className="font-mono text-xs"
                  helperText="Incoming calls immediately bridge and ring this target number."
                />
              </div>
            )}

            {inboundForwardMode === "per_number" && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-sub">
                  Twilio Line &rarr; Forward Destination Mapping
                </div>
                {phoneNumbers.map((twNum) => (
                  <div key={twNum} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-mono text-xs font-bold sm:w-40 shrink-0 text-heading">{twNum}</span>
                    <input
                      type="text"
                      value={inboundForwardMapping[twNum] || ""}
                      onChange={(e) => handlePerNumberForwardChange(twNum, e.target.value)}
                      placeholder={`Target for ${twNum}`}
                      className="flex-1 ui-input text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-heading focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sticky Action Footer */}
        <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-xl text-heading">
          <div className="flex items-center gap-2 text-xs text-sub">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Settings are encrypted in Azure Cosmos DB NoSQL.</span>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={saving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {config ? "Update Configuration" : "Save Configuration"}
          </Button>
        </div>
      </form>
    </div>
  );
}
