import React, { useState, useEffect, useRef } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig, CallRecord } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  PhoneCall,
  PhoneOutgoing,
  PhoneOff,
  Mic,
  MicOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ArrowUpRight,
  MessageSquare,
  Timer,
  Radio,
  Delete,
  Activity,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { EmptyState } from "./ui/EmptyState";

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
  const { user } = useAuth();
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
        try {
          activeCallRef.current.disconnect();
        } catch (e) {}
      }
      if (deviceRef.current) {
        try {
          deviceRef.current.destroy();
        } catch (e) {}
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
          userId: user?.id || "default",
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

  function sanitizePhoneNumber(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    const hasLeadingPlus = trimmed.startsWith("+");
    const digitsOnly = trimmed.replace(/\D/g, "");
    return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
  }

  function handleKeypadDigit(digit: string) {
    if (digit === "+") {
      setToNumber((prev) => {
        if (prev.startsWith("+")) return prev;
        return `+${prev.replace(/\D/g, "")}`;
      });
      return;
    }

    if (/^[0-9]$/.test(digit)) {
      setToNumber((prev) => {
        const sanitized = prev.replace(/[^0-9+]/g, "");
        return sanitized + digit;
      });

      if (activeCallRef.current) {
        try {
          activeCallRef.current.sendDigits(digit);
        } catch (e) {}
      }
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
    { digit: "+", sub: "INTL" },
    { digit: "0", sub: "+" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <PageHeader
        title="Calling Console"
        description="Direct in-browser WebRTC calling, DTMF keypad, talking duration, and real-time call logs."
        badge={
          <div className="flex items-center gap-2">
            <Badge variant={deviceReady ? "success" : "neutral"} size="md" dot={deviceReady}>
              {deviceStatusText}
            </Badge>
          </div>
        }
        actions={
          <div className="flex items-center gap-3">
            <div className="theme-surface border theme-border px-3.5 py-1.5 rounded-xl flex items-center gap-2.5 shadow-2xs">
              <PhoneOutgoing className="w-4 h-4 theme-primary-text" />
              <div className="text-xs">
                <span className="theme-muted font-bold block uppercase text-[10px]">Total Calls</span>
                <span className="font-bold font-mono text-slate-900 dark:text-slate-100">{calls.length}</span>
              </div>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Interactive Dialer Card */}
        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 theme-primary-text" />
                <CardTitle className="text-sm">Live Phone Dialer</CardTitle>
              </div>
              <CardDescription>Direct WebRTC in-browser calling with Opus audio</CardDescription>
            </div>

            {callState === "connected" && (
              <Badge variant="success" size="md" dot>
                <Timer className="w-3 h-3 mr-1" />
                {Math.floor(callDuration / 60).toString().padStart(2, "0")}:
                {(callDuration % 60).toString().padStart(2, "0")}
              </Badge>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {loadingConfig ? (
              <div className="py-8 text-center text-xs theme-muted">Loading Twilio configuration...</div>
            ) : !config ? (
              <Alert type="warning">
                <div className="space-y-2">
                  <div className="font-bold">Twilio Account Configuration Required</div>
                  <p>
                    Set up your Twilio Account SID, Auth Token, TwiML App, and API Keys before placing live calls.
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={onNavigateSettings}
                    rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                  >
                    Go to Twilio Settings
                  </Button>
                </div>
              </Alert>
            ) : (
              <div className="space-y-4">
                {message && (
                  <Alert
                    type={message.type === "success" ? "success" : "danger"}
                    onDismiss={() => setMessage(null)}
                  >
                    {message.text}
                  </Alert>
                )}

                {/* From Number Selector */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-heading mb-1.5 flex items-center justify-between">
                    <span>Caller ID (From Number)</span>
                    {availableFromNumbers.length > 1 && (
                      <Badge variant="primary" size="sm">
                        {availableFromNumbers.length} Available
                      </Badge>
                    )}
                  </label>

                  {availableFromNumbers.length > 1 ? (
                    <select
                      value={selectedFromNumber}
                      onChange={(e) => setSelectedFromNumber(e.target.value)}
                      disabled={callState !== "idle"}
                      className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-heading font-semibold focus:outline-none shadow-2xs"
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
                      className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed font-semibold"
                    />
                  )}
                </div>

                {/* Number Screen & Backspace */}
                <div className="relative bg-slate-50/80 p-2 rounded-2xl border border-slate-200">
                  <input
                    type="tel"
                    value={toNumber}
                    onChange={(e) => setToNumber(sanitizePhoneNumber(e.target.value))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData("text");
                      setToNumber(sanitizePhoneNumber(pasted));
                    }}
                    placeholder="Enter phone number (e.g. +1...)"
                    className="w-full pl-4 pr-12 py-3 rounded-xl border-none text-xl font-mono text-center tracking-wider bg-transparent text-heading font-extrabold focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                  />
                  {toNumber.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setToNumber((prev) => prev.slice(0, -1))}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer transition-all active:scale-90"
                      title="Backspace"
                    >
                      <Delete className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Modern Smartphone Round Keypad Grid (1-9, +, 0, Del) */}
                <div className="max-w-[340px] mx-auto py-2">
                  <div className="grid grid-cols-3 gap-3.5">
                    {/* Rows 1-3: Digits 1 to 9 */}
                    {[
                      { digit: "1", sub: "" },
                      { digit: "2", sub: "ABC" },
                      { digit: "3", sub: "DEF" },
                      { digit: "4", sub: "GHI" },
                      { digit: "5", sub: "JKL" },
                      { digit: "6", sub: "MNO" },
                      { digit: "7", sub: "PQRS" },
                      { digit: "8", sub: "TUV" },
                      { digit: "9", sub: "WXYZ" },
                    ].map(({ digit, sub }) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => handleKeypadDigit(digit)}
                        className="w-full aspect-square max-w-[80px] mx-auto rounded-full bg-white hover:bg-[var(--color-primary-light)] border-2 border-slate-100 hover:border-[var(--color-primary)] flex flex-col items-center justify-center transition-all duration-150 active:scale-90 group cursor-pointer shadow-xs hover:shadow-md"
                      >
                        <span className="text-2xl font-black text-heading group-hover:theme-primary-text font-mono leading-none">
                          {digit}
                        </span>
                        {sub ? (
                          <span className="text-[9px] text-sub group-hover:theme-primary-text uppercase font-bold tracking-widest mt-0.5">
                            {sub}
                          </span>
                        ) : (
                          <span className="h-[13px]" />
                        )}
                      </button>
                    ))}

                    {/* Bottom Row: + Button, 0 Button, and Quick Clear/Backspace */}
                    {/* 1. Plus (+) Button */}
                    <button
                      type="button"
                      onClick={() => handleKeypadDigit("+")}
                      className="w-full aspect-square max-w-[80px] mx-auto rounded-full bg-white hover:bg-[var(--color-primary-light)] border-2 border-slate-100 hover:border-[var(--color-primary)] flex flex-col items-center justify-center transition-all duration-150 active:scale-90 group cursor-pointer shadow-xs hover:shadow-md"
                      title="Add Plus (+)"
                    >
                      <span className="text-2xl font-black text-heading group-hover:theme-primary-text font-mono leading-none">
                        +
                      </span>
                      <span className="text-[9px] text-sub group-hover:theme-primary-text uppercase font-bold tracking-widest mt-0.5">
                        INTL
                      </span>
                    </button>

                    {/* 2. Zero (0) Button */}
                    <button
                      type="button"
                      onClick={() => handleKeypadDigit("0")}
                      className="w-full aspect-square max-w-[80px] mx-auto rounded-full bg-white hover:bg-[var(--color-primary-light)] border-2 border-slate-100 hover:border-[var(--color-primary)] flex flex-col items-center justify-center transition-all duration-150 active:scale-90 group cursor-pointer shadow-xs hover:shadow-md"
                    >
                      <span className="text-2xl font-black text-heading group-hover:theme-primary-text font-mono leading-none">
                        0
                      </span>
                      <span className="text-[9px] text-sub group-hover:theme-primary-text uppercase font-bold tracking-widest mt-0.5">
                        +
                      </span>
                    </button>

                    {/* 3. Clear / Backspace Button */}
                    <button
                      type="button"
                      onClick={() => setToNumber((prev) => prev.slice(0, -1))}
                      disabled={toNumber.length === 0}
                      className="w-full aspect-square max-w-[80px] mx-auto rounded-full bg-slate-50 hover:bg-rose-50 border-2 border-slate-100 hover:border-rose-300 disabled:opacity-40 disabled:hover:bg-slate-50 disabled:hover:border-slate-100 flex flex-col items-center justify-center transition-all duration-150 active:scale-90 text-slate-400 hover:text-rose-600 cursor-pointer shadow-xs"
                      title="Backspace"
                    >
                      <Delete className="w-5 h-5" />
                      <span className="text-[9px] uppercase font-bold tracking-widest mt-0.5">
                        DEL
                      </span>
                    </button>
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex items-center gap-3 pt-2">
                  {callState === "connected" && (
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                        isMuted
                          ? "bg-rose-50 text-rose-600 border-rose-200 shadow-xs"
                          : "bg-white text-heading border border-slate-200 shadow-xs hover:bg-slate-50"
                      }`}
                      title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                      {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  )}

                  {callState === "idle" ? (
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleBrowserCall}
                      leftIcon={<PhoneOutgoing className="w-5 h-5" />}
                      className="flex-1 py-4 text-base font-extrabold rounded-2xl shadow-md hover:shadow-lg"
                    >
                      Call Destination
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      size="lg"
                      onClick={handleHangup}
                      leftIcon={<PhoneOff className="w-5 h-5" />}
                      className="flex-1 py-4 text-base font-extrabold rounded-2xl shadow-md"
                    >
                      End Call
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Call Logs & History */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 theme-primary-text" />
                <CardTitle className="text-sm">Recent Calls & History</CardTitle>
              </div>
              <CardDescription>Real-time timestamps, talking time duration, and status.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              leftIcon={<RefreshCw className="w-3 h-3" />}
            >
              Sync History
            </Button>
          </CardHeader>

          <CardContent className="p-4">
            {calls.length === 0 ? (
              <EmptyState
                icon={<PhoneCall className="w-6 h-6" />}
                title="No calls recorded yet"
                description="Place an in-browser call using the live dialer to generate call session telemetry."
              />
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {calls.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 rounded-xl bg-white border border-slate-200 hover:shadow-xs transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-bold font-mono flex items-center gap-2 text-heading">
                          <span>To: {c.to_number}</span>
                          <span className="text-xs font-normal text-sub font-mono">
                            from {c.from_number}
                          </span>
                        </div>
                        <div className="text-[11px] text-sub font-mono mt-0.5">
                          SID: {c.call_sid || "N/A"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-right">
                        <Badge variant="primary" size="sm">
                          <Timer className="w-3 h-3 mr-1" />
                          {formatDuration(c.duration)}
                        </Badge>
                        <Badge
                          variant={
                            c.status === "completed"
                              ? "success"
                              : c.status === "failed" || c.status === "busy"
                              ? "danger"
                              : "warning"
                          }
                          size="sm"
                        >
                          {c.status}
                        </Badge>
                      </div>
                    </div>

                    {c.prompt && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 theme-primary-text shrink-0 mt-0.5" />
                        <span className="italic text-heading">"{c.prompt}"</span>
                      </div>
                    )}

                    <div className="text-[11px] text-sub border-t border-slate-100 pt-2 flex items-center justify-between">
                      <span>Started: {new Date(c.created_at).toLocaleString()}</span>
                      <span>Duration: {formatDuration(c.duration)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
