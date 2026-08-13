import React, { useState, useEffect } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig } from "../types";
import { Key, Lock, Phone, ShieldCheck, AlertCircle, CheckCircle2, Save, RefreshCw } from "lucide-react";

export function TwilioSettingsView() {
  const [config, setConfig] = useState<TwilioConfig | null>(null);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
        setAccountSid(data.account_sid);
        setPhoneNumber(data.phone_number);
        setAuthToken(data.auth_token_masked);
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      const updated = await fetchApi<TwilioConfig>("/twilio/configuration", {
        method: "POST",
        body: JSON.stringify({
          account_sid: accountSid,
          auth_token: authToken,
          phone_number: phoneNumber,
        }),
      });
      setConfig(updated);
      setAuthToken(updated.auth_token_masked);
      setMessage({ text: "Twilio configuration saved successfully!", type: "success" });
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
      setMessage({ text: res.message, type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 space-x-3">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
        <span>Loading Twilio credentials...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Twilio Configuration</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage your organization's Twilio Programmable Voice account and phone numbers.
        </p>
      </div>

      <div className="light-card rounded-xl p-8 space-y-6">
        {/* Status Badge */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${config?.status === "CONNECTED" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-500"}`}>
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

          <div className="text-right text-xs text-slate-500">
            Organization ID: <span className="font-mono font-semibold text-slate-700">org_demo_001</span>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-4 rounded-lg text-sm border flex items-start gap-3 ${
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
            <div className="font-medium">{message.text}</div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" /> Account SID
            </label>
            <input
              type="text"
              required
              value={accountSid}
              onChange={(e) => setAccountSid(e.target.value)}
              placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="w-full light-input rounded-lg px-4 py-2.5 text-sm font-mono"
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
              className="w-full light-input rounded-lg px-4 py-2.5 text-sm font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">Credentials are stored encrypted at rest.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" /> Phone Number
            </label>
            <input
              type="text"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+15551234567"
              className="w-full light-input rounded-lg px-4 py-2.5 text-sm font-mono"
            />
          </div>

          <div className="pt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : config ? "Update Configuration" : "Save Configuration"}
            </button>

            {config && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm px-6 py-2.5 rounded-lg border border-slate-300 transition-colors disabled:opacity-50"
              >
                {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                {testing ? "Testing..." : "Test Connection"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
