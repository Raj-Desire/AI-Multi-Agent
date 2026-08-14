import React, { useState, useEffect } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig } from "../types";
import {
  Key,
  Lock,
  Phone,
  PhoneForwarded,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Save,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Globe,
  Radio,
  Sparkles,
  PhoneIncoming,
  Layers,
  HelpCircle,
  ExternalLink,
  ShieldAlert,
  Server,
  Zap,
} from "lucide-react";

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

      // Merge unique numbers with existing list
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

    // Update forward mapping if key changed
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
      <div className="flex flex-col items-center justify-center py-32 text-slate-500 space-y-4">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-medium">Loading Twilio configuration & Cosmos DB keys...</span>
      </div>
    );
  }

  const isConnected = config?.status === "CONNECTED";

  return (
    <div className="w-full space-y-8 font-sans pb-16">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 rounded-3xl text-white shadow-xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Zap className="w-5 h-5" />
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Twilio Voice & WebRTC Settings</h1>
          </div>
          <p className="text-slate-300 text-xs md:text-sm max-w-2xl leading-relaxed">
            Configure your Programmable Voice account, in-browser WebRTC softphone keys, and automated inbound call forwarding rules.
          </p>
        </div>

        {/* Status Indicator Pill */}
        <div className="flex items-center gap-3">
          <div className={`px-4 py-2.5 rounded-2xl border flex items-center gap-3 shadow-inner ${
            isConnected
              ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
              : "bg-slate-800/80 border-slate-700 text-slate-400"
          }`}>
            <span className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider opacity-70">Gateway Status</div>
              <div className="text-xs font-bold font-mono">{isConnected ? "Connected & Verified" : "Not Configured"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Status Message Toast */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-sm border flex items-start gap-3 shadow-sm transition-all animate-fadeIn ${
            message.type === "success"
              ? "bg-emerald-50/90 border-emerald-300 text-emerald-900"
              : "bg-rose-50/90 border-rose-300 text-rose-900"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="font-semibold flex-1 leading-snug">{message.text}</div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* SECTION 1: Core Twilio Credentials */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">1. Twilio Core Account Credentials</h2>
                <p className="text-xs text-slate-500">Your primary Twilio Account SID & Auth Token from Twilio Console.</p>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-full self-start sm:self-auto">
              Mandatory
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Account SID</span>
                <span className="text-[10px] text-slate-400 font-normal">Starts with AC</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono transition-all shadow-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Auth Token</span>
                <span className="text-[10px] text-emerald-600 font-medium">Encrypted at rest</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono transition-all shadow-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: WebRTC In-Browser Calling Keys */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-100">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">2. WebRTC Live In-Browser Calling (Softphone Keys)</h2>
                <p className="text-xs text-slate-500">
                  Required for direct microphone calling in the web browser without desk phones.
                </p>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200/80 px-3 py-1 rounded-full self-start sm:self-auto">
              WebRTC Audio
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>TwiML App SID</span>
                <span className="text-[10px] text-slate-400 font-normal">Starts with AP (Found in Twilio Console &gt; Voice &gt; TwiML Apps)</span>
              </label>
              <input
                type="text"
                value={twimlAppSid}
                onChange={(e) => setTwimlAppSid(e.target.value)}
                placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono transition-all shadow-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>API Key SID</span>
                <span className="text-[10px] text-slate-400 font-normal">Starts with SK</span>
              </label>
              <input
                type="text"
                value={apiKeySid}
                onChange={(e) => setApiKeySid(e.target.value)}
                placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono transition-all shadow-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>API Key Secret</span>
                <span className="text-[10px] text-emerald-600 font-medium">Encrypted at rest</span>
              </label>
              <input
                type="password"
                value={apiKeySecret}
                onChange={(e) => setApiKeySecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono transition-all shadow-xs"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Public Webhook Base URL (Tunnel / Server Host)</span>
                <span className="text-[10px] text-slate-400 font-normal">e.g. ngrok / Azure URL</span>
              </label>
              <input
                type="text"
                value={publicBaseUrl}
                onChange={(e) => setPublicBaseUrl(e.target.value)}
                placeholder="https://your-domain.ngrok-free.dev or https://api.yourdomain.com"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono transition-all shadow-xs"
              />
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  Twilio webhook destination automatically synced on save:{" "}
                  <code className="font-mono text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                    {publicBaseUrl ? `${publicBaseUrl.replace(/\/+$/, "")}/api/v1/twilio/voice/twiml` : "https://<your-host>/api/v1/twilio/voice/twiml"}
                  </code>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Configured Phone Numbers */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">3. Purchased Twilio Phone Numbers ({phoneNumbers.length})</h2>
                <p className="text-xs text-slate-500">Caller IDs available for outbound dialing and inbound routing.</p>
              </div>
            </div>

            {/* Quick Action: Auto-Fetch */}
            <button
              type="button"
              onClick={handleAutoFetchNumbers}
              disabled={fetchingNumbers}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingNumbers ? "animate-spin" : ""}`} />
              {fetchingNumbers ? "Syncing Twilio Numbers..." : "Auto-Fetch From Twilio"}
            </button>
          </div>

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
              className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono shadow-xs"
            />
            <button
              type="button"
              onClick={handleAddNumber}
              className="flex items-center gap-1.5 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" /> Add Number
            </button>
          </div>

          {/* Phone Numbers List Display */}
          {phoneNumbers.length === 0 ? (
            <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-2">
              <Phone className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-600">No phone numbers configured yet</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Click <strong>"Auto-Fetch From Twilio"</strong> above to pull all purchased numbers automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
              {phoneNumbers.map((num, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-white transition-all shadow-xs"
                >
                  {editingIndex === index ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-indigo-500 text-sm font-mono focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(index)}
                        className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="p-2 rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-mono text-sm font-bold text-slate-900">{num}</div>
                          {index === 0 && (
                            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                              Primary Outbound Caller ID
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(index)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNumber(index)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 4: Inbound Call Forwarding */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <PhoneIncoming className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">4. Inbound Call Forwarding Rules</h2>
                <p className="text-xs text-slate-500">
                  Control how incoming calls to your Twilio numbers are forwarded to your personal/office phones.
                </p>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-3 py-1 rounded-full self-start sm:self-auto">
              Call Routing
            </span>
          </div>

          {/* Mode Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setInboundForwardMode("global")}
              className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden ${
                inboundForwardMode === "global"
                  ? "bg-indigo-50/60 border-indigo-600 ring-2 ring-indigo-500/20 shadow-sm"
                  : "bg-slate-50/60 border-slate-200 hover:bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2.5 font-bold text-sm text-slate-900">
                <PhoneForwarded className="w-4 h-4 text-indigo-600" />
                Global Single Forward
              </div>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Forward all incoming calls across every Twilio number to one master target phone.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setInboundForwardMode("per_number")}
              className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden ${
                inboundForwardMode === "per_number"
                  ? "bg-indigo-50/60 border-indigo-600 ring-2 ring-indigo-500/20 shadow-sm"
                  : "bg-slate-50/60 border-slate-200 hover:bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2.5 font-bold text-sm text-slate-900">
                <Layers className="w-4 h-4 text-indigo-600" />
                Per-Number Routing Map
              </div>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Assign specific forwarding phone numbers individually for each Twilio line.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setInboundForwardMode("disabled")}
              className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden ${
                inboundForwardMode === "disabled"
                  ? "bg-slate-200/80 border-slate-400 ring-2 ring-slate-400/20"
                  : "bg-slate-50/60 border-slate-200 hover:bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2.5 font-bold text-sm text-slate-700">
                <X className="w-4 h-4 text-slate-500" />
                Disabled
              </div>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Do not forward incoming calls (disconnects after polite automated greeting).
              </p>
            </button>
          </div>

          {/* Mode Form Content */}
          {inboundForwardMode === "global" && (
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 animate-fadeIn">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <PhoneForwarded className="w-4 h-4 text-indigo-600" /> Master Inbound Forwarding Target (E.164)
              </label>
              <input
                type="text"
                value={inboundForwardGlobalNumber}
                onChange={(e) => setInboundForwardGlobalNumber(e.target.value)}
                placeholder="e.g. +15559876543 (Your mobile or office phone)"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono shadow-xs"
              />
              <p className="text-xs text-slate-500 leading-relaxed">
                When anyone dials any of your Twilio numbers, our platform immediately forwards and rings this number with live audio bridge.
              </p>
            </div>
          )}

          {inboundForwardMode === "per_number" && (
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 animate-fadeIn">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" /> Twilio Line &rarr; Forward Destination Mapping
              </div>

              {phoneNumbers.length === 0 ? (
                <div className="text-xs text-slate-400">Please add or fetch Twilio phone numbers above first.</div>
              ) : (
                <div className="space-y-3">
                  {phoneNumbers.map((twNum) => (
                    <div
                      key={twNum}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs"
                    >
                      <div className="font-mono text-xs font-bold text-indigo-950 sm:w-48 shrink-0 flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        {twNum}
                      </div>
                      <div className="text-slate-400 font-bold text-xs hidden sm:block">&rarr;</div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={inboundForwardMapping[twNum] || ""}
                          onChange={(e) => handlePerNumberForwardChange(twNum, e.target.value)}
                          placeholder={`Forward calls on ${twNum} to e.g. +15559876543`}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200/60 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Fallback Destination (Optional)
                </label>
                <input
                  type="text"
                  value={inboundForwardGlobalNumber}
                  onChange={(e) => setInboundForwardGlobalNumber(e.target.value)}
                  placeholder="Fallback number if any specific mapping is left empty"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* Sticky Action Footer Bar */}
        <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/90 backdrop-blur-md p-4 sm:p-5 rounded-3xl border border-slate-800 shadow-2xl text-white">
          <div className="flex items-center gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Settings are securely encrypted at rest in Azure Cosmos DB NoSQL.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {config && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-5 py-3 rounded-2xl border border-slate-700 transition-all disabled:opacity-50"
              >
                {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                {testing ? "Testing..." : "Test Connection"}
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-7 py-3 rounded-2xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving Configuration..." : config ? "Update Configuration" : "Save Configuration"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
