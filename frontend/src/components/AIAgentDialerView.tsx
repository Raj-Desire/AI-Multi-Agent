import React, { useState, useEffect, useRef } from "react";
import { fetchApi, LIVE } from "../api-client";
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
import { TranscriptChat } from "./ui/TranscriptChat";

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
  const [remoteHost, setRemoteHost] = useState<string | null>(null);
  const [transcriptMessages, setTranscriptMessages] = useState<ConversationTurnMessage[]>([]);
  const [latestLatency, setLatestLatency] = useState({ stt: 0, llm: 0, tts: 0, turn: 0 });

  // Inspection Drawer
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

  const [analyzingCall, setAnalyzingCall] = useState(false);
  const analyzedCallIdsRef = useRef<Set<string>>(new Set());

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

  // The call list only carries summary rows, so load the full record (transcript, analytics) when a call is opened
  useEffect(() => {
    const id = selectedCall?.id;
    if (!id) return;
    let cancelled = false;
    fetchApi<CallRecord>(`/calls/${id}`, LIVE)
      .then((full) => {
        if (!cancelled) setSelectedCall((prev) => (prev && prev.id === id ? { ...prev, ...full } : prev));
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [selectedCall?.id]);

  // When a call is opened without a summary (e.g. analysis failed at hang-up), generate it from the transcript
  useEffect(() => {
    if (!selectedCall) return;
    const hasCustomerSpeech = (selectedCall.transcript || []).some(
      (t: any) => (t.role === "user" || t.role === "customer") && (t.content || "").trim()
    );
    if (selectedCall.summary || selectedCall.analytics_status === "pending" || !hasCustomerSpeech || analyzedCallIdsRef.current.has(selectedCall.id)) return;
    analyzedCallIdsRef.current.add(selectedCall.id);
    void handleGenerateSummary(selectedCall.id);
  }, [selectedCall?.id, selectedCall?.analytics_status, selectedCall?.transcript?.length]);

  async function handleGenerateSummary(callId: string) {
    try {
      setAnalyzingCall(true);
      const updated = await fetchApi<CallRecord>(`/calls/${callId}/analyze`, { method: "POST" });
      setSelectedCall((prev) => (prev && prev.id === callId ? { ...prev, ...updated } : prev));
      setCalls((prev) => prev.map((c) => (c.id === callId ? { ...c, ...updated } : c)));
    } catch (err: any) {
      console.warn("Call summary generation failed:", err);
    } finally {
      setAnalyzingCall(false);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const [twCfg, agentsRes, callList] = await Promise.all([
        fetchApi<TwilioConfig | null>("/twilio/configuration").catch(() => null),
        fetchApi<AvailableAgentsResponse>("/agents/available").catch(() => ({ my_agents: [], default_agents: [] })),
        fetchApi<CallRecord[]>("/calls?type=ai", LIVE).catch(() => []),
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

  function refreshCalls() {
    return fetchApi<CallRecord[]>("/calls?type=ai", LIVE)
      .then((list) => {
        setCalls(list);
        setSelectedCall((prev) => {
          if (!prev) return prev;
          const row = list.find((c) => c.id === prev.id);
          return row ? { ...prev, ...row } : prev;
        });
      })
      .catch(() => { });
  }

  function resetLiveCallUi() {
    setRemoteHost(null);
    setCallState("idle");
    setCalling(false);
    setActiveCallSid(null);
    stopTimer();
  }

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
    const rawApiBase = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000/api/v1`;
    const wsUrl = rawApiBase.replace(/^http/, "ws").replace(/\/api\/v1\/?$/, "") + `/api/v1/voice/telemetry/${sessionId}`;
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
        } else if (event.event_type === "StreamConnected") {
          // Call answered: start the clock now so the timer matches the call duration measured by the backend
          setCallState("connected");
          startTimer();
        } else if (event.event_type === "CallStatus") {
          // Live carrier status from the provider webhook (ringing, answered, busy, no-answer, ...)
          const st = String(event.payload?.status || "").toLowerCase();
          if (st === "ringing") {
            setCallState((prev) => (prev === "connected" ? prev : "ringing"));
          }
        } else if (event.event_type === "CallEnded") {
          resetLiveCallUi();
          refreshCalls();
        } else if (event.event_type === "CallSaved" || event.event_type === "LeadIntelligenceUpdated") {
          // Call record saved / summary and lead score finished generating in the background after hang-up
          refreshCalls();
        }
      } catch (err) {
        console.error("Telemetry parse error:", err);
      }
    };

    telemetryWsRef.current = ws;
  }

  // Live state poll: the server's in-memory call state is the source of truth for status, duration,
  // transcript and latency, so the screen never depends on catching a one-off websocket event
  // (the media stream can start before the browser's telemetry socket is even open).
  useEffect(() => {
    if (!calling || !activeSessionId) return;
    let stopped = false;
    let busy = false;
    let seenLive = false;
    let connectedSeen = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const st = await fetchApi<{
          phase: "dialing" | "ringing" | "connected" | "ended" | "unknown";
          remote?: boolean;
          remote_host?: string;
          duration: number;
          messages: ConversationTurnMessage[];
          latency: { stt_latency_ms?: number; llm_latency_ms?: number; tts_latency_ms?: number; total_turn_latency_ms?: number };
        }>(`/voice/session/${activeSessionId}/live`, LIVE);
        if (stopped || !st) return;
        if (st.remote) setRemoteHost(st.remote_host || "another server");

        if (st.phase === "dialing" || st.phase === "ringing") {
          seenLive = true;
          setCallState((prev) => (prev === "connected" ? prev : st.phase === "ringing" ? "ringing" : "dialing"));
        } else if (st.phase === "connected") {
          seenLive = true;
          if (!connectedSeen) {
            connectedSeen = true;
            setCallState("connected");
            startTimer();
          }
          setCallDuration(st.duration || 0);
          if (Array.isArray(st.messages)) {
            setTranscriptMessages((prev) => (st.messages.length >= prev.length ? st.messages : prev));
          }
          if (st.latency) {
            setLatestLatency({
              stt: st.latency.stt_latency_ms || 0,
              llm: st.latency.llm_latency_ms || 0,
              tts: st.latency.tts_latency_ms || 0,
              turn: st.latency.total_turn_latency_ms || 0,
            });
          }
        } else if (st.phase === "ended" || (st.phase === "unknown" && (seenLive || Date.now() - startedAt > 15000))) {
          stopped = true;
          resetLiveCallUi();
          refreshCalls();
        }
      } catch {
        // transient network error: try again on the next tick
      } finally {
        busy = false;
      }
    };

    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [calling, activeSessionId]);

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

      // Pre-flight Credit Limit Check
      try {
        const cred = await fetchApi<{ remaining_minutes: number; is_credit_enforced: boolean }>("/credits/my-org", LIVE);
        if (cred && cred.is_credit_enforced && cred.remaining_minutes <= 0) {
          window.dispatchEvent(
            new CustomEvent("credit-limit-exceeded", {
              detail: {
                message:
                  "You have reached your allocated organization calling limit. Please contact your workspace administrator to top up your account."
              }
            })
          );
          return;
        }
      } catch {
        // Continue to server-side enforcement
      }

      setCalling(true);
      setCallState("dialing");
      setTranscriptMessages([]);
      setLatestLatency({ stt: 0, llm: 0, tts: 0, turn: 0 });

      setRemoteHost(null);
      const res = await fetchApi<{ call_session_id: string; call_sid: string; routes_to_this_server?: boolean; routed_host?: string | null }>("/voice/test-call", {
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
      if (res.routes_to_this_server === false) setRemoteHost(res.routed_host || "another server");
      // Still ringing: the timer starts when the "StreamConnected" telemetry event arrives (on answer)
      setCallState("ringing");
      connectTelemetryStream(res.call_session_id);
      refreshCalls();
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
      refreshCalls();
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
                className="w-full h-10 text-xs px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
              >
                {availableAgents.my_agents && availableAgents.my_agents.length > 0 && (
                  <optgroup label="My Organization Agents">
                    {availableAgents.my_agents.map((a) => (
                      <option key={`my_agent_${a.agent_id}`} value={a.agent_id}>
                        {a.name} - {a.role}
                      </option>
                    ))}
                  </optgroup>
                )}
                {availableAgents.default_agents && availableAgents.default_agents.length > 0 && (
                  <optgroup label="Platform Default Agents">
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
              {calling && callState !== "connected" ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-xs font-semibold text-amber-600">Ringing...</span>
                </div>
              ) : calling ? (
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

            {calling && remoteHost && (
              <div className="text-[11px] leading-snug p-2.5 rounded-[var(--radius-main,0.375rem)] border border-amber-300 bg-amber-50 text-amber-800">
                This call is being handled by <span className="font-semibold">{remoteHost}</span>, not this server, so only the live
                call status is shown here. To see the live transcript and latency, point the Public Base URL at this
                server (for example with a tunnel to port 8000).
              </div>
            )}

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
                      className={`p-2.5 rounded-[var(--radius-main,0.375rem)] max-w-[85%] text-xs ${msg.role === "user"
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

            {/* Conversation Summary & Lead Intelligence */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  Conversation Summary
                </h4>
                {selectedCall.transcript && selectedCall.transcript.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleGenerateSummary(selectedCall.id)}
                    disabled={analyzingCall}
                    className="text-[11px] text-[var(--color-primary)] hover:underline disabled:opacity-50 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${analyzingCall ? "animate-spin" : ""}`} />
                    {analyzingCall ? "Analyzing..." : "Regenerate"}
                  </button>
                )}
              </div>
              <div className="p-3 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-3">
                {selectedCall.summary ? (
                  <p className="text-xs leading-relaxed text-[var(--color-heading)]">{selectedCall.summary}</p>
                ) : (
                  <p className="text-xs text-[var(--color-muted)]">
                    {analyzingCall
                      ? "Generating a summary of this conversation..."
                      : selectedCall.transcript && selectedCall.transcript.length > 0
                        ? "No summary yet. Use Regenerate to create one from the transcript."
                        : "No conversation was recorded for this call, so there is nothing to summarize."}
                  </p>
                )}

                {(selectedCall.business_outcome || selectedCall.outcome || selectedCall.interest_level || selectedCall.lead_score !== undefined) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(selectedCall.business_outcome || selectedCall.outcome) && (
                      <Badge variant="primary" size="sm">{selectedCall.business_outcome || selectedCall.outcome}</Badge>
                    )}
                    {selectedCall.interest_level && (
                      <Badge variant="neutral" size="sm">{selectedCall.interest_level}</Badge>
                    )}
                    {selectedCall.lead_score !== undefined && selectedCall.lead_score !== null && (
                      <Badge variant="neutral" size="sm">Lead score {selectedCall.lead_score}</Badge>
                    )}
                    {selectedCall.sentiment && (
                      <Badge variant="neutral" size="sm">{selectedCall.sentiment}</Badge>
                    )}
                  </div>
                )}

                {selectedCall.next_action && (
                  <div>
                    <span className="text-[var(--color-muted)] block text-[11px]">Recommended next step</span>
                    <span className="text-xs text-[var(--color-heading)]">{selectedCall.next_action}</span>
                  </div>
                )}

                {selectedCall.key_insights && selectedCall.key_insights.length > 0 && (
                  <div>
                    <span className="text-[var(--color-muted)] block text-[11px] mb-1">Key points</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-xs text-[var(--color-heading)]">
                      {selectedCall.key_insights.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Agent Snapshot Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--color-heading)]">AI Agent Profile (Snapshot)</h4>
              <div className="p-3 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Agent Name:</span>
                  <span className="font-medium text-[var(--color-heading)]">
                    {selectedCall.agent_name || "AI Receptionist"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Scope:</span>
                  <span className="font-mono text-[var(--color-muted)]">
                    {selectedCall.agent_scope || "ORGANIZATION"}
                  </span>
                </div>
              </div>
            </div>

            {/* Spoken Transcript */}
            {selectedCall.transcript && selectedCall.transcript.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-[var(--color-heading)]">Conversation Transcript</h4>
                <div className="p-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] max-h-96 overflow-y-auto">
                  <TranscriptChat
                    turns={selectedCall.transcript as any}
                    agentName={selectedCall.agent_name || "AI Agent"}
                    customerName="Customer"
                  />
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
