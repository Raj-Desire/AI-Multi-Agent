import React, { useState, useEffect, useRef } from "react";
import { fetchApi } from "../api-client";
import { AgentConfig, AvailableAgentsResponse, TwilioConfig, VoiceTelemetryEvent, ConversationTurnMessage } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  Bot,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Play,
  Copy,
  Edit,
  Sliders,
  Archive,
  CheckCircle2,
  AlertCircle,
  PhoneCall,
  PhoneOff,
  Volume2,
  Cpu,
  Layers,
  Sparkles,
  FileText,
  Clock,
  Shield,
  Activity,
  Zap,
  Radio,
  ArrowUpRight,
  Trash2
} from "lucide-react";
import { PageHeader } from "./ui/PageHeader";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { StatusIndicator } from "./ui/StatusIndicator";
import { Drawer } from "./ui/Drawer";
import { Modal } from "./ui/Modal";
import { DataTable, Column } from "./ui/DataTable";
import { AgentEditorModal } from "./AgentEditorModal";
import { AgentLivePreview } from "./AgentLivePreview";
import { toast } from "sonner";

export function AgentManagementView({ onNavigateToDialer }: { onNavigateToDialer?: (agentId: string) => void }) {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [availableData, setAvailableData] = useState<AvailableAgentsResponse>({ my_agents: [], default_agents: [] });
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [scopeFilter, setScopeFilter] = useState<string>("ALL");

  // Modals & Drawers
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);
  const [isOpeningStudio, setIsOpeningStudio] = useState(false);
  const [openingActionLabel, setOpeningActionLabel] = useState("Initializing Voice Studio...");

  const openStudioWithTransition = (agent: AgentConfig | null, actionLabel?: string) => {
    setOpeningActionLabel(actionLabel || (agent ? `Loading ${agent.name}...` : "Initializing AI Voice Studio..."));
    setIsOpeningStudio(true);
    setTimeout(() => {
      setEditingAgent(agent);
      setIsOpeningStudio(false);
      setEditorOpen(true);
    }, 2200);
  };
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<AgentConfig | null>(null);
  const [previewDrawerAgent, setPreviewDrawerAgent] = useState<AgentConfig | null>(null);
  const [agentToArchive, setAgentToArchive] = useState<AgentConfig | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AgentConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Test Call states
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testAgent, setTestAgent] = useState<AgentConfig | null>(null);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [selectedFromNumber, setSelectedFromNumber] = useState("");
  const [calling, setCalling] = useState(false);
  const [hangingUp, setHangingUp] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [transcriptMessages, setTranscriptMessages] = useState<ConversationTurnMessage[]>([]);
  const [latestLatency, setLatestLatency] = useState({ stt: 0, llm: 0, tts: 0, turn: 0 });

  const telemetryWsRef = useRef<WebSocket | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadData();
    return () => {
      if (telemetryWsRef.current) telemetryWsRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [transcriptMessages]);

  async function loadData() {
    try {
      setLoading(true);
      const [allAgents, availableRes, twilioRes] = await Promise.all([
        fetchApi<AgentConfig[]>("/agents"),
        fetchApi<AvailableAgentsResponse>("/agents/available"),
        fetchApi<TwilioConfig | null>("/twilio/configuration").catch(() => null)
      ]);
      setAgents(allAgents);
      setAvailableData(availableRes);
      setTwilioConfig(twilioRes);
      if (twilioRes?.phone_number) {
        const nums = twilioRes.phone_number.split(",").map((n) => n.trim()).filter(Boolean);
        if (nums.length > 0) setSelectedFromNumber(nums[0]);
      }
    } catch (err: any) {
      console.error("Error loading agents:", err);
      setStatusMessage({ type: "error", text: "Failed to load agent library." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAgent(agent: AgentConfig, activate: boolean) {
    try {
      setStatusMessage(null);
      if (activate) agent.status = "ACTIVE";

      if (agent.agent_id && agents.some((a) => a.agent_id === agent.agent_id)) {
        await fetchApi<AgentConfig>(`/agents/${agent.agent_id}`, {
          method: "PUT",
          body: JSON.stringify(agent)
        });
        setStatusMessage({ type: "success", text: `Agent "${agent.name}" updated successfully (Version incremented).` });
      } else {
        await fetchApi<AgentConfig>("/agents", {
          method: "POST",
          body: JSON.stringify(agent)
        });
        setStatusMessage({ type: "success", text: `Agent "${agent.name}" created successfully!` });
      }
      await loadData();
    } catch (err: any) {
      throw new Error(err.message || "Failed to save agent.");
    }
  }

  async function handleDuplicate(agent: AgentConfig) {
    try {
      setStatusMessage(null);
      const duplicated = await fetchApi<AgentConfig>(`/agents/${agent.agent_id}/duplicate`, {
        method: "POST"
      });
      setStatusMessage({ type: "success", text: `Duplicated "${agent.name}" as "${duplicated.name}" into your organization!` });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Duplication failed: ${err.message}` });
    }
  }

  async function handleToggleStatus(agent: AgentConfig) {
    try {
      setStatusMessage(null);
      const action = agent.status === "ACTIVE" ? "deactivate" : "activate";
      await fetchApi<AgentConfig>(`/agents/${agent.agent_id}/${action}`, {
        method: "POST"
      });
      setStatusMessage({ type: "success", text: `Agent "${agent.name}" status updated to ${action === "activate" ? "Active" : "Inactive"}.` });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    }
  }

  async function confirmArchiveAgent() {
    if (!agentToArchive) return;
    try {
      setIsArchiving(true);
      setStatusMessage(null);
      await fetchApi<AgentConfig>(`/agents/${agentToArchive.agent_id}/archive`, {
        method: "POST"
      });
      setStatusMessage({ type: "success", text: `Agent "${agentToArchive.name}" archived successfully.` });
      toast.success(`Agent "${agentToArchive.name}" archived successfully.`);
      setAgentToArchive(null);
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
      toast.error(err.message || "Failed to archive agent.");
    } finally {
      setIsArchiving(false);
    }
  }

  async function confirmDeleteAgent() {
    if (!agentToDelete) return;
    try {
      setIsDeleting(true);
      setStatusMessage(null);
      await fetchApi(`/agents/${agentToDelete.agent_id}`, {
        method: "DELETE"
      });
      setStatusMessage({ type: "success", text: `Agent "${agentToDelete.name}" permanently deleted.` });
      toast.success(`Agent "${agentToDelete.name}" deleted permanently.`);
      setAgentToDelete(null);
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
      toast.error(err.message || "Failed to delete agent.");
    } finally {
      setIsDeleting(false);
    }
  }

  function openTestModal(agent: AgentConfig) {
    setTestAgent(agent);
    setTranscriptMessages([]);
    setLatestLatency({ stt: 0, llm: 0, tts: 0, turn: 0 });
    setTestModalOpen(true);
  }

  async function startTestCall() {
    if (!testAgent) return;
    if (!testPhoneNumber.trim()) {
      setStatusMessage({ type: "error", text: "Please enter a test destination phone number." });
      return;
    }

    try {
      setCalling(true);
      setStatusMessage(null);
      setTranscriptMessages([]);

      const res = await fetchApi<{ call_session_id: string; call_sid: string }>("/voice/test-call", {
        method: "POST",
        body: JSON.stringify({
          to_number: testPhoneNumber.trim(),
          from_number: selectedFromNumber,
          agent_id: testAgent.agent_id,
          agent_config_override: testAgent
        })
      });

      setActiveSessionId(res.call_session_id);
      setActiveCallSid(res.call_sid);
      connectTelemetryStream(res.call_session_id);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Test Call failed: ${err.message}` });
      setCalling(false);
    }
  }

  async function hangupTestCall() {
    try {
      setHangingUp(true);
      await fetchApi("/voice/hangup", {
        method: "POST",
        body: JSON.stringify({
          call_session_id: activeSessionId,
          call_sid: activeCallSid
        })
      });
    } catch (err) {
      console.warn("Hangup call warning:", err);
    } finally {
      setHangingUp(false);
      setCalling(false);
      if (telemetryWsRef.current) telemetryWsRef.current.close();
    }
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
            { role: "user", content: event.payload.content, stt_latency_ms: event.payload.stt_latency_ms }
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
              turn_latency_ms: event.payload.turn_latency_ms
            }
          ]);
          setLatestLatency((prev) => ({
            ...prev,
            llm: event.payload.llm_latency_ms || prev.llm,
            tts: event.payload.tts_latency_ms || prev.tts,
            turn: event.payload.turn_latency_ms || prev.turn
          }));
        } else if (event.event_type === "CallEnded") {
          setCalling(false);
        }
      } catch (err) { }
    };

    telemetryWsRef.current = ws;
  }

  // Filtered collections
  const myAgentsList = agents.filter((a) => {
    const isOrg = a.scope === "ORGANIZATION" || (a.organization_id && a.organization_id !== "global" && a.scope !== "GLOBAL");
    if (!isOrg) return false;
    if (statusFilter !== "ALL" && a.status.toUpperCase() !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        (a.voice?.voice && a.voice.voice.toLowerCase().includes(q)) ||
        (a.llm?.model && a.llm.model.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const defaultAgentsList = agents.filter((a) => {
    const isGlobal = a.scope === "GLOBAL" || a.organization_id === "global";
    if (!isGlobal) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        (a.voice?.voice && a.voice.voice.toLowerCase().includes(q)) ||
        (a.llm?.model && a.llm.model.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const myColumns: Column<AgentConfig>[] = [
    {
      key: "name",
      header: "Agent",
      sortable: true,
      render: (a) => (
        <div>
          <div className="font-semibold text-xs text-[var(--color-heading)] flex items-center gap-1.5">
            <span>{a.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">v{a.version || 1}</span>
          </div>
          {a.description && (
            <p className="text-[11px] text-[var(--color-muted)] truncate max-w-[220px] mt-0.5">{a.description}</p>
          )}
        </div>
      )
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (a) => <span className="text-xs text-[var(--color-text)]">{a.role}</span>
    },
    {
      key: "voice",
      header: "Voice (TTS)",
      render: (a) => (
        <span className="font-mono text-[11px] text-[var(--color-muted)]">{a.voice?.voice || "aura-orion-en"}</span>
      )
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (a) => (
        <StatusIndicator
          status={a.status.toLowerCase()}
          label={a.status}
          pulse={a.status.toUpperCase() === "ACTIVE"}
        />
      )
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (a) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedAgentDetail(a)}
            leftIcon={<FileText className="w-3.5 h-3.5" />}
            className="h-7 px-2 text-xs"
          >
            Inspect
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewDrawerAgent(a)}
            leftIcon={<Radio className="w-3.5 h-3.5 text-[var(--color-primary)]" />}
            className="h-7 px-2.5 text-xs text-[var(--color-primary)] font-medium border-[var(--color-primary)]/40 hover:bg-[var(--color-primary-light)]"
            title="Test in-browser with live microphone without making a phone call"
          >
            Live Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openTestModal(a)}
            leftIcon={<Play className="w-3.5 h-3.5 text-emerald-500" />}
            className="h-7 px-2 text-xs"
          >
            Test Call
          </Button>
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openStudioWithTransition(a, `Opening ${a.name}...`)}
                leftIcon={<Edit className="w-3.5 h-3.5" />}
                className="h-7 px-2 text-xs"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleStatus(a)}
                className={`h-7 px-2 text-xs ${a.status.toUpperCase() === "ACTIVE"
                  ? "text-[var(--color-muted)] hover:text-amber-500"
                  : "text-[var(--color-success)]"
                  }`}
              >
                {a.status.toUpperCase() === "ACTIVE" ? "Deactivate" : "Activate"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAgentToArchive(a)}
                leftIcon={<Archive className="w-3.5 h-3.5 text-amber-500" />}
                className="h-7 px-2 text-xs text-amber-500 hover:bg-amber-500/10"
                title="Archive agent"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAgentToDelete(a)}
                leftIcon={<Trash2 className="w-3.5 h-3.5 text-[var(--color-danger)]" />}
                className="h-7 px-2 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                title="Delete agent permanently"
              />
            </>
          )}
        </div>
      )
    }
  ];

  const defaultColumns: Column<AgentConfig>[] = [
    {
      key: "name",
      header: "Platform Agent",
      sortable: true,
      render: (a) => (
        <div>
          <div className="font-semibold text-xs text-[var(--color-heading)] flex items-center gap-1.5">
            <span>{a.name}</span>
            <Badge variant="primary" size="sm">Platform</Badge>
          </div>
          {a.description && (
            <p className="text-[11px] text-[var(--color-muted)] truncate max-w-[240px] mt-0.5">{a.description}</p>
          )}
        </div>
      )
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (a) => <span className="text-xs text-[var(--color-text)]">{a.role}</span>
    },
    {
      key: "voice",
      header: "Voice (TTS)",
      render: (a) => (
        <span className="font-mono text-[11px] text-[var(--color-muted)]">{a.voice?.voice || "aura-orion-en"}</span>
      )
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (a) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedAgentDetail(a)}
            leftIcon={<FileText className="w-3.5 h-3.5" />}
            className="h-7 px-2 text-xs"
          >
            Inspect
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewDrawerAgent(a)}
            leftIcon={<Radio className="w-3.5 h-3.5 text-[var(--color-primary)]" />}
            className="h-7 px-2.5 text-xs text-[var(--color-primary)] font-medium border-[var(--color-primary)]/40 hover:bg-[var(--color-primary-light)]"
            title="Test in-browser with live microphone without making a phone call"
          >
            Live Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openTestModal(a)}
            leftIcon={<Play className="w-3.5 h-3.5 text-emerald-500" />}
            className="h-7 px-2 text-xs"
          >
            Test Call
          </Button>
        </div>
      )
    }
  ];

  if (isOpeningStudio) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-5 animate-fade-in text-center max-w-md mx-auto">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 flex items-center justify-center animate-pulse-glow shadow-md">
            <Bot className="w-8 h-8 text-[var(--color-primary)] animate-bounce" />
          </div>
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--color-primary)] flex items-center justify-center animate-spin-slow shadow-xs">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
        </div>
        
        <div className="space-y-1.5 w-full">
          <h3 className="text-sm font-bold text-[var(--color-heading)] tracking-tight">
            {openingActionLabel}
          </h3>
          <p className="text-xs text-[var(--color-muted)]">
            Synthesizing conversational canvas & telephony speech models...
          </p>

          {/* Smooth 2-second Progress Bar */}
          <div className="w-52 h-1.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-full overflow-hidden mx-auto mt-3">
            <div className="h-full bg-[var(--color-primary)] rounded-full animate-progress" />
          </div>
        </div>
      </div>
    );
  }

  if (editorOpen) {
    return (
      <div className="space-y-6">
        <AgentEditorModal
          isOpen={true}
          onClose={() => {
            setEditorOpen(false);
            setEditingAgent(null);
          }}
          initialAgent={editingAgent}
          onSave={async (agent, activate) => {
            await handleSaveAgent(agent, activate);
            setEditorOpen(false);
            setEditingAgent(null);
          }}
          onTestCall={(ag) => openTestModal(ag)}
        />

        {/* Live Test Call Drawer */}
        <Drawer
          isOpen={testModalOpen}
          onClose={() => {
            if (calling) hangupTestCall();
            setTestModalOpen(false);
          }}
          title={`Live Test Call: ${testAgent?.name || "Agent"}`}
          description="Verify spoken greeting, STT/LLM turns, voice synthesis, and latency live."
          size="md"
        >
          {testAgent && (
            <div className="space-y-4 text-left text-xs">
              <div className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Voice:</span>
                  <span className="font-mono font-medium text-[var(--color-heading)]">{testAgent.voice?.voice}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Model:</span>
                  <span className="font-mono font-medium text-[var(--color-heading)]">{testAgent.llm?.model}</span>
                </div>
              </div>

              {!calling ? (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-heading)] mb-1">
                      Your Phone Number (To receive call) <span className="text-[var(--color-danger)]">*</span>
                    </label>
                    <input
                      type="tel"
                      value={testPhoneNumber}
                      onChange={(e) => setTestPhoneNumber(e.target.value)}
                      placeholder="+1234567890"
                      className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-mono"
                    />
                  </div>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={startTestCall}
                    disabled={!testPhoneNumber.trim()}
                    leftIcon={<PhoneCall className="w-4 h-4" />}
                    className="w-full cursor-pointer"
                  >
                    Start Real Telephone Test Call
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-[var(--radius-main,0.375rem)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">Live Call Active</span>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={hangupTestCall}
                      disabled={hangingUp}
                      leftIcon={<PhoneOff className="w-3.5 h-3.5" />}
                    >
                      {hangingUp ? "Hanging up..." : "Hang Up"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Drawer>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="AI Voice Agents"
        description="Create, configure, and manage the AI voice agents used by your organization."
        badge={
          <Badge variant="neutral">
            {myAgentsList.length} Org Agents &bull; {defaultAgentsList.length} Platform Defaults
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync
            </Button>
            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => openStudioWithTransition(null, "Initializing AI Voice Studio...")}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                className="cursor-pointer font-semibold shadow-xs"
              >
                Create Agent
              </Button>
            )}
          </div>
        }
      />

      {statusMessage && (
        <Alert
          type={statusMessage.type === "success" ? "success" : "danger"}
          onDismiss={() => setStatusMessage(null)}
        >
          {statusMessage.text}
        </Alert>
      )}

      {/* Filter and Search Controls */}
      <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents by name, role, model..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] placeholder-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-[var(--color-muted)]">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* Section 1: MY AGENTS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-heading)]">My Organization Agents</h2>
          </div>
          <span className="text-xs text-[var(--color-muted)]">{myAgentsList.length} configured</span>
        </div>

        <DataTable
          columns={myColumns}
          data={myAgentsList}
          isLoading={loading}
          loadingMessage="Loading organization voice agents..."
          emptyTitle="No organization agents created yet"
          emptyDescription="Create a tailored AI voice agent or duplicate one of the Platform default agents."
          pagination={true}
          pageSize={10}
        />
      </div>

      {/* Section 2: PLATFORM DEFAULT AGENTS */}
      <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-[var(--color-heading)]">Platform Default Agents (Voice Library)</h2>
          </div>
          <span className="text-xs text-[var(--color-muted)]">Ready-to-use voice agents</span>
        </div>

        <DataTable
          columns={defaultColumns}
          data={defaultAgentsList}
          isLoading={loading}
          loadingMessage="Loading platform default agents..."
          emptyTitle="No platform default agents found"
          emptyDescription="Platform default agents are provisioned automatically."
          pagination={false}
        />
      </div>

      {/* Detail Inspection Drawer */}
      <Drawer
        isOpen={!!selectedAgentDetail}
        onClose={() => setSelectedAgentDetail(null)}
        title={selectedAgentDetail?.name || "Agent Details"}
        description={`${selectedAgentDetail?.role} (v${selectedAgentDetail?.version || 1})`}
        size="md"
      >
        {selectedAgentDetail && (
          <div className="space-y-5 text-left text-xs">
            {/* Status & Scope Banner */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]">
              <div>
                <span className="text-[var(--color-muted)] block text-[11px]">Scope & Type</span>
                <span className="font-medium text-[var(--color-heading)] text-xs mt-0.5 block">
                  {selectedAgentDetail.scope === "GLOBAL" ? "Platform Default" : "Organization Private"}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-muted)] block text-[11px]">Lifecycle Status</span>
                <div className="mt-0.5">
                  <StatusIndicator status={selectedAgentDetail.status.toLowerCase()} label={selectedAgentDetail.status} />
                </div>
              </div>
            </div>

            {/* Objective */}
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-heading)] mb-1">Primary Objective</h4>
              <p className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] text-[var(--color-text)] leading-relaxed">
                {selectedAgentDetail.objective}
              </p>
            </div>

            {/* Spoken Greeting */}
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-heading)] mb-1">Spoken Greeting</h4>
              <p className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] text-[var(--color-heading)] font-mono text-[11px] leading-relaxed italic">
                "{selectedAgentDetail.greeting}"
              </p>
            </div>

            {/* Voice & AI Configuration */}
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-heading)] mb-2">Voice & AI Architecture</h4>
              <div className="p-3 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">TTS Voice:</span>
                  <span className="font-mono font-medium text-[var(--color-heading)]">
                    {selectedAgentDetail.voice?.voice} ({selectedAgentDetail.voice?.speed || 0.95}x)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Conversational LLM:</span>
                  <span className="font-mono font-medium text-[var(--color-heading)]">
                    {selectedAgentDetail.llm?.model} (temp: {selectedAgentDetail.llm?.temperature})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Barge-in / Interruption:</span>
                  <span className="text-[var(--color-text)]">
                    {selectedAgentDetail.runtime?.barge_in_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>

            {/* Personality Profile */}
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-heading)] mb-2">Personality Traits</h4>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(selectedAgentDetail.personality || {}).map(([k, v]) => (
                  <div key={k} className="p-2 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-center">
                    <span className="text-[10px] text-[var(--color-muted)] capitalize block">{k}</span>
                    <span className="font-mono text-xs font-semibold text-[var(--color-primary)] mt-0.5 block">{v}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Enabled Skills */}
            {selectedAgentDetail.skills && selectedAgentDetail.skills.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-heading)] mb-1.5">Enabled Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedAgentDetail.skills.map((s) => (
                    <Badge key={s} variant="neutral" size="sm">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Live Test Call Drawer */}
      <Drawer
        isOpen={testModalOpen}
        onClose={() => {
          if (calling) hangupTestCall();
          setTestModalOpen(false);
        }}
        title={`Live Test Call: ${testAgent?.name || "Agent"}`}
        description="Verify spoken greeting, STT/LLM turns, voice synthesis, and latency live."
        size="md"
      >
        {testAgent && (
          <div className="space-y-4 text-left text-xs">
            <div className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] space-y-2">
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Voice:</span>
                <span className="font-mono font-medium text-[var(--color-heading)]">{testAgent.voice?.voice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Model:</span>
                <span className="font-mono font-medium text-[var(--color-heading)]">{testAgent.llm?.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Status:</span>
                <span className="font-semibold text-emerald-600">{testAgent.status}</span>
              </div>
            </div>

            {/* Phone Inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-heading)] mb-1">
                  Destination Phone Number
                </label>
                <input
                  type="tel"
                  disabled={calling}
                  value={testPhoneNumber}
                  onChange={(e) => setTestPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full h-9 px-3 text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-heading)] mb-1">
                  Caller ID (From Number)
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedFromNumber || twilioConfig?.phone_number || "Default Twilio Number"}
                  className="w-full h-9 px-3 text-xs font-mono bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-muted)] cursor-not-allowed"
                />
              </div>

              {!calling ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={startTestCall}
                  leftIcon={<PhoneCall className="w-4 h-4" />}
                  className="w-full"
                >
                  Place Test Call
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="md"
                  disabled={hangingUp}
                  onClick={hangupTestCall}
                  leftIcon={<PhoneOff className="w-4 h-4" />}
                  className="w-full"
                >
                  {hangingUp ? "Disconnecting..." : "End Test Call"}
                </Button>
              )}
            </div>

            {/* Live Conversation Transcript */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[var(--color-heading)]">Live Spoken Transcript</span>
                {calling && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium animate-pulse">
                    <Radio className="w-3 h-3" /> Live Stream Active
                  </span>
                )}
              </div>

              <div
                ref={transcriptBoxRef}
                className="h-44 overflow-y-auto p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2 text-xs font-sans"
              >
                {transcriptMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[var(--color-muted)] text-[11px]">
                    Waiting for call connection and live conversation turns...
                  </div>
                ) : (
                  transcriptMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                    >
                      <div className="text-[10px] text-[var(--color-muted)] mb-0.5 capitalize">
                        {msg.role === "user" ? "Customer" : testAgent.name}
                      </div>
                      <div
                        className={`p-2.5 rounded-[var(--radius-main,0.375rem)] max-w-[85%] text-xs ${msg.role === "user"
                          ? "bg-[var(--color-primary)] text-white"
                          : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-heading)]"
                          }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Stage Latencies */}
            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              <div className="p-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)]">
                <span className="text-[10px] text-[var(--color-muted)] block">STT</span>
                <span className="font-mono text-xs font-semibold text-[var(--color-heading)]">{latestLatency.stt}ms</span>
              </div>
              <div className="p-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)]">
                <span className="text-[10px] text-[var(--color-muted)] block">LLM</span>
                <span className="font-mono text-xs font-semibold text-[var(--color-heading)]">{latestLatency.llm}ms</span>
              </div>
              <div className="p-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)]">
                <span className="text-[10px] text-[var(--color-muted)] block">TTS</span>
                <span className="font-mono text-xs font-semibold text-[var(--color-heading)]">{latestLatency.tts}ms</span>
              </div>
              <div className="p-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)]">
                <span className="text-[10px] text-[var(--color-muted)] block">Turn</span>
                <span className="font-mono text-xs font-semibold text-[var(--color-primary)]">{latestLatency.turn}ms</span>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* In-Browser Live Preview Playground Drawer (No phone call needed) */}
      <Drawer
        isOpen={!!previewDrawerAgent}
        onClose={() => setPreviewDrawerAgent(null)}
        title={`Live Preview Playground: ${previewDrawerAgent?.name || "Agent"}`}
        description="Speak with your microphone or type messages to test conversational turns, voice, and prompts directly in your browser."
        size="xl"
      >
        {previewDrawerAgent && (
          <div className="space-y-4 text-left">
            <AgentLivePreview agentConfig={previewDrawerAgent} />
          </div>
        )}
      </Drawer>

      {/* Archive Agent Confirmation Modal */}
      <Modal
        isOpen={!!agentToArchive}
        onClose={() => setAgentToArchive(null)}
        title="Archive AI Voice Agent"
        description="Are you sure you want to archive this voice agent configuration?"
        maxWidth="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAgentToArchive(null)}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={isArchiving}
              leftIcon={<Archive className="w-3.5 h-3.5" />}
              onClick={confirmArchiveAgent}
            >
              Archive Agent
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--color-heading)] truncate">
                {agentToArchive?.name} <span className="text-[10px] font-mono text-[var(--color-muted)] font-normal">v{agentToArchive?.version || 1}</span>
              </p>
              <p className="text-[11px] text-[var(--color-muted)] truncate mt-0.5">
                {agentToArchive?.role} • Voice: <span className="font-mono">{agentToArchive?.voice?.voice || "aura"}</span>
              </p>
            </div>
          </div>
          <p className="text-[var(--color-muted)] leading-relaxed">
            Archiving this agent will remove it from active dialing campaigns. Existing call logs and metrics will retain their historical records.
          </p>
        </div>
      </Modal>

      {/* Delete Agent Confirmation Modal */}
      <Modal
        isOpen={!!agentToDelete}
        onClose={() => !isDeleting && setAgentToDelete(null)}
        title="Delete AI Voice Agent Permanently"
        description="This action cannot be undone. Are you sure you want to permanently delete this agent?"
        maxWidth="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAgentToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={isDeleting}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={confirmDeleteAgent}
            >
              Delete Permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-left">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20">
            <div className="w-8 h-8 rounded-full bg-[var(--color-danger)]/20 text-[var(--color-danger)] flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--color-heading)] truncate">
                {agentToDelete?.name} <span className="text-[10px] font-mono text-[var(--color-muted)] font-normal">v{agentToDelete?.version || 1}</span>
              </p>
              <p className="text-[11px] text-[var(--color-muted)] truncate mt-0.5">
                {agentToDelete?.role} • {agentToDelete?.scope || "ORGANIZATION"}
              </p>
            </div>
          </div>
          <p className="text-[var(--color-muted)] leading-relaxed">
            Permanently deleting this agent will remove its voice configuration and prompt instructions from your organization.
          </p>
        </div>
      </Modal>
    </div>
  );
}
