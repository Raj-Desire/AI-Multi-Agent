import React, { useState, useEffect, useRef } from "react";
import { fetchApi } from "../api-client";
import { TwilioConfig, CallRecord, AvailableAgentsResponse, AgentConfig, VoiceTelemetryEvent, ConversationTurnMessage } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  Bot,
  PhoneCall,
  PhoneOutgoing,
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  Clock,
  Sparkles,
  Zap,
  Activity,
  Layers,
  RefreshCw,
  FileText,
  Delete,
  ArrowUpRight,
  MessageSquare,
  Shield,
  Volume2,
  Cpu
} from "lucide-react";
import { PageHeader } from "./ui/PageHeader";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { StatusIndicator } from "./ui/StatusIndicator";
import { DataTable, Column } from "./ui/DataTable";
import { Drawer } from "./ui/Drawer";

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

interface AIAgentDialerViewProps {
  initialAgentId?: string | null;
  onNavigateSettings: () => void;
  onNavigateAgents: () => void;
}

export function AIAgentDialerView({
  initialAgentId,
  onNavigateSettings,
  onNavigateAgents,
}: AIAgentDialerViewProps) {
  const { user } = useAuth();
  const [config, setConfig] = useState<TwilioConfig | null>(null);
  const [availableAgents, setAvailableAgents] = useState<AvailableAgentsResponse>({
    my_agents: [],
    default_agents: [],
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgentId || "");
  const [selectedFromNumber, setSelectedFromNumber] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Live Call State
  const [calling, setCalling] = useState(false);
  const [callState, setCallState] = useState<"idle" | "dialing" | "ringing" | "connected">("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [transcriptMessages, setTranscriptMessages] = useState<ConversationTurnMessage[]>([]);
  const [latestLatency, setLatestLatency] = useState({ stt: 0, llm: 0, tts: 0, turn: 0 });

  // Inspection Drawer
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

  const timerRef = useRef<any>(null);
  const telemetryWsRef = useRef<WebSocket | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (telemetryWsRef.current) telemetryWsRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (initialAgentId) {
      setSelectedAgentId(initialAgentId);
    }
  }, [initialAgentId]);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [transcriptMessages]);

  async function loadData() {
    try {
      setLoading(true);
      const [twCfg, agentsRes, callList] = await Promise.all([
        fetchApi<TwilioConfig | null>("/twilio/configuration").catch(() => null),
        fetchApi<AvailableAgentsResponse>("/agents/available").catch(() => ({ my_agents: [], default_agents: [] })),
        fetchApi<CallRecord[]>("/calls?type=ai").catch(() => []),
      ]);

      setConfig(twCfg);
      setAvailableAgents(agentsRes);
      setCalls(callList);

      // Select default agent if none is currently selected
      if (!selectedAgentId) {
        if (twCfg?.default_agent_id) {
          setSelectedAgentId(twCfg.default_agent_id);
        } else if (agentsRes.my_agents && agentsRes.my_agents.length > 0) {
          setSelectedAgentId(agentsRes.my_agents[0].agent_id);
        } else if (agentsRes.default_agents && agentsRes.default_agents.length > 0) {
          setSelectedAgentId(agentsRes.default_agents[0].agent_id);
        }
      }

      if (twCfg?.phone_number) {
        const numbers = twCfg.phone_number.split(",").map((n) => n.trim()).filter(Boolean);
        if (numbers.length > 0) {
          setSelectedFromNumber(numbers[0]);
        }
      }
    } catch (err: any) {
      console.error("AI Dialer data load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const allAgentsList = [...availableAgents.my_agents, ...availableAgents.default_agents];
  const selectedAgent: AgentConfig | undefined = allAgentsList.find(
    (a) => a.agent_id === selectedAgentId
  );

  const availableFromNumbers = (config?.phone_number || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  function startTimer() {
    setCallDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallDuration(0);
  }

  function connectTelemetryStream(sessionId: string) {
    if (telemetryWsRef.current) telemetryWsRef.current.close();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/voice/telemetry/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      try {
        const event: VoiceTelemetryEvent = JSON.parse(e.data);
        if (event.event_type === "UserTranscript" && event.payload?.content) {
          setTranscriptMessages((prev) => [
            ...prev,
            { role: "user", content: event.payload.content, stt_latency_ms: event.payload.stt_latency_ms },
          ]);
          if (event.payload.stt_latency_ms) {
            setLatestLatency((prev) => ({ ...prev, stt: event.payload.stt_latency_ms }));
          }
        } else if (event.event_type === "AgentTranscript" && event.payload?.content) {
          setTranscriptMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: event.payload.content,
              llm_latency_ms: event.payload.llm_latency_ms,
              tts_latency_ms: event.payload.tts_latency_ms,
              turn_latency_ms: event.payload.turn_latency_ms,
            },
          ]);
          setLatestLatency({
            stt: event.payload.stt_latency_ms || 0,
            llm: event.payload.llm_latency_ms || 0,
            tts: event.payload.tts_latency_ms || 0,
            turn: event.payload.turn_latency_ms || 0,
          });
        } else if (event.event_type === "CallEnded") {
          setCallState("idle");
          setCalling(false);
          stopTimer();
          fetchApi<CallRecord[]>("/calls").then(setCalls).catch(() => {});
        }
      } catch (err) {
        console.error("Telemetry parse error:", err);
      }
    };

    telemetryWsRef.current = ws;
  }

  async function handleStartAICall() {
    if (!toNumber.trim()) {
      setMessage({ text: "Please enter a valid destination phone number.", type: "error" });
      return;
    }
    if (!selectedAgent) {
      setMessage({ text: "Please select an AI Voice Agent first.", type: "error" });
      return;
    }

    try {
      setMessage(null);
      setCalling(true);
      setCallState("dialing");
      setTranscriptMessages([]);
      setLatestLatency({ stt: 0, llm: 0, tts: 0, turn: 0 });

      const res = await fetchApi<{ call_session_id: string; call_sid: string }>("/voice/test-call", {
        method: "POST",
        body: JSON.stringify({
          to_number: toNumber.trim(),
          from_number: selectedFromNumber || availableFromNumbers[0] || "",
          agent_id: selectedAgent.agent_id,
          agent_config_override: customPrompt ? { ...selectedAgent, greeting: customPrompt } : selectedAgent,
        }),
      });

      setActiveSessionId(res.call_session_id);
      setActiveCallSid(res.call_sid);
      setCallState("connected");
      startTimer();
      connectTelemetryStream(res.call_session_id);
      fetchApi<CallRecord[]>("/calls").then(setCalls).catch(() => {});
    } catch (err: any) {
      setCalling(false);
      setCallState("idle");
      stopTimer();
      setMessage({ text: `Failed to initiate AI call: ${err.message}`, type: "error" });
    }
  }

  async function handleEndAICall() {
    try {
      if (activeSessionId) {
        await fetchApi("/voice/hangup", {
          method: "POST",
          body: JSON.stringify({
            call_session_id: activeSessionId,
            call_sid: activeCallSid,
          }),
        });
      }
    } catch (err) {
      console.warn("Hangup warning:", err);
    } finally {
      setCalling(false);
      setCallState("idle");
      stopTimer();
      if (telemetryWsRef.current) telemetryWsRef.current.close();
      fetchApi<CallRecord[]>("/calls").then(setCalls).catch(() => {});
    }
  }

  function sanitizePhoneNumber(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    const hasLeadingPlus = trimmed.startsWith("+");
    const digitsOnly = trimmed.replace(/\D/g, "");
    return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
  }

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
      key: "agent_name",
      header: "AI Agent",
      sortable: true,
      render: (c) => (
        <div>
          <div className="font-semibold text-xs text-[var(--color-heading)] flex items-center gap-1">
            <span>{c.agent_name || "Receptionist"}</span>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">v{c.agent_version || 1}</span>
          </div>
          <span className="text-[10px] text-[var(--color-muted)]">
            {c.agent_scope === "GLOBAL" ? "Platform" : "Organization"}
          </span>
        </div>
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
        title="AI Voice Agent Dialer"
        description="Select any AI Voice Agent, place conversational AI calls."
        badge={
          <Badge variant="primary" size="md">
            AI Agent Mode
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateAgents}
              leftIcon={<Bot className="w-3.5 h-3.5" />}
            >
              Manage Agents
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync
            </Button>
          </div>
        }
      />

      {/* Global Notice if Twilio not configured */}
      {!loading && !config && (
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

      {/* Main AI Call Dispatcher Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Call Setup Form */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[var(--color-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--color-heading)]">AI Agent Call Setup</h3>
              </div>
              {selectedAgent && (
                <Badge variant={selectedAgent.scope === "GLOBAL" ? "neutral" : "primary"} size="sm">
                  {selectedAgent.scope === "GLOBAL" ? "Platform Agent" : `Org Agent (v${selectedAgent.version})`}
                </Badge>
              )}
            </div>

            {/* AI Voice Agent Selection Dropdown */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5 flex items-center justify-between">
                <span>Select AI Voice Agent</span>
                <span className="text-[10px] text-[var(--color-muted)]">
                  {allAgentsList.length} agents available
                </span>
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                disabled={calling}
                className="w-full h-10 text-xs px-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
              >
                {availableAgents.my_agents && availableAgents.my_agents.length > 0 && (
                  <optgroup label="My Organization Agents">
                    {availableAgents.my_agents.map((a) => (
                      <option key={`my_agent_${a.agent_id}`} value={a.agent_id}>
                        {a.name} (v{a.version}) - {a.role}
                      </option>
                    ))}
                  </optgroup>
                )}
                {availableAgents.default_agents && availableAgents.default_agents.length > 0 && (
                  <optgroup label="Desire AI Platform Defaults">
                    {availableAgents.default_agents
                      .filter((da) => !(availableAgents.my_agents || []).some((ma) => ma.agent_id === da.agent_id))
                      .map((a) => (
                        <option key={`platform_agent_${a.agent_id}`} value={a.agent_id}>
                          {a.name} - {a.role}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Selected Agent Preview Strip */}
            {selectedAgent && (
              <div className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--color-heading)]">{selectedAgent.name}</span>
                  <span className="text-[10px] text-[var(--color-muted)]">{selectedAgent.role}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1 text-[var(--color-muted)]">
                    <Volume2 className="w-3 h-3 text-[var(--color-primary)]" />
                    <span>Voice: <strong className="text-[var(--color-heading)] font-mono">{selectedAgent.voice?.voice}</strong></span>
                  </div>
                  {/* <div className="flex items-center gap-1 text-[var(--color-muted)]">
                    <Cpu className="w-3 h-3 text-[var(--color-primary)]" />
                    <span>LLM: <strong className="text-[var(--color-heading)] font-mono">{selectedAgent.llm?.model}</strong></span>
                  </div> */}
                </div>
                <p className="text-[11px] text-[var(--color-muted)] italic line-clamp-2">
                  "{selectedAgent.greeting}"
                </p>
              </div>
            )}

            {/* Caller ID (From) */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5">
                Caller ID (From Number)
              </label>
              {availableFromNumbers.length > 1 ? (
                <select
                  value={selectedFromNumber}
                  onChange={(e) => setSelectedFromNumber(e.target.value)}
                  disabled={calling}
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

            {/* Destination Phone Number */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5">
                Destination Phone Number (To)
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
                  disabled={calling}
                  placeholder="+1 (555) 000-0000"
                  className="w-full h-10 px-3 text-sm font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] placeholder-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)]"
                />
                {toNumber.length > 0 && !calling && (
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

            {/* Custom Opening Greeting Override (Optional) */}
            <div>
              <button
                type="button"
                onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{showCustomPrompt ? "Hide Custom Opening Greeting" : "+ Customize Opening Greeting for this Call"}</span>
              </button>
              {showCustomPrompt && (
                <textarea
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={calling}
                  placeholder="Override the agent's opening statement for this specific recipient..."
                  className="w-full mt-2 p-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              )}
            </div>

            {/* Call Action Button */}
            <div className="pt-2">
              {!calling ? (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleStartAICall}
                  disabled={!config || !toNumber.trim() || !selectedAgent}
                  leftIcon={<PhoneOutgoing className="w-4 h-4" />}
                  className="w-full font-semibold"
                >
                  Start AI Call ({selectedAgent?.name || "Select Agent"})
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="lg"
                  onClick={handleEndAICall}
                  leftIcon={<PhoneOff className="w-4 h-4" />}
                  className="w-full font-semibold"
                >
                  End AI Call
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Conversation & Telemetry */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs space-y-4 flex flex-col h-full min-h-[420px]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div className="flex items-center gap-2">
                <Radio className={`w-4 h-4 ${calling ? "text-emerald-500 animate-pulse" : "text-[var(--color-muted)]"}`} />
                <h3 className="text-sm font-semibold text-[var(--color-heading)]">Live Telemetry & Spoken Turns</h3>
              </div>
              {calling ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="font-mono text-xs font-semibold text-emerald-600">
                    {Math.floor(callDuration / 60).toString().padStart(2, "0")}:
                    {(callDuration % 60).toString().padStart(2, "0")}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-[var(--color-muted)]">Awaiting Call</span>
              )}
            </div>

            {/* Live Spoken Transcript */}
            <div
              ref={transcriptBoxRef}
              className="flex-1 overflow-y-auto p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2.5 min-h-[240px] max-h-[340px]"
            >
              {transcriptMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[var(--color-muted)] text-xs text-center p-6 space-y-2">
                  <Bot className="w-8 h-8 opacity-30" />
                  <p>When an AI call connects, spoken turns and live speech recognition will stream here in real time.</p>
                </div>
              ) : (
                transcriptMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div className="text-[10px] text-[var(--color-muted)] mb-0.5 capitalize">
                      {msg.role === "user" ? "Customer" : selectedAgent?.name || "AI Agent"}
                    </div>
                    <div
                      className={`p-2.5 rounded-[var(--radius-main,0.375rem)] max-w-[85%] text-xs ${
                        msg.role === "user"
                          ? "bg-[var(--color-primary)] text-white font-medium"
                          : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-heading)]"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Stage Latency Gauges */}
            <div className="grid grid-cols-4 gap-2 text-center pt-1 border-t border-[var(--color-border)]">
              <div className="p-2 border border-[var(--color-border)] rounded bg-[var(--color-surface-muted)]">
                <span className="text-[10px] text-[var(--color-muted)] block">STT Latency</span>
                <span className="font-mono text-xs font-semibold text-[var(--color-heading)]">{latestLatency.stt}ms</span>
              </div>
              <div className="p-2 border border-[var(--color-border)] rounded bg-[var(--color-surface-muted)]">
                <span className="text-[10px] text-[var(--color-muted)] block">LLM Reasoning</span>
                <span className="font-mono text-xs font-semibold text-[var(--color-heading)]">{latestLatency.llm}ms</span>
              </div>
              <div className="p-2 border border-[var(--color-border)] rounded bg-[var(--color-surface-muted)]">
                <span className="text-[10px] text-[var(--color-muted)] block">TTS Synthesis</span>
                <span className="font-mono text-xs font-semibold text-[var(--color-heading)]">{latestLatency.tts}ms</span>
              </div>
              <div className="p-2 border border-[var(--color-border)] rounded bg-[var(--color-surface-muted)]">
                <span className="text-[10px] text-[var(--color-muted)] block">Total Turn</span>
                <span className="font-mono text-xs font-semibold text-[var(--color-primary)]">{latestLatency.turn}ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Agent Call History DataTable */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-heading)]">AI Agent Call Records & History</h2>
          <span className="text-xs text-[var(--color-muted)]">{calls.length} records</span>
        </div>

        <DataTable
          columns={columns}
          data={calls}
          isLoading={loading}
          loadingMessage="Loading AI agent call records..."
          searchKey="to_number"
          searchPlaceholder="Search calls by phone number or agent name..."
          emptyTitle="No call records yet"
          emptyDescription="Place an outbound AI call to generate automated conversation logs."
          pagination={true}
          pageSize={10}
        />
      </div>

      {/* Call Details Drawer */}
      <Drawer
        isOpen={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        title="AI Call Session Details"
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

            {/* Agent Snapshot Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--color-heading)]">AI Agent Profile (Snapshot)</h4>
              <div className="p-3 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Agent Name:</span>
                  <span className="font-medium text-[var(--color-heading)]">
                    {selectedCall.agent_name || "Desire AI Receptionist"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Version & Scope:</span>
                  <span className="font-mono text-[var(--color-muted)]">
                    v{selectedCall.agent_version || 1} &bull; {selectedCall.agent_scope || "ORGANIZATION"}
                  </span>
                </div>
              </div>
            </div>

            {/* Spoken Transcript */}
            {selectedCall.transcript && selectedCall.transcript.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-[var(--color-heading)]">Conversation Transcript</h4>
                <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2 max-h-56 overflow-y-auto">
                  {selectedCall.transcript.map((t, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded text-xs ${
                        t.role === "user"
                          ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium"
                          : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-heading)]"
                      }`}
                    >
                      <div className="text-[10px] text-[var(--color-muted)] mb-0.5 capitalize">
                        {t.role === "user" ? "Customer" : selectedCall.agent_name || "AI Agent"}
                      </div>
                      <div>{t.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Routing Identifiers */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--color-heading)]">Routing & Identifiers</h4>
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
                  <span className="font-mono text-[var(--color-muted)] truncate max-w-[180px]">
                    {selectedCall.call_sid || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Started At:</span>
                  <span className="text-[var(--color-text)]">{new Date(selectedCall.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
