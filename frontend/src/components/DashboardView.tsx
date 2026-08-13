import React, { useState, useEffect } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig, CallRecord } from "../types";
import { PhoneCall, PhoneOutgoing, Clock, CheckCircle2, AlertCircle, ShieldAlert, ArrowUpRight, MessageSquare, Timer } from "lucide-react";

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function DashboardView({ onNavigateSettings }: { onNavigateSettings: () => void }) {
  const [config, setConfig] = useState<TwilioConfig | null>(null);
  const [selectedFromNumber, setSelectedFromNumber] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [prompt, setPrompt] = useState("");
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
      if (twCfg?.phone_number) {
        const numbers = twCfg.phone_number.split(",").map((n) => n.trim()).filter(Boolean);
        if (numbers.length > 0) {
          setSelectedFromNumber(numbers[0]);
        }
      }

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
        body: JSON.stringify({
          to: toNumber,
          from_number: selectedFromNumber,
          prompt: prompt,
        }),
      });
      setMessage({ text: `Call placed from ${selectedFromNumber || config.phone_number}! Call SID: ${call.call_sid}`, type: "success" });
      setToNumber("");
      
      const updatedCalls = await fetchApi<CallRecord[]>("/calls");
      setCalls(updatedCalls);
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setCalling(false);
    }
  }

  const availableFromNumbers = (config?.phone_number || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Calling Console</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Select caller number, set custom conversation prompt, and monitor call history & talking duration.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white border border-slate-200/80 shadow-xs px-4 py-2 rounded-xl flex items-center gap-3">
            <PhoneOutgoing className="w-4 h-4 text-indigo-600" />
            <div className="text-xs">
              <span className="text-slate-400 font-semibold block uppercase text-[10px]">Total Calls</span>
              <span className="font-bold text-slate-900 font-mono">{calls.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Make Call Card */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-indigo-600" />
              Make a Call
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select caller ID, set custom speech prompt, and enter recipient number.
            </p>
          </div>

          {loadingConfig ? (
            <div className="py-8 text-center text-sm text-slate-400">Loading Twilio configuration...</div>
          ) : !config ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                Twilio Account Required
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                You must set up your Twilio Account SID, Auth Token, and phone numbers before placing calls.
              </p>
              <button
                onClick={onNavigateSettings}
                className="inline-flex items-center gap-1.5 mt-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs px-3.5 py-2 rounded-xl transition-colors shadow-xs"
              >
                Go to Twilio Settings <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleMakeCall} className="space-y-4">
              {message && (
                <div
                  className={`p-3 rounded-xl text-xs border flex items-start gap-2 ${
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

              {/* From Number Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>From (Caller Number)</span>
                  {availableFromNumbers.length > 1 && (
                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-md">
                      {availableFromNumbers.length} Numbers Available
                    </span>
                  )}
                </label>

                {availableFromNumbers.length > 1 ? (
                  <select
                    value={selectedFromNumber}
                    onChange={(e) => setSelectedFromNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono bg-white shadow-xs"
                  >
                    {availableFromNumbers.map((num) => (
                      <option key={num} value={num}>
                        {num}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={availableFromNumbers[0] || config.phone_number}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-500 bg-slate-100 font-mono text-sm cursor-not-allowed"
                  />
                )}
              </div>

              {/* To Number */}
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
                />
              </div>

              {/* Custom Speech Prompt */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Custom Conversation / Speech Prompt</span>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Hello, this is Desire AI calling to confirm your appointment today. Please press 1 or reply to confirm."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs leading-relaxed"
                />
                <p className="text-[11px] text-slate-400 mt-1">Leave blank to use default greeting message.</p>
              </div>

              <button
                type="submit"
                disabled={calling}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-5 py-3 rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                <PhoneOutgoing className="w-4 h-4" />
                {calling ? "Dialing..." : "Make Call"}
              </button>
            </form>
          )}
        </div>

        {/* Call Logs Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                Recent Calls & History
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitor call timestamps, talking time duration, and status.
              </p>
            </div>
            <button
              onClick={loadData}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors"
            >
              Sync History
            </button>
          </div>

          {calls.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
              No calls recorded yet. Place a call using the form on the left.
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[520px] overflow-y-auto pr-1">
              {calls.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-900 font-mono flex items-center gap-2">
                        <span>To: {c.to_number}</span>
                        <span className="text-xs font-normal text-slate-500 font-mono">from {c.from_number}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">SID: {c.call_sid || "N/A"}</div>
                    </div>

                    <div className="flex items-center gap-2 text-right">
                      {/* Talking Time Duration Badge */}
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100 font-mono">
                        <Timer className="w-3 h-3 text-indigo-500" />
                        {formatDuration(c.duration)}
                      </span>

                      {/* Status Badge */}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize border ${
                        c.status === "completed"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : c.status === "failed" || c.status === "busy"
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : "bg-amber-100 text-amber-800 border-amber-200"
                      }`}>
                        {c.status}
                      </span>
                    </div>
                  </div>

                  {/* Speech Prompt Note */}
                  {c.prompt && (
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 text-xs text-slate-600 flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                      <span className="italic">"{c.prompt}"</span>
                    </div>
                  )}

                  {/* Calling Time Stamp */}
                  <div className="text-[11px] text-slate-400 border-t border-slate-200/40 pt-2 flex items-center justify-between">
                    <span>Calling Time: {new Date(c.created_at).toLocaleString()}</span>
                    <span>Talking Time: {formatDuration(c.duration)}</span>
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
