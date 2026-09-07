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
  ArrowUpRight,
  MessageSquare,
  Timer,
  Delete,
  RefreshCw,
  Sliders,
  FileText,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { EmptyState } from "./ui/EmptyState";
import { StatusIndicator } from "./ui/StatusIndicator";
import { DataTable, Column } from "./ui/DataTable";
import { Drawer } from "./ui/Drawer";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";

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

  // Drawers
  const [dialpadOpen, setDialpadOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

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
      const [twCfg, callList] = await Promise.all([
        fetchApi<TwilioConfig | null>("/twilio/configuration").catch(() => null),
        fetchApi<CallRecord[]>("/calls?type=simple").catch(() => []),
      ]);

      setConfig(twCfg);
      setCalls(callList);

      if (twCfg?.phone_number) {
        const numbers = twCfg.phone_number.split(",").map((n) => n.trim()).filter(Boolean);
        if (numbers.length > 0) {
          setSelectedFromNumber(numbers[0]);
        }
      }

      if (twCfg && twCfg.account_sid) {
        initializeWebRTCDevice();
      } else {
        setDeviceStatusText("Twilio credentials not configured");
      }
    } catch (err: any) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoadingConfig(false);
    }
  }

  async function initializeWebRTCDevice() {
    try {
      setDeviceStatusText("Requesting Voice Token...");
      const tokenRes = await fetchApi<{ token: string; identity: string; from_number: string }>("/calls/token");

      if (!tokenRes || !tokenRes.token) {
        setDeviceStatusText("No voice token returned. Check WebRTC keys.");
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
        setDeviceStatusText("Ready for WebRTC calling");
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
      setDeviceStatusText(err.message || "WebRTC Keys required in Settings");
      setDeviceReady(false);
    }
  }

  // Handle in-browser WebRTC call
  async function handleBrowserCall() {
    if (!toNumber.trim()) {
      setMessage({ text: "Please enter a destination phone number.", type: "error" });
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
        fetchApi<CallRecord[]>("/calls").then(setCalls).catch(() => {});
      });

      call.on("accept", () => {
        setCallState("connected");
        setDeviceStatusText("Call in Progress (WebRTC Live)");
        startTimer();
        fetchApi<CallRecord[]>("/calls").then(setCalls).catch(() => {});
      });

      call.on("disconnect", () => {
        endCallCleanup();
        setDeviceStatusText("Call Ended");
        setTimeout(() => setDeviceStatusText("Ready for WebRTC calling"), 3000);
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
      setMessage({ text: `Outbound call initiated! SID: ${call.call_sid}`, type: "success" });
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

  const columns: Column<CallRecord>[] = [
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (c) => (
        <StatusIndicator
          status={c.status}
          pulse={c.status === "in-progress" || c.status === "ringing"}
        />
      ),
    },
    {
      key: "to_number",
      header: "Destination",
      sortable: true,
      render: (c) => (
        <span className="font-mono text-xs font-medium text-[var(--color-heading)]">
          {c.to_number}
        </span>
      ),
    },
    {
      key: "from_number",
      header: "Caller ID",
      sortable: true,
      render: (c) => (
        <span className="font-mono text-xs text-[var(--color-muted)]">
          {c.from_number || "—"}
        </span>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      sortable: true,
      render: (c) => (
        <span className="font-mono text-xs text-[var(--color-text)]">
          {formatDuration(c.duration)}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Timestamp",
      sortable: true,
      render: (c) => (
        <span className="text-xs text-[var(--color-muted)]">
          {new Date(c.created_at).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Details",
      className: "text-right",
      render: (c) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedCall(c)}
          leftIcon={<FileText className="w-3.5 h-3.5" />}
          className="h-7 px-2 text-xs"
        >
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Calling Console"
        // description="Direct in-browser WebRTC calling, DTMF signaling, live session telemetry, and call logs."
        badge={
          <StatusIndicator
            status={deviceReady ? "connected" : "idle"}
            label={deviceStatusText}
            pulse={deviceReady}
          />
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Sync
          </Button>
        }
      />

      {/* Global Notice if Twilio not configured */}
      {!loadingConfig && !config && (
        <Alert type="warning">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-semibold">Twilio connection required.</span> Set up your Account SID and active phone numbers in Phone & Voice.
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={onNavigateSettings}
              rightIcon={<ArrowUpRight className="w-3 h-3" />}
            >
              Configure Twilio
            </Button>
          </div>
        </Alert>
      )}

      {message && (
        <Alert
          type={message.type === "success" ? "success" : "danger"}
          onDismiss={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      {/* Live Active Call Banner */}
      {callState !== "idle" && (
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center animate-pulse">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-heading)] capitalize">
                  {callState === "connected" ? "Live Call Connected" : callState}
                </span>
                <span className="font-mono text-xs text-[var(--color-primary)] font-medium">
                  {Math.floor(callDuration / 60).toString().padStart(2, "0")}:
                  {(callDuration % 60).toString().padStart(2, "0")}
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted)] font-mono mt-0.5">
                Destination: {toNumber} &bull; Caller ID: {selectedFromNumber || config?.phone_number}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isMuted ? "danger" : "outline"}
              size="sm"
              onClick={handleToggleMute}
              leftIcon={isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            >
              {isMuted ? "Unmute" : "Mute"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleHangup}
              leftIcon={<PhoneOff className="w-3.5 h-3.5" />}
            >
              End Call
            </Button>
          </div>
        </div>
      )}

      {/* Quick Dial Action Bar (Primary Workflow) */}
      <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          {/* Caller ID / From Number */}
          <div className="sm:col-span-4">
            <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5">
              Caller ID (From Number)
            </label>
            {availableFromNumbers.length > 1 ? (
              <select
                value={selectedFromNumber}
                onChange={(e) => setSelectedFromNumber(e.target.value)}
                disabled={callState !== "idle"}
                className="w-full h-9 text-xs font-mono px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
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
                value={availableFromNumbers[0] || config?.phone_number || "No numbers configured"}
                className="w-full h-9 text-xs font-mono px-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-muted)] cursor-not-allowed"
              />
            )}
          </div>

          {/* Destination Phone Number Input */}
          <div className="sm:col-span-5">
            <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5">
              Destination Phone Number
            </label>
            <div className="relative flex items-center">
              <input
                type="tel"
                value={toNumber}
                onChange={(e) => setToNumber(sanitizePhoneNumber(e.target.value))}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text");
                  setToNumber(sanitizePhoneNumber(pasted));
                }}
                disabled={callState !== "idle"}
                placeholder="+1 (555) 000-0000"
                className="w-full h-9 px-3 text-sm font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] placeholder-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)]"
              />
              {toNumber.length > 0 && callState === "idle" && (
                <button
                  type="button"
                  onClick={() => setToNumber((prev) => prev.slice(0, -1))}
                  className="absolute right-2 p-1 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
                  title="Backspace"
                >
                  <Delete className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Start Call & Keypad Toggle CTA */}
          <div className="sm:col-span-3 flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              type="button"
              onClick={() => setDialpadOpen(true)}
              title="Open DTMF Keypad"
              className="px-2.5"
            >
              Keypad
            </Button>
            {callState === "idle" ? (
              <Button
                variant="primary"
                size="md"
                onClick={handleBrowserCall}
                disabled={!config}
                leftIcon={<PhoneOutgoing className="w-4 h-4" />}
                className="flex-1"
              >
                Start Call
              </Button>
            ) : (
              <Button
                variant="danger"
                size="md"
                onClick={handleHangup}
                leftIcon={<PhoneOff className="w-4 h-4" />}
                className="flex-1"
              >
                End Call
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Recent Call Sessions DataTable */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-heading)]">Call History & Sessions</h2>
          <span className="text-xs text-[var(--color-muted)]">{calls.length} records</span>
        </div>

        <DataTable
          columns={columns}
          data={calls}
          isLoading={loadingConfig}
          loadingMessage="Loading call sessions..."
          searchKey="to_number"
          searchPlaceholder="Search calls by number or SID..."
          emptyTitle="No calls recorded yet"
          emptyDescription="Place an in-browser call using the calling console to generate call logs."
          pagination={true}
          pageSize={10}
        />
      </div>

      {/* DTMF Keypad Drawer */}
      <Drawer
        isOpen={dialpadOpen}
        onClose={() => setDialpadOpen(false)}
        title="DTMF Phone Keypad"
        description="Touch tones for live call routing & number dialing"
        size="sm"
      >
        <div className="space-y-4 text-center">
          {/* Keypad Display */}
          <div className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]">
            <div className="text-lg font-mono font-semibold text-[var(--color-heading)] min-h-[28px] tracking-wider truncate">
              {toNumber || <span className="text-[var(--color-muted)] font-normal text-sm">Enter digits</span>}
            </div>
          </div>

          {/* Keypad Buttons Grid */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto py-2">
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
              { digit: "+", sub: "INTL" },
              { digit: "0", sub: "+" },
            ].map(({ digit, sub }) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadDigit(digit)}
                className="h-14 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] text-[var(--color-heading)] hover:text-[var(--color-primary)] flex flex-col items-center justify-center transition-colors active:scale-95 cursor-pointer shadow-2xs"
              >
                <span className="text-base font-semibold font-mono leading-none">{digit}</span>
                {sub && (
                  <span className="text-[9px] text-[var(--color-muted)] uppercase tracking-wider mt-0.5">
                    {sub}
                  </span>
                )}
              </button>
            ))}

            {/* Backspace Button */}
            <button
              type="button"
              onClick={() => setToNumber((prev) => prev.slice(0, -1))}
              disabled={toNumber.length === 0}
              className="h-14 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] hover:bg-[var(--color-danger)]/10 text-[var(--color-muted)] hover:text-[var(--color-danger)] disabled:opacity-30 flex flex-col items-center justify-center transition-colors active:scale-95 cursor-pointer"
            >
              <Delete className="w-4 h-4" />
              <span className="text-[9px] uppercase tracking-wider mt-0.5">Del</span>
            </button>
          </div>

          <div className="pt-3">
            {callState === "idle" ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setDialpadOpen(false);
                  handleBrowserCall();
                }}
                leftIcon={<PhoneOutgoing className="w-4 h-4" />}
                className="w-full"
              >
                Dial {toNumber || "Number"}
              </Button>
            ) : (
              <Button
                variant="danger"
                size="md"
                onClick={handleHangup}
                leftIcon={<PhoneOff className="w-4 h-4" />}
                className="w-full"
              >
                Hang up
              </Button>
            )}
          </div>
        </div>
      </Drawer>

      {/* Call Details / Inspection Drawer */}
      <Drawer
        isOpen={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        title="Call Session Details"
        description={selectedCall?.call_sid || "Call Record"}
        size="md"
      >
        {selectedCall && (
          <div className="space-y-5 text-left text-xs">
            {/* Status & Timing */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]">
              <div>
                <span className="text-[var(--color-muted)] block text-[11px]">Call Status</span>
                <div className="mt-1">
                  <StatusIndicator status={selectedCall.status} />
                </div>
              </div>
              <div>
                <span className="text-[var(--color-muted)] block text-[11px]">Duration</span>
                <span className="font-mono font-medium text-[var(--color-heading)] text-xs mt-1 block">
                  {formatDuration(selectedCall.duration)}
                </span>
              </div>
            </div>

            {/* Routing Details */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--color-heading)]">Routing & Numbers</h4>
              <div className="p-3 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Destination (To):</span>
                  <span className="font-mono font-medium text-[var(--color-heading)]">{selectedCall.to_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Caller ID (From):</span>
                  <span className="font-mono text-[var(--color-muted)]">{selectedCall.from_number || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Call SID:</span>
                  <span className="font-mono text-[var(--color-muted)] truncate max-w-[180px]">{selectedCall.call_sid || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Started At:</span>
                  <span className="text-[var(--color-text)]">{new Date(selectedCall.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Prompt / Context Note */}
            {selectedCall.prompt && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-[var(--color-heading)]">Agent Context / Prompt</h4>
                <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)] leading-relaxed italic">
                  "{selectedCall.prompt}"
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
