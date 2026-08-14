import React, { useState, useEffect, useRef } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig, CallRecord } from "../types";
import { PhoneCall, PhoneOutgoing, PhoneOff, Mic, MicOff, Clock, CheckCircle2, AlertCircle, ShieldAlert, ArrowUpRight, MessageSquare, Timer, Radio, Delete, Volume2 } from "lucide-react";

declare global {
  interface Window {
    Twilio?: any;
  }
}

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
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // WebRTC Device & Live Call states
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceStatusText, setDeviceStatusText] = useState("Initializing WebRTC Voice Device...");
  const [callState, setCallState] = useState<"idle" | "dialing" | "ringing" | "connected">("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const deviceRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    loadData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (activeCallRef.current) {
        try { activeCallRef.current.disconnect(); } catch (e) {}
      }
      if (deviceRef.current) {
        try { deviceRef.current.destroy(); } catch (e) {}
      }
    };
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

      // Attempt to initialize Twilio WebRTC Device if credentials present
      if (twCfg && twCfg.account_sid) {
        initializeWebRTCDevice();
      } else {
        setDeviceStatusText("Twilio not configured. Please add settings.");
      }
    } catch (err: any) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoadingConfig(false);
    }
  }

  async function initializeWebRTCDevice() {
    try {
      setDeviceStatusText("Requesting Voice Access Token...");
      const tokenRes = await fetchApi<{ token: string; identity: string; from_number: string }>("/calls/token");
      
      if (!tokenRes || !tokenRes.token) {
        setDeviceStatusText("Could not get voice token. Check WebRTC keys in settings.");
        return;
      }

      if (!window.Twilio || !window.Twilio.Device) {
        setDeviceStatusText("Twilio Voice SDK loading...");
        setTimeout(initializeWebRTCDevice, 1000);
        return;
      }

      if (deviceRef.current) {
        deviceRef.current.destroy();
      }

      const device = new window.Twilio.Device(tokenRes.token, {
        codecPreferences: ["opus", "pcmu"],
        enableRingingState: true,
      });

      device.on("registered", () => {
        setDeviceReady(true);
        setDeviceStatusText("Ready for in-browser calling");
      });

      device.on("error", (error: any) => {
        console.error("Twilio Device error:", error);
        setDeviceStatusText(`Device Error: ${error.message || error}`);
        setDeviceReady(false);
      });

      device.on("tokenWillExpire", async () => {
        try {
          const refreshed = await fetchApi<{ token: string }>("/calls/token");
          device.updateToken(refreshed.token);
        } catch (e) {}
      });

      await device.register();
      deviceRef.current = device;
    } catch (err: any) {
      console.warn("WebRTC voice init warning:", err);
      setDeviceStatusText(err.message || "WebRTC Keys required in Twilio Settings");
      setDeviceReady(false);
    }
  }

  // Handle in-browser WebRTC call
  async function handleBrowserCall() {
    if (!toNumber.trim()) {
      setMessage({ text: "Please enter a phone number to call.", type: "error" });
      return;
    }

    if (!deviceRef.current || !deviceReady) {
      // Fallback to server outbound trigger if WebRTC device isn't registered
      return handleServerOutboundCall();
    }

    try {
      setMessage(null);
      setCallState("dialing");
      setDeviceStatusText(`Dialing ${toNumber}...`);

      const call = await deviceRef.current.connect({
        params: {
          To: toNumber.trim(),
          to: toNumber.trim(),
          phoneNumber: toNumber.trim(),
          callerId: selectedFromNumber || config?.phone_number?.split(",")[0]?.trim() || "",
        },
      });

      activeCallRef.current = call;

      call.on("ringing", () => {
        setCallState("ringing");
        setDeviceStatusText(`Ringing ${toNumber}...`);
      });

      call.on("accept", () => {
        setCallState("connected");
        setDeviceStatusText("Call in Progress (WebRTC Audio Live)");
        startTimer();
      });

      call.on("disconnect", () => {
        endCallCleanup();
        setDeviceStatusText("Call Ended");
        setTimeout(() => setDeviceStatusText("Ready for in-browser calling"), 3000);
      });

      call.on("cancel", () => {
        endCallCleanup();
        setDeviceStatusText("Call Canceled");
      });

      call.on("reject", () => {
        endCallCleanup();
        setDeviceStatusText("Call Rejected / Busy");
      });

      call.on("error", (err: any) => {
        endCallCleanup();
        setMessage({ text: `Call Error: ${err.message}`, type: "error" });
      });
    } catch (err: any) {
      endCallCleanup();
      setMessage({ text: `Failed to initiate call: ${err.message}`, type: "error" });
    }
  }

  // Fallback to Server Outbound Call
  async function handleServerOutboundCall() {
    try {
      setCallState("dialing");
      setMessage(null);
      const call = await fetchApi<CallRecord>("/calls", {
        method: "POST",
        body: JSON.stringify({
          to: toNumber,
          from_number: selectedFromNumber,
          prompt: prompt,
        }),
      });
      setMessage({ text: `Server outbound call placed! Call SID: ${call.call_sid}`, type: "success" });
      setCallState("idle");
      const updatedCalls = await fetchApi<CallRecord[]>("/calls");
      setCalls(updatedCalls);
    } catch (err: any) {
      setCallState("idle");
      setMessage({ text: err.message, type: "error" });
    }
  }

  function handleHangup() {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    } else if (deviceRef.current) {
      deviceRef.current.disconnectAll();
    }
    endCallCleanup();
  }

  function handleToggleMute() {
    if (!activeCallRef.current) return;
    const nextMute = !isMuted;
    activeCallRef.current.mute(nextMute);
    setIsMuted(nextMute);
  }

  function handleKeypadDigit(digit: string) {
    setToNumber((prev) => prev + digit);
    if (activeCallRef.current) {
      try {
        activeCallRef.current.sendDigits(digit);
      } catch (e) {}
    }
  }

  function startTimer() {
    setCallDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }

  function endCallCleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallState("idle");
    setIsMuted(false);
    activeCallRef.current = null;
    fetchApi<CallRecord[]>("/calls").then(setCalls).catch(() => {});
  }

  const availableFromNumbers = (config?.phone_number || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  const keypadDigits = [
    { digit: "1", sub: "" },
    { digit: "2", sub: "ABC" },
    { digit: "3", sub: "DEF" },
    { digit: "4", sub: "GHI" },
    { digit: "5", sub: "JKL" },
    { digit: "6", sub: "MNO" },
    { digit: "7", sub: "PQRS" },
    { digit: "8", sub: "TUV" },
    { digit: "9", sub: "WXYZ" },
    { digit: "*", sub: "" },
    { digit: "0", sub: "+" },
    { digit: "#", sub: "" },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Calling Console</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Direct in-browser WebRTC calling, DTMF keypad, talking duration, and call logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Device WebRTC Status Badge */}
          <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
            deviceReady
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            <span className={`w-2 h-2 rounded-full ${deviceReady ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
            <Radio className="w-3.5 h-3.5" />
            <span className="max-w-[200px] truncate">{deviceStatusText}</span>
          </div>

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
        {/* Interactive In-Browser Dialer Card */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-indigo-600" />
                Live Phone Dialer
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Direct WebRTC In-Browser Calling with Live Audio
              </p>
            </div>

            {callState === "connected" && (
              <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-mono font-bold border border-emerald-200 animate-pulse">
                <Timer className="w-3.5 h-3.5 text-emerald-600" />
                {Math.floor(callDuration / 60).toString().padStart(2, "0")}:{(callDuration % 60).toString().padStart(2, "0")}
              </div>
            )}
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
                You must set up your Twilio Account SID, Auth Token, TwiML App, and API Keys before placing calls.
              </p>
              <button
                onClick={onNavigateSettings}
                className="inline-flex items-center gap-1.5 mt-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs px-3.5 py-2 rounded-xl transition-colors shadow-xs"
              >
                Go to Twilio Settings <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
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
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Caller ID (From Number)</span>
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
                    disabled={callState !== "idle"}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs font-mono bg-white shadow-xs"
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-500 bg-slate-100 font-mono text-xs cursor-not-allowed"
                  />
                )}
              </div>

              {/* Number Screen & Backspace */}
              <div className="relative">
                <input
                  type="tel"
                  value={toNumber}
                  onChange={(e) => setToNumber(e.target.value)}
                  placeholder="Enter phone number (e.g. +1...)"
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-base font-mono text-center tracking-wider bg-slate-50/50 font-bold"
                />
                {toNumber.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setToNumber((prev) => prev.slice(0, -1))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                    title="Backspace"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 3x4 Touch Keypad */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {keypadDigits.map(({ digit, sub }) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleKeypadDigit(digit)}
                    className="flex flex-col items-center justify-center py-2.5 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 border border-slate-200 rounded-xl transition-all active:scale-95 group"
                  >
                    <span className="text-base font-bold text-slate-800 group-hover:text-indigo-600 font-mono leading-none">
                      {digit}
                    </span>
                    <span className="text-[9px] text-slate-400 group-hover:text-indigo-500 uppercase font-semibold mt-0.5 tracking-widest min-h-[12px]">
                      {sub}
                    </span>
                  </button>
                ))}
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-3 pt-2">
                {callState === "connected" && (
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className={`p-3 rounded-xl border transition-all ${
                      isMuted
                        ? "bg-rose-50 text-rose-600 border-rose-200"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200"
                    }`}
                    title={isMuted ? "Unmute Mic" : "Mute Mic"}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                )}

                {callState === "idle" ? (
                  <button
                    type="button"
                    onClick={handleBrowserCall}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-md shadow-emerald-600/20 active:scale-[0.99]"
                  >
                    <PhoneOutgoing className="w-4 h-4" />
                    Call Destination
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleHangup}
                    className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-md shadow-rose-600/20 active:scale-[0.99]"
                  >
                    <PhoneOff className="w-4 h-4" />
                    End Call
                  </button>
                )}
              </div>
            </div>
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
              No calls recorded yet. Place a call using the live dialer on the left.
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
