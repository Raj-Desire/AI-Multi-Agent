import React, { useState, useEffect, useRef } from "react";
import { fetchApi } from "../api-client";
import { AgentConfig, TwilioConfig, VoiceTelemetryEvent, ConversationTurnMessage } from "../types";
import {
  Bot,
  PhoneCall,
  PhoneOff,
  Sliders,
  Play,
  CheckCircle2,
  AlertCircle,
  Activity,
  Zap,
  Mic,
  Volume2,
  RefreshCw,
  Cpu,
  Radio,
  Clock,
  Sparkles,
  MessageSquare
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";

const AURA_VOICES = [
  { value: "aura-luna-en", label: "Luna (Female - Calm, Relaxed & Professional - Recommended for slower cadence)" },
  { value: "aura-orion-en", label: "Orion (Male - Calm, Smooth & Measured - Recommended for slower cadence)" },
  { value: "aura-asteria-en", label: "Asteria (Female - Warm & Natural)" },
  { value: "aura-stella-en", label: "Stella (Female - Friendly & Clear)" },
  { value: "aura-arcas-en", label: "Arcas (Male - Conversational & Grounded)" },
  { value: "aura-athena-en", label: "Athena (Female - Authoritative)" },
  { value: "aura-hera-en", label: "Hera (Female - Confident & Polished)" },
  { value: "aura-perseus-en", label: "Perseus (Male - Energetic)" },
  { value: "aura-angus-en", label: "Angus (Male - Deep & Formal)" },
  { value: "aura-helios-en", label: "Helios (Male - Direct & Crisp)" }
];

const LLM_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini (Fastest - Recommended)" },
  { value: "gpt-4o", label: "GPT-4o (High Accuracy)" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Balanced)" }
];

export function VoiceAgentView() {
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Test Call state
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [selectedFromNumber, setSelectedFromNumber] = useState("");
  const [customTestPrompt, setCustomTestPrompt] = useState("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [calling, setCalling] = useState(false);
  const [hangingUp, setHangingUp] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);

  // Live Telemetry state
  const [telemetryEvents, setTelemetryEvents] = useState<VoiceTelemetryEvent[]>([]);
  const [transcriptMessages, setTranscriptMessages] = useState<ConversationTurnMessage[]>([]);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [latestLatency, setLatestLatency] = useState({
    stt: 0,
    llm: 0,
    tts: 0,
    turn: 0
  });

  const telemetryWsRef = useRef<WebSocket | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadData();
    return () => {
      if (telemetryWsRef.current) {
        telemetryWsRef.current.close();
      }
    };
  }, []);

  // Smoothly scroll only the transcript box when new messages arrive, without scrolling the whole webpage
  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [transcriptMessages]);

  async function loadData() {
    try {
      setLoading(true);
      const [agentRes, twilioRes] = await Promise.all([
        fetchApi<AgentConfig>("/agents/primary"),
        fetchApi<TwilioConfig | null>("/twilio/configuration").catch(() => null)
      ]);
      setAgent(agentRes);
      setTwilioConfig(twilioRes);
      if (twilioRes?.phone_number) {
        const nums = twilioRes.phone_number.split(",").map((n) => n.trim()).filter(Boolean);
        if (nums.length > 0) {
          setSelectedFromNumber(nums[0]);
        }
      }
    } catch (err: any) {
      console.error("Failed to load voice agent data:", err);
      setStatusMessage({ type: "error", text: "Failed to load agent configuration." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!agent) return;
    try {
      setSaving(true);
      setStatusMessage(null);
      const updated = await fetchApi<AgentConfig>(`/agents/${agent.agent_id}`, {
        method: "PUT",
        body: JSON.stringify(agent)
      });
      setAgent(updated);
      setStatusMessage({ type: "success", text: "AI Agent Configuration saved successfully!" });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to save: ${err.message}` });
    } finally {
      setSaving(false);
    }
  }

  function connectTelemetryStream(sessionId: string) {
    if (telemetryWsRef.current) {
      telemetryWsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Connect to backend telemetry stream
    const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/voice/telemetry/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`[Telemetry] Connected to session ${sessionId}`);
    };

    ws.onmessage = (event) => {
      try {
        const msg: VoiceTelemetryEvent = JSON.parse(event.data);
        setTelemetryEvents((prev) => [msg, ...prev].slice(0, 50));

        if (msg.event_type === "UserStartedSpeaking") {
          setIsUserSpeaking(true);
          setIsAgentSpeaking(false);
        } else if (msg.event_type === "AgentThinking") {
          setIsUserSpeaking(false);
        } else if (msg.event_type === "AgentStartedSpeaking") {
          setIsAgentSpeaking(true);
          setIsUserSpeaking(false);
        } else if (msg.event_type === "AgentAudioDone") {
          setIsAgentSpeaking(false);
        } else if (msg.event_type === "UserTranscript") {
          setTranscriptMessages((prev) => [
            ...prev,
            {
              role: "user",
              content: msg.payload.content || "",
              timestamp: msg.timestamp,
              stt_latency_ms: msg.payload.stt_latency_ms
            }
          ]);
          if (msg.payload.stt_latency_ms) {
            setLatestLatency((l) => ({ ...l, stt: msg.payload.stt_latency_ms }));
          }
        } else if (msg.event_type === "AgentTranscript") {
          setTranscriptMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: msg.payload.content || "",
              timestamp: msg.timestamp,
              turn_latency_ms: msg.payload.turn_latency_ms,
              llm_latency_ms: msg.payload.llm_latency_ms,
              tts_latency_ms: msg.payload.tts_latency_ms
            }
          ]);
          if (msg.payload.turn_latency_ms) {
            setLatestLatency((l) => ({
              ...l,
              turn: msg.payload.turn_latency_ms,
              llm: msg.payload.llm_latency_ms || l.llm,
              tts: msg.payload.tts_latency_ms || l.tts
            }));
          }
        } else if (msg.event_type === "BargeInTriggered") {
          setIsAgentSpeaking(false);
        } else if (msg.event_type === "CallEnded") {
          setIsAgentSpeaking(false);
          setIsUserSpeaking(false);
          setActiveCallSid(null);
          setStatusMessage({
            type: "success",
            text: "AI phone call ended. All streaming resources and audio channels closed."
          });
        }
      } catch (e) {
        console.error("Telemetry parse error:", e);
      }
    };

    ws.onclose = () => {
      console.log(`[Telemetry] Disconnected from session ${sessionId}`);
    };

    telemetryWsRef.current = ws;
  }

  async function handleStartTestCall() {
    if (!testPhoneNumber.trim()) {
      setStatusMessage({ type: "error", text: "Please enter a destination phone number to test." });
      return;
    }

    try {
      setCalling(true);
      setStatusMessage(null);
      setTranscriptMessages([]);
      setTelemetryEvents([]);

      const res = await fetchApi<{
        call_session_id: string;
        call_sid: string;
        status: string;
        stream_url: string;
      }>("/voice/test-call", {
        method: "POST",
        body: JSON.stringify({
          to_number: testPhoneNumber.trim(),
          from_number: selectedFromNumber ? selectedFromNumber.trim() : undefined,
          agent_id: agent?.agent_id || "agt_receptionist_default",
          custom_prompt: customTestPrompt.trim() || undefined,
          agent_config_override: agent || undefined
        })
      });

      setActiveSessionId(res.call_session_id);
      setActiveCallSid(res.call_sid);
      setStatusMessage({
        type: "success",
        text: `AI Test Call initiated! SID: ${res.call_sid}. Listening to live audio telemetry...`
      });

      connectTelemetryStream(res.call_session_id);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Test call failed: ${err.message}` });
    } finally {
      setCalling(false);
    }
  }

  async function handleHangupCall() {
    if (!activeSessionId && !activeCallSid) return;

    try {
      setHangingUp(true);
      await fetchApi("/voice/hangup", {
        method: "POST",
        body: JSON.stringify({
          call_session_id: activeSessionId,
          call_sid: activeCallSid
        })
      });

      setStatusMessage({
        type: "success",
        text: "Call immediately disconnected and all WebSocket / streaming connections were terminated to prevent billing."
      });
      setIsAgentSpeaking(false);
      setIsUserSpeaking(false);
      setActiveCallSid(null);
      if (telemetryWsRef.current) {
        telemetryWsRef.current.close();
        telemetryWsRef.current = null;
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to hang up call: ${err.message}` });
    } finally {
      setHangingUp(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-[var(--color-muted)]">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading AI Voice Agent Configuration...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="AI Voice Agent Studio"
        description="Configure, test, and monitor real-time spoken AI phone conversations powered by Deepgram Voice Agent API."
        badge={
          <Badge variant="primary">
            <Radio className="w-3 h-3 mr-1 text-emerald-400 animate-pulse" />
            Deepgram Runtime Active
          </Badge>
        }
      />

      {statusMessage && (
        <Alert type={statusMessage.type === "success" ? "success" : "danger"}>
          {statusMessage.text}
        </Alert>
      )}

      {/* Live Test Call & Telemetry Launcher */}
      <Card className="border-indigo-500/30 bg-gradient-to-br from-[var(--color-surface)] to-indigo-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <CardTitle>Real-Time AI Voice Test Call</CardTitle>
            </div>
            {activeSessionId && (
              <Badge variant="success">
                <Radio className="w-3 h-3 mr-1 text-emerald-400 animate-pulse" />
                Live Session: {activeSessionId}
              </Badge>
            )}
          </div>
          <CardDescription>
            Place an outbound call from your specific Twilio phone number to your real phone and experience real-time AI conversation with live telemetry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4 w-full">
              <label className="block text-xs font-semibold mb-1 text-[var(--color-text)]">
                From Twilio Number (Caller ID)
              </label>
              {twilioConfig?.phone_number ? (
                <Select
                  value={selectedFromNumber}
                  onChange={(e) => setSelectedFromNumber(e.target.value)}
                >
                  {twilioConfig.phone_number.split(",").map((n) => n.trim()).filter(Boolean).map((num) => (
                    <option key={num} value={num}>
                      {num}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  placeholder="+15550001234"
                  value={selectedFromNumber}
                  onChange={(e) => setSelectedFromNumber(e.target.value)}
                />
              )}
            </div>
            <div className="md:col-span-5 w-full">
              <label className="block text-xs font-semibold mb-1 text-[var(--color-text)]">
                Destination Phone Number (To)
              </label>
              <Input
                placeholder="+15551234567"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
              />
            </div>
            <div className="md:col-span-3 w-full flex gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={calling || hangingUp}
                onClick={handleStartTestCall}
                className="gap-2 flex-1 h-10 justify-center"
              >
                {calling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Dialing...
                  </>
                ) : (
                  <>
                    <PhoneCall className="w-4 h-4 text-emerald-300" /> Start Test Call
                  </>
                )}
              </Button>
              {activeCallSid && (
                <Button
                  type="button"
                  variant="danger"
                  disabled={hangingUp}
                  onClick={handleHangupCall}
                  className="gap-2 h-10 px-4 bg-rose-600 hover:bg-rose-700 text-white justify-center shadow-lg shadow-rose-600/30"
                  title="Cut AI call and close all connections immediately"
                >
                  {hangingUp ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <PhoneOff className="w-4 h-4" /> Hang Up
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Custom Test Call Scenario / Prompt Box */}
          <div className="border border-[var(--color-border)] rounded-lg p-3.5 bg-[var(--color-surface)]/60">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-[var(--color-heading)]">
                  Custom Test Call Instructions / Prompt (Optional Override)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                className="text-xs text-[var(--color-primary)] hover:underline font-medium"
              >
                {showCustomPrompt ? "Hide Custom Prompt" : customTestPrompt ? "Edit Custom Prompt (Active)" : "+ Add Custom Call Prompt"}
              </button>
            </div>

            {(showCustomPrompt || customTestPrompt) && (
              <div className="space-y-2 pt-1">
                <textarea
                  rows={3}
                  value={customTestPrompt}
                  onChange={(e) => setCustomTestPrompt(e.target.value)}
                  placeholder="Enter specific scenario or custom instructions just for this test call (e.g. 'You are a dental receptionist. Speak at a very calm, relaxed pace and ask the patient for their name and preferred appointment time. Keep answers short.'). Leave blank to use configured agent prompt."
                  className="w-full text-xs p-3 font-mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                  <span>Overrides the system prompt for test calls when filled.</span>
                  {customTestPrompt && (
                    <button
                      type="button"
                      onClick={() => setCustomTestPrompt("")}
                      className="text-rose-400 hover:underline"
                    >
                      Clear custom prompt
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Agent Configuration Form */}
        <div className="lg:col-span-7 space-y-6">
          {agent && (
            <form onSubmit={handleSaveAgent} className="space-y-6">
              {/* Persona & Identity */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[var(--color-primary)]" />
                    <CardTitle>Agent Persona & Identity</CardTitle>
                  </div>
                  <CardDescription>Identity and primary conversational responsibility.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Agent Name</label>
                      <Input
                        value={agent.name}
                        onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Role Title</label>
                      <Input
                        value={agent.role}
                        onChange={(e) => setAgent({ ...agent, role: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Primary Objective</label>
                    <textarea
                      rows={2}
                      className="w-full text-xs p-2.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:ring-1 focus:ring-[var(--color-primary)]"
                      value={agent.objective}
                      onChange={(e) => setAgent({ ...agent, objective: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Spoken Greeting (Spoken upon call connect)</label>
                    <Input
                      value={agent.greeting}
                      onChange={(e) => setAgent({ ...agent, greeting: e.target.value })}
                      required
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Voice & LLM Provider Settings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <CardTitle>Voice & LLM Model Settings</CardTitle>
                  </div>
                  <CardDescription>Deepgram Aura TTS voice and LLM inference configuration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Aura TTS Voice</label>
                      <Select
                        value={agent.voice.voice}
                        onChange={(e) =>
                          setAgent({
                            ...agent,
                            voice: { ...agent.voice, voice: e.target.value }
                          })
                        }
                      >
                        {AURA_VOICES.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">LLM Model</label>
                      <Select
                        value={agent.llm.model}
                        onChange={(e) =>
                          setAgent({
                            ...agent,
                            llm: { ...agent.llm, model: e.target.value }
                          })
                        }
                      >
                        {LLM_MODELS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="flex justify-between text-xs font-medium mb-1">
                        <span>Voice Speaking Speed (Pacing)</span>
                        <span className="text-[var(--color-primary)] font-bold">
                          {(agent.voice.speed ?? 0.8).toFixed(2)}x
                          {(agent.voice.speed ?? 0.8) <= 0.82 ? " (Calm & Relaxed)" : (agent.voice.speed ?? 0.8) >= 1.05 ? " (Fast)" : " (Standard)"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.70"
                        max="1.30"
                        step="0.05"
                        value={agent.voice.speed ?? 0.8}
                        onChange={(e) =>
                          setAgent({
                            ...agent,
                            voice: { ...agent.voice, speed: parseFloat(e.target.value) }
                          })
                        }
                        className="w-full accent-[var(--color-primary)] cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
                        <span>0.70x (Slow)</span>
                        <span className="text-emerald-400 font-semibold">0.80x (Calm & Natural)</span>
                        <span>1.00x (Fast)</span>
                        <span>1.30x (Very Fast)</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-medium mb-1">
                        <span>Temperature (Creativity / Precision)</span>
                        <span className="text-[var(--color-primary)] font-bold">{agent.llm.temperature}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={agent.llm.temperature}
                        onChange={(e) =>
                          setAgent({
                            ...agent,
                            llm: { ...agent.llm, temperature: parseFloat(e.target.value) }
                          })
                        }
                        className="w-full accent-[var(--color-primary)] cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
                        <span>0.0 (Deterministic)</span>
                        <span>0.4 (Recommended)</span>
                        <span>1.0 (Creative)</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="block text-xs font-medium mb-1">Communication Style</label>
                    <Input
                      value={agent.communication_style}
                      onChange={(e) => setAgent({ ...agent, communication_style: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Personality Sliders */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <CardTitle>Spoken Personality Profile</CardTitle>
                  </div>
                  <CardDescription>Adjust conversational tone metrics (0 - 100).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { key: "professionalism", label: "Professionalism" },
                      { key: "friendliness", label: "Friendliness" },
                      { key: "empathy", label: "Empathy" },
                      { key: "patience", label: "Patience" },
                      { key: "confidence", label: "Confidence" },
                      { key: "energy", label: "Energy" }
                    ].map(({ key, label }) => (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span>{label}</span>
                          <span className="text-xs font-bold text-[var(--color-heading)]">
                            {(agent.personality as any)[key]}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={(agent.personality as any)[key]}
                          onChange={(e) =>
                            setAgent({
                              ...agent,
                              personality: {
                                ...agent.personality,
                                [key]: parseInt(e.target.value, 10)
                              }
                            })
                          }
                          className="w-full accent-[var(--color-primary)] cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* System Prompt */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-amber-400" />
                      <CardTitle>Spoken System Prompt</CardTitle>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAgent({ ...agent, system_prompt: null })}
                      className="text-xs"
                    >
                      Reset to Generated Spoken Prompt
                    </Button>
                  </div>
                  <CardDescription>
                    Custom instructions. If left blank, the prompt builder automatically generates a voice-optimized phone script.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    rows={6}
                    placeholder="Leave blank to use auto-generated voice prompt based on personality and objective..."
                    className="w-full text-xs p-3 font-mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:ring-1 focus:ring-[var(--color-primary)]"
                    value={agent.system_prompt || ""}
                    onChange={(e) => setAgent({ ...agent, system_prompt: e.target.value || null })}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={saving} className="px-6">
                  {saving ? "Saving Changes..." : "Save Agent Configuration"}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Right Column: Live Debug & Telemetry Monitor */}
        <div className="lg:col-span-5 space-y-6">
          {/* Status & Live Indicators */}
          <Card className="border-[var(--color-border)]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <CardTitle>Live Telemetry Console</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {activeCallSid && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={hangingUp}
                      onClick={handleHangupCall}
                      className="gap-1.5 h-7 px-2.5 text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                    >
                      <PhoneOff className="w-3.5 h-3.5" /> End Call
                    </Button>
                  )}
                  {activeCallSid && (
                    <span className="text-[10px] font-mono text-[var(--color-muted)] hidden sm:inline">
                      SID: {activeCallSid.slice(0, 8)}...
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Speaking State Indicators */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`p-3 rounded-lg border flex items-center gap-3 transition-colors ${isUserSpeaking
                      ? "bg-amber-500/10 border-amber-500 text-amber-400"
                      : "bg-[var(--color-surface-muted)]/40 border-[var(--color-border)] text-[var(--color-muted)]"
                    }`}
                >
                  <Mic className={`w-4 h-4 ${isUserSpeaking ? "animate-bounce text-amber-400" : ""}`} />
                  <div>
                    <div className="text-[11px] font-semibold">Customer Speaking</div>
                    <div className="text-[10px]">{isUserSpeaking ? "Active Speech" : "Silent"}</div>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-lg border flex items-center gap-3 transition-colors ${isAgentSpeaking
                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                      : "bg-[var(--color-surface-muted)]/40 border-[var(--color-border)] text-[var(--color-muted)]"
                    }`}
                >
                  <Volume2 className={`w-4 h-4 ${isAgentSpeaking ? "animate-pulse text-emerald-400" : ""}`} />
                  <div>
                    <div className="text-[11px] font-semibold">AI Agent Speaking</div>
                    <div className="text-[10px]">{isAgentSpeaking ? "Transmitting Audio" : "Idle"}</div>
                  </div>
                </div>
              </div>

              {/* Latency Pipeline Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 rounded bg-[var(--color-surface-muted)]/50 border border-[var(--color-border)] text-center">
                  <div className="text-[10px] text-[var(--color-muted)]">STT Latency</div>
                  <div className="text-sm font-bold text-sky-400 mt-0.5">{latestLatency.stt || 0}ms</div>
                </div>
                <div className="p-2.5 rounded bg-[var(--color-surface-muted)]/50 border border-[var(--color-border)] text-center">
                  <div className="text-[10px] text-[var(--color-muted)]">LLM Inference</div>
                  <div className="text-sm font-bold text-purple-400 mt-0.5">{latestLatency.llm || 0}ms</div>
                </div>
                <div className="p-2.5 rounded bg-[var(--color-surface-muted)]/50 border border-[var(--color-border)] text-center">
                  <div className="text-[10px] text-[var(--color-muted)]">TTS Synthesis</div>
                  <div className="text-sm font-bold text-amber-400 mt-0.5">{latestLatency.tts || 0}ms</div>
                </div>
                <div className="p-2.5 rounded bg-[var(--color-surface-muted)]/50 border border-[var(--color-border)] text-center">
                  <div className="text-[10px] text-[var(--color-muted)]">Turn Latency</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{latestLatency.turn || 0}ms</div>
                </div>
              </div>

              {/* Live Transcript Box */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-[var(--color-heading)]">Real-Time Spoken Transcript</span>
                  <span className="text-[10px] text-[var(--color-muted)]">{transcriptMessages.length} turns</span>
                </div>
                <div
                  ref={transcriptBoxRef}
                  className="h-64 overflow-y-auto p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)]/20 space-y-3 scroll-smooth"
                >
                  {transcriptMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)] italic">
                      Waiting for speech audio on live stream...
                    </div>
                  ) : (
                    transcriptMessages.map((m, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col text-xs ${m.role === "user" ? "items-start" : "items-end"
                          }`}
                      >
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-muted)] mb-0.5">
                          {m.role === "user" ? "CUSTOMER" : "DESIRE AI"}
                          {m.turn_latency_ms && (
                            <span className="text-emerald-400 font-mono">({m.turn_latency_ms}ms)</span>
                          )}
                        </div>
                        <div
                          className={`p-2.5 rounded-lg max-w-[85%] ${m.role === "user"
                              ? "bg-amber-500/10 border border-amber-500/20 text-[var(--color-text)]"
                              : "bg-[var(--color-primary-light)] border border-[var(--color-primary)]/20 text-[var(--color-heading)]"
                            }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Event Timeline Log */}
              <div>
                <div className="text-xs font-semibold mb-1.5 text-[var(--color-heading)]">Server Event Log</div>
                <div className="h-36 overflow-y-auto p-2 font-mono text-[10px] rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)]/40 space-y-1">
                  {telemetryEvents.length === 0 ? (
                    <div className="text-[var(--color-muted)] italic">No events logged yet.</div>
                  ) : (
                    telemetryEvents.map((evt, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[var(--color-text)]">
                        <span
                          className={`font-semibold ${evt.event_type.includes("BargeIn")
                              ? "text-rose-400"
                              : evt.event_type.includes("Speaking")
                                ? "text-emerald-400"
                                : "text-sky-400"
                            }`}
                        >
                          {evt.event_type}
                        </span>
                        <span className="text-[var(--color-muted)]">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
