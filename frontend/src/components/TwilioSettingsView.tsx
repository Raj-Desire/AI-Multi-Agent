import React, { useState, useEffect } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig } from "../types";
import { Key, Lock, Phone, ShieldCheck, AlertCircle, CheckCircle2, Save, RefreshCw, Plus, Edit2, Trash2, Check, X, Globe, Radio, Sparkles } from "lucide-react";

export function TwilioSettingsView() {
  const [config, setConfig] = useState<TwilioConfig | null>(null);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [twimlAppSid, setTwimlAppSid] = useState("");
  const [apiKeySid, setApiKeySid] = useState("");
  const [apiKeySecret, setApiKeySecret] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  
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
        setMessage({ text: "No purchased phone numbers found on this Twilio account. Please purchase a number on Twilio Console.", type: "error" });
        return;
      }

      // Merge unique numbers with existing list
      const combined = Array.from(new Set([...phoneNumbers, ...fetched]));
      setPhoneNumbers(combined);
      setMessage({ text: `Successfully retrieved ${fetched.length} purchased Twilio number(s)! Click Save to persist.`, type: "success" });
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
    const updated = [...phoneNumbers];
    updated[index] = trimmed;
    setPhoneNumbers(updated);
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
    const updated = phoneNumbers.filter((_, i) => i !== index);
    setPhoneNumbers(updated);
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
        }),
      });
      setConfig(updated);
      setAuthToken(updated.auth_token_masked);
      if (updated.api_key_secret_masked) {
        setApiKeySecret(updated.api_key_secret_masked);
      }
      setMessage({ text: "Twilio configuration & WebRTC settings saved successfully! TwiML Voice URL synced.", type: "success" });
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
      <div className="flex items-center justify-center py-20 text-slate-500 space-x-3 font-sans">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Loading Twilio credentials...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Twilio Configuration</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage your Twilio Programmable Voice account, WebRTC in-browser dialer keys, and public webhook tunnel.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 space-y-6">
        {/* Status Badge */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${config?.status === "CONNECTED" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-500"}`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</div>
              <div className="text-sm font-bold text-slate-800 flex items-center gap-2 mt-0.5">
                <span className={`w-2.5 h-2.5 rounded-full ${config?.status === "CONNECTED" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                {config?.status === "CONNECTED" ? "Connected & Active" : "Not Configured"}
              </div>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-4 rounded-xl text-sm border flex items-start gap-3 transition-all ${
              message.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="font-medium flex-1">{message.text}</div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Core Account */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-indigo-600 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> 1. Twilio Core Account
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-600" /> Account SID (starts with AC)
                </label>
                <input
                  type="text"
                  required
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" /> Auth Token
                </label>
                <input
                  type="password"
                  required
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="********************************"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: In-Browser WebRTC Voice Calling */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                <Radio className="w-4 h-4" /> 2. WebRTC Live Calling Keys (Browser Calling)
              </h2>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md font-semibold">
                Required for In-Browser Web Dialer
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-600" /> TwiML App SID (starts with AP)
              </label>
              <input
                type="text"
                value={twimlAppSid}
                onChange={(e) => setTwimlAppSid(e.target.value)}
                placeholder="APXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">Found in Twilio Console &gt; Voice &gt; Manage &gt; TwiML apps.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-600" /> API Key SID (starts with SK)
                </label>
                <input
                  type="text"
                  value={apiKeySid}
                  onChange={(e) => setApiKeySid(e.target.value)}
                  placeholder="SKXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" /> API Key Secret
                </label>
                <input
                  type="password"
                  value={apiKeySecret}
                  onChange={(e) => setApiKeySecret(e.target.value)}
                  placeholder="********************************"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" /> Public Webhook Base URL (ngrok / live tunnel / Azure host)
              </label>
              <input
                type="text"
                value={publicBaseUrl}
                onChange={(e) => setPublicBaseUrl(e.target.value)}
                placeholder="https://your-domain.ngrok-free.dev or https://your-subdomain.loca.lt"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Saving will automatically configure your Twilio TwiML App Voice URL to: <code className="bg-slate-100 text-indigo-600 px-1 py-0.5 rounded">{publicBaseUrl ? `${publicBaseUrl.replace(/\/+$/, '')}/api/v1/twilio/voice/twiml` : 'https://<your-url>/api/v1/twilio/voice/twiml'}</code>
              </p>
            </div>
          </div>

          {/* Section 3: Master Phone Numbers Manager */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600" /> 3. Configured Phone Numbers ({phoneNumbers.length})
              </label>

              {/* Auto-Fetch Numbers from Twilio Button */}
              <button
                type="button"
                onClick={handleAutoFetchNumbers}
                disabled={fetchingNumbers}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs border border-indigo-200 transition-all disabled:opacity-50"
                title="Fetch all numbers purchased on your Twilio account automatically"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fetchingNumbers ? "animate-spin text-indigo-600" : "text-indigo-600"}`} />
                {fetchingNumbers ? "Fetching Numbers..." : "Auto-Fetch From Twilio"}
              </button>
            </div>

            {/* Add Number Control Bar */}
            <div className="flex items-center gap-2">
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
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
              />
              <button
                type="button"
                onClick={handleAddNumber}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" /> Add Manual
              </button>
            </div>

            {/* List of Numbers */}
            {phoneNumbers.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs text-center">
                No phone numbers added yet. Enter a number above and click Add.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {phoneNumbers.map((num, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-all"
                  >
                    {editingIndex === index ? (
                      <div className="flex items-center gap-2 flex-1 mr-3">
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-500 text-sm font-mono focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(index)}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                            <Phone className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-mono text-sm font-bold text-slate-900">{num}</span>
                            {index === 0 && (
                              <span className="ml-2 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border border-emerald-200">
                                Primary Caller ID
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(index)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Number"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNumber(index)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Number"
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

          <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : config ? "Update Configuration" : "Save Configuration"}
            </button>

            {config && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm px-6 py-2.5 rounded-xl border border-slate-200 transition-colors disabled:opacity-50"
              >
                {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                {testing ? "Testing Connection..." : "Test Connection"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
