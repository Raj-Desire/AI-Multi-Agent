import React, { useState, useEffect } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig, CallRecord } from "../types";
import { PhoneCall, PhoneOutgoing, Clock, CheckCircle2, AlertCircle, ShieldAlert, ArrowUpRight } from "lucide-react";

export function DashboardView({ onNavigateSettings }: { onNavigateSettings: () => void }) {
  const [config, setConfig] = useState<TwilioConfig | null>(null);
  const [toNumber, setToNumber] = useState("");
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [calling, setCalling] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoadingConfig(true);
      const twCfg = await fetchApi<TwilioConfig | null>("/twilio/configuration");
      setConfig(twCfg);

      const callList = await fetchApi<CallRecord[]>("/calls");
      setCalls(callList);
    } catch (err: any) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoadingConfig(false);
    }
  }

  async function handleMakeCall(e: React.FormEvent) {
    e.preventDefault();
    if (!config) {
      setMessage({ text: "Please configure your Twilio account first.", type: "error" });
      return;
    }

    try {
      setCalling(true);
      setMessage(null);
      const call = await fetchApi<CallRecord>("/calls", {
        method: "POST",
        body: JSON.stringify({ to: toNumber }),
      });
      setMessage({ text: `Call placed! Call SID: ${call.call_sid}`, type: "success" });
      setToNumber("");
      
      const updatedCalls = await fetchApi<CallRecord[]>("/calls");
      setCalls(updatedCalls);
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Calling Console</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Place calls and view recent call activity for your organization.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="light-card px-4 py-2 rounded-lg flex items-center gap-3">
            <PhoneOutgoing className="w-4 h-4 text-blue-600" />
            <div className="text-xs">
              <span className="text-slate-400 font-semibold block uppercase text-[10px]">Total Calls</span>
              <span className="font-bold text-slate-900 font-mono">{calls.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Make Call Card */}
        <div className="lg:col-span-5 light-card rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-blue-600" />
              Make a Call
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter recipient phone number to place a call.
            </p>
          </div>

          {loadingConfig ? (
            <div className="py-8 text-center text-sm text-slate-400">Loading Twilio configuration...</div>
          ) : !config ? (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                Twilio Account Required
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                You must set up your Twilio Account SID and Auth Token before placing calls.
              </p>
              <button
                onClick={onNavigateSettings}
                className="inline-flex items-center gap-1.5 mt-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs px-3.5 py-2 rounded-lg transition-colors"
              >
                Go to Twilio Settings <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleMakeCall} className="space-y-4">
              {message && (
                <div
                  className={`p-3 rounded-lg text-xs border flex items-start gap-2 ${
                    message.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}
                >
                  {message.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>{message.text}</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  From (Assigned Twilio Number)
                </label>
                <input
                  type="text"
                  disabled
                  value={config.phone_number}
                  className="w-full light-input rounded-lg px-3.5 py-2 text-sm text-slate-500 bg-slate-100 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  To (Destination Phone Number)
                </label>
                <input
                  type="text"
                  required
                  value={toNumber}
                  onChange={(e) => setToNumber(e.target.value)}
                  placeholder="+15551234567"
                  className="w-full light-input rounded-lg px-3.5 py-2 text-sm font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">E.164 international format (e.g. +14155552671).</p>
              </div>

              <button
                type="submit"
                disabled={calling}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                <PhoneOutgoing className="w-4 h-4" />
                {calling ? "Dialing..." : "Make Call"}
              </button>
            </form>
          )}
        </div>

        {/* Call Logs Table */}
        <div className="lg:col-span-7 light-card rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Recent Calls
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Call activity history for this organization.
            </p>
          </div>

          {calls.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
              No calls recorded yet. Place a call using the form on the left.
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {calls.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-slate-800 font-mono">{c.to_number}</div>
                    <div className="text-xs text-slate-500 font-mono">SID: {c.call_sid || "N/A"}</div>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold capitalize border border-emerald-200">
                      {c.status}
                    </span>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {new Date(c.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
