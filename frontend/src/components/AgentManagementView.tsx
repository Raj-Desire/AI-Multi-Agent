import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Trash2,
  Save,
  Power,
  PowerOff
} from "lucide-react";
import { PageHeader } from "./ui/PageHeader";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { StatusIndicator } from "./ui/StatusIndicator";
import { Drawer } from "./ui/Drawer";
import { Modal } from "./ui/Modal";
import { EmptyState } from "./ui/EmptyState";
import { DataTable, Column } from "./ui/DataTable";
import { AgentEditorModal } from "./AgentEditorModal";
import { AgentLivePreview } from "./AgentLivePreview";
import { toast } from "sonner";

interface AgentManagementViewProps {
  onNavigateToDialer?: (agentId: string) => void;
  onEditorDirtyChange?: (isDirty: boolean, handleSaveDraft: () => Promise<void>, handleDiscard: () => void) => void;
}

// Map technical voice IDs to human-readable format: "Athena · English (US)"
const VOICE_DISPLAY_MAP: Record<string, { name: string; locale: string }> = {
  "aura-orion-en": { name: "Orion", locale: "English (US)" },
  "aura-luna-en": { name: "Luna", locale: "English (US)" },
  "aura-asteria-en": { name: "Asteria", locale: "English (US)" },
  "aura-stella-en": { name: "Stella", locale: "English (US)" },
  "aura-arcas-en": { name: "Arcas", locale: "English (US)" },
  "aura-athena-en": { name: "Athena", locale: "English (US)" },
  "aura-hera-en": { name: "Hera", locale: "English (US)" },
  "aura-perseus-en": { name: "Perseus", locale: "English (US)" },
  "aura-angus-en": { name: "Angus", locale: "English (US)" },
  "aura-helios-en": { name: "Helios", locale: "English (US)" },
  "aura-zeus-en": { name: "Zeus", locale: "English (US)" },
  "aura-2-thalia-en": { name: "Thalia", locale: "English (US)" },
  "aura-2-andromeda-en": { name: "Andromeda", locale: "English (US)" },
  "aura-2-apollo-en": { name: "Apollo", locale: "English (US)" },
  "aura-2-agustina-es": { name: "Agustina", locale: "Spanish (ES)" },
  "aura-2-javier-es": { name: "Javier", locale: "Spanish (ES)" },
  "aura-2-aurelia-de": { name: "Aurelia", locale: "German (DE)" },
  "aura-2-agathe-fr": { name: "Agathe", locale: "French (FR)" },
  "aura-2-cesare-it": { name: "Cesare", locale: "Italian (IT)" },
  "aura-2-ama-ja": { name: "Ama", locale: "Japanese (JA)" }
};

function formatVoiceDisplay(rawVoice?: string) {
  if (!rawVoice) return { name: "Standard Voice", locale: "English" };
  if (VOICE_DISPLAY_MAP[rawVoice]) return VOICE_DISPLAY_MAP[rawVoice];
  const parts = rawVoice.replace(/^aura(-2)?-/, "").split("-");
  const name = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : rawVoice;
  const lang = parts[1] === "es" ? "Spanish" : parts[1] === "fr" ? "French" : parts[1] === "de" ? "German" : parts[1] === "it" ? "Italian" : parts[1] === "ja" ? "Japanese" : "English";
  return { name, locale: lang };
}

export function AgentManagementView({ onNavigateToDialer, onEditorDirtyChange }: AgentManagementViewProps) {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [availableData, setAvailableData] = useState<AvailableAgentsResponse>({ my_agents: [], default_agents: [] });
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search and filter states for My Agents
  const [mySearchQuery, setMySearchQuery] = useState("");
  const [myStatusFilter, setMyStatusFilter] = useState<string>("ALL");
  const [myRoleFilter, setMyRoleFilter] = useState<string>("ALL");
  const [myVoiceFilter, setMyVoiceFilter] = useState<string>("ALL");

  // Search state for Platform Templates
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");

  // Action Menu dropdown state (stores agent_id for open menu)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Modals & Drawers
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);
  const [isOpeningStudio, setIsOpeningStudio] = useState(false);
  const [openingActionLabel, setOpeningActionLabel] = useState("Initializing Voice Studio...");
  
  // Unsaved Changes Navigation Confirmation State
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [latestDraftAgent, setLatestDraftAgent] = useState<AgentConfig | null>(null);
  const [showUnsavedConfirmModal, setShowUnsavedConfirmModal] = useState(false);
  const [pendingCloseCallback, setPendingCloseCallback] = useState<(() => void) | null>(null);

  // Template duplicate confirmation modal
  const [templateToUse, setTemplateToUse] = useState<AgentConfig | null>(null);
  const [isUsingTemplate, setIsUsingTemplate] = useState(false);

  // Close more menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setOpenActionMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openStudioWithTransition = (agent: AgentConfig | null, actionLabel?: string) => {
    setOpenActionMenuId(null);
    setOpeningActionLabel(actionLabel || (agent ? `Loading ${agent.name}...` : "Initializing AI Voice Studio..."));
    setIsOpeningStudio(true);
    setTimeout(() => {
      setEditingAgent(agent);
      setLatestDraftAgent(agent);
      setIsEditorDirty(false);
      setIsOpeningStudio(false);
      setEditorOpen(true);
    }, 2200);
  };

  const handleRequestCloseEditor = (onConfirmClose?: () => void) => {
    if (isEditorDirty) {
      setPendingCloseCallback(() => onConfirmClose || (() => {
        setEditorOpen(false);
        setEditingAgent(null);
        setIsEditorDirty(false);
      }));
      setShowUnsavedConfirmModal(true);
    } else {
      if (onConfirmClose) {
        onConfirmClose();
      } else {
        setEditorOpen(false);
        setEditingAgent(null);
      }
    }
  };

  const handleSaveDraftAndLeave = React.useCallback(async () => {
    if (!latestDraftAgent) {
      setShowUnsavedConfirmModal(false);
      if (pendingCloseCallback) pendingCloseCallback();
      return;
    }
    try {
      const draftToSave: AgentConfig = {
        ...latestDraftAgent,
        name: latestDraftAgent.name?.trim() ? latestDraftAgent.name : "Untitled Draft Agent",
        status: "DRAFT"
      };
      await handleSaveAgent(draftToSave, false);
      toast.success("Draft saved successfully!");
      setShowUnsavedConfirmModal(false);
      setIsEditorDirty(false);
      if (pendingCloseCallback) {
        pendingCloseCallback();
      } else {
        setEditorOpen(false);
        setEditingAgent(null);
      }
    } catch (err: any) {
      toast.error(`Failed to save draft: ${err.message}`);
    }
  }, [latestDraftAgent, pendingCloseCallback]);

  const handleDiscardAndLeave = React.useCallback(() => {
    setShowUnsavedConfirmModal(false);
    setIsEditorDirty(false);
    toast.info("Unsaved agent changes discarded.");
    if (pendingCloseCallback) {
      pendingCloseCallback();
    } else {
      setEditorOpen(false);
      setEditingAgent(null);
    }
  }, [pendingCloseCallback]);

  useEffect(() => {
    onEditorDirtyChange?.(
      editorOpen && isEditorDirty,
      handleSaveDraftAndLeave,
      handleDiscardAndLeave
    );
  }, [editorOpen, isEditorDirty, onEditorDirtyChange, handleSaveDraftAndLeave, handleDiscardAndLeave]);

  const [selectedAgentDetail, setSelectedAgentDetail] = useState<AgentConfig | null>(null);
  const [previewDrawerAgent, setPreviewDrawerAgent] = useState<AgentConfig | null>(null);
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
      setFetchError(null);
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
      setFetchError("Unable to retrieve your AI voice agents right now. Please check your connection and try again.");
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
        toast.success(`Agent "${agent.name}" updated successfully.`);
      } else {
        await fetchApi<AgentConfig>("/agents", {
          method: "POST",
          body: JSON.stringify(agent)
        });
        setStatusMessage({ type: "success", text: `Agent "${agent.name}" created successfully!` });
        toast.success(`Agent "${agent.name}" created successfully!`);
      }
      await loadData();
    } catch (err: any) {
      throw new Error(err.message || "Failed to save agent.");
    }
  }

  async function handleDuplicate(agent: AgentConfig) {
    try {
      setStatusMessage(null);
      setIsUsingTemplate(true);
      const duplicated = await fetchApi<AgentConfig>(`/agents/${agent.agent_id}/duplicate`, {
        method: "POST"
      });
      setStatusMessage({ type: "success", text: `Created "${duplicated.name}" into your organization!` });
      toast.success(`Created agent "${duplicated.name}" from template.`);
      setTemplateToUse(null);
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Creation from template failed: ${err.message}` });
      toast.error(`Template initialization failed: ${err.message}`);
    } finally {
      setIsUsingTemplate(false);
    }
  }

  async function handleToggleStatus(agent: AgentConfig) {
    try {
      setStatusMessage(null);
      const action = agent.status.toUpperCase() === "ACTIVE" ? "deactivate" : "activate";
      await fetchApi<AgentConfig>(`/agents/${agent.agent_id}/${action}`, {
        method: "POST"
      });
      const newStatus = action === "activate" ? "Active" : "Inactive";
      setStatusMessage({ type: "success", text: `Agent "${agent.name}" is now ${newStatus}.` });
      toast.success(`Agent "${agent.name}" is now ${newStatus}.`);
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
      toast.error(err.message || "Failed to update status.");
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
    setOpenActionMenuId(null);
    setTestAgent(agent);
    setTranscriptMessages([]);
    setLatestLatency({ stt: 0, llm: 0, tts: 0, turn: 0 });
    setTestModalOpen(true);
  }

  function sanitizePhoneNumber(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    const hasLeadingPlus = trimmed.startsWith("+");
    const digitsOnly = trimmed.replace(/\D/g, "");
    return hasLeadingPlus ? `+${digitsOnly}` : (digitsOnly ? `+${digitsOnly}` : "");
  }

  async function startTestCall() {
    if (!testAgent) return;
    const cleanNumber = sanitizePhoneNumber(testPhoneNumber);
    if (!cleanNumber || cleanNumber.length < 7) {
      const err = "Please enter a valid destination phone number with country code (e.g., +15551234567 or +919876543210).";
      setStatusMessage({ type: "error", text: err });
      toast.error(err);
      return;
    }

    const fromNum = selectedFromNumber || (twilioConfig?.phone_number ? twilioConfig.phone_number.split(",")[0].trim() : "");

    try {
      setCalling(true);
      setStatusMessage(null);
      setTranscriptMessages([]);

      const res = await fetchApi<{ call_session_id: string; call_sid: string }>("/voice/test-call", {
        method: "POST",
        body: JSON.stringify({
          to_number: cleanNumber,
          from_number: fromNum,
          agent_id: testAgent.agent_id,
          agent_config_override: testAgent
        })
      });

      setActiveSessionId(res.call_session_id);
      setActiveCallSid(res.call_sid);
      toast.success("Placing test call to " + cleanNumber + "...");
      connectTelemetryStream(res.call_session_id);
    } catch (err: any) {
      const msg = err.message || "Failed to initiate test call. Check your Twilio credentials and destination number.";
      setStatusMessage({ type: "error", text: `Test Call failed: ${msg}` });
      toast.error(msg);
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

  // Extract unique Roles and Voices from organization agents for smart filtering
  const myOrgAgents = useMemo(() => {
    return agents.filter((a: AgentConfig) => a.scope === "ORGANIZATION" || (a.organization_id && a.organization_id !== "global" && a.scope !== "GLOBAL"));
  }, [agents]);

  const uniqueRoles = useMemo(() => {
    const set = new Set<string>();
    myOrgAgents.forEach((a: AgentConfig) => { if (a.role) set.add(a.role); });
    return Array.from(set);
  }, [myOrgAgents]);

  const uniqueVoices = useMemo(() => {
    const map = new Map<string, string>();
    myOrgAgents.forEach((a: AgentConfig) => {
      if (a.voice?.voice) {
        const vInfo = formatVoiceDisplay(a.voice.voice);
        map.set(a.voice.voice, vInfo.name);
      }
    });
    return Array.from(map.entries());
  }, [myOrgAgents]);

  const isAnyMyFilterActive = mySearchQuery.trim() !== "" || myStatusFilter !== "ALL" || myRoleFilter !== "ALL" || myVoiceFilter !== "ALL";

  const clearMyFilters = () => {
    setMySearchQuery("");
    setMyStatusFilter("ALL");
    setMyRoleFilter("ALL");
    setMyVoiceFilter("ALL");
  };

  // Filtered collections
  const myAgentsList = useMemo(() => {
    return myOrgAgents.filter((a: AgentConfig) => {
      if (myStatusFilter !== "ALL" && a.status.toUpperCase() !== myStatusFilter) return false;
      if (myRoleFilter !== "ALL" && a.role !== myRoleFilter) return false;
      if (myVoiceFilter !== "ALL" && a.voice?.voice !== myVoiceFilter) return false;
      if (mySearchQuery.trim()) {
        const q = mySearchQuery.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)) ||
          (a.voice?.voice && a.voice.voice.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [myOrgAgents, myStatusFilter, myRoleFilter, myVoiceFilter, mySearchQuery]);

  const defaultAgentsList = useMemo(() => {
    const list = agents.filter((a: AgentConfig) => a.scope === "GLOBAL" || a.organization_id === "global");
    if (!templateSearchQuery.trim()) return list;
    const q = templateSearchQuery.toLowerCase();
    return list.filter((a: AgentConfig) =>
      a.name.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      (a.description && a.description.toLowerCase().includes(q)) ||
      (a.voice?.voice && a.voice.voice.toLowerCase().includes(q))
    );
  }, [agents, templateSearchQuery]);

  // Columns for My Organization Agents
  const myColumns: Column<AgentConfig>[] = [
    {
      key: "name",
      header: "Agent",
      sortable: true,
      render: (a) => (
        <div className="min-w-0 max-w-[280px]">
          <div className="font-semibold text-xs text-[var(--color-heading)] flex items-center gap-1.5 truncate">
            <span className="truncate whitespace-nowrap">{a.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-muted)] shrink-0 px-1 py-0.2 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border)]">v{a.version || 1}</span>
          </div>
          {a.description && (
            <p className="text-[11px] text-[var(--color-muted)] truncate whitespace-nowrap mt-0.5" title={a.description}>
              {a.description}
            </p>
          )}
        </div>
      )
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (a) => <span className="text-xs text-[var(--color-text)] whitespace-nowrap">{a.role}</span>
    },
    {
      key: "voice",
      header: "Voice",
      sortable: true,
      render: (a) => {
        const v = formatVoiceDisplay(a.voice?.voice);
        return (
          <div className="flex flex-col text-xs" title={`Voice Model: ${a.voice?.voice || "aura"}`}>
            <span className="font-medium text-[var(--color-heading)] flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-[var(--color-primary)] opacity-70" />
              {v.name}
            </span>
            <span className="text-[10px] text-[var(--color-muted)] font-mono">{v.locale}</span>
          </div>
        );
      }
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (a) => {
        const isActive = a.status.toUpperCase() === "ACTIVE";
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-[var(--color-surface)] border-[var(--color-border)]">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
            <span className={isActive ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-[var(--color-muted)]"}>
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>
        );
      }
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (a, rowIdx) => {
        const isMenuOpen = openActionMenuId === a.agent_id;
        const isActive = a.status.toUpperCase() === "ACTIVE";
        // Flip menu upwards if it is near the bottom of the table list to avoid any scroll cutoff
        const isBottomRow = (rowIdx ?? 0) >= Math.max(0, myAgentsList.length - 2);

        return (
          <div className="inline-flex items-center justify-end gap-1.5 py-0.5">
            {/* Action 1: View Configuration */}
            <button
              type="button"
              onClick={() => setSelectedAgentDetail(a)}
              className="w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)] transition-all cursor-pointer shadow-2xs"
              title="Inspect Agent Configuration"
              aria-label="Inspect Configuration"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>

            {/* Action 2: Live Browser Mic Preview */}
            <button
              type="button"
              onClick={() => setPreviewDrawerAgent(a)}
              className="w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-main,0.375rem)] border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15 transition-all cursor-pointer shadow-2xs"
              title="Live Browser Voice Preview (Mic & Speaker)"
              aria-label="Live Voice Preview"
            >
              <Radio className="w-3.5 h-3.5" />
            </button>

            {/* Action 3: Live Outbound Telephone Test Call */}
            <button
              type="button"
              onClick={() => openTestModal(a)}
              className="h-7 px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-[var(--radius-main,0.375rem)] border border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 transition-all cursor-pointer shadow-2xs"
              title="Place Outbound Telephone Test Call"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Test</span>
            </button>

            {/* Action 4: Edit in Studio */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => openStudioWithTransition(a, `Opening ${a.name}...`)}
                className="h-7 px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-heading)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)] transition-all cursor-pointer shadow-2xs"
                title="Edit Agent Configuration in Studio"
              >
                <Edit className="w-3 h-3" />
                <span>Edit</span>
              </button>
            )}

            {/* Action 5: Power Toggle */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleToggleStatus(a)}
                className={`w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer shadow-2xs ${
                  isActive
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-amber-500/15 hover:text-amber-500 hover:border-amber-500/30"
                    : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:bg-emerald-500/15 hover:text-emerald-500 hover:border-emerald-500/30"
                }`}
                title={isActive ? "Agent is Active (Click to Deactivate)" : "Agent is Inactive (Click to Activate)"}
                aria-label={isActive ? "Deactivate Agent" : "Activate Agent"}
              >
                {isActive ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Action 6: Duplicate */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleDuplicate(a)}
                className="w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)] transition-all cursor-pointer shadow-2xs"
                title="Duplicate Agent"
                aria-label="Duplicate Agent"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Action 7: Delete */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setAgentToDelete(a)}
                className="w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-main,0.375rem)] border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/15 transition-all cursor-pointer shadow-2xs"
                title="Delete Agent Permanently"
                aria-label="Delete Agent"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      }
    }
  ];

  // Columns for Platform Agent Templates
  const defaultColumns: Column<AgentConfig>[] = [
    {
      key: "name",
      header: "Agent Template",
      sortable: true,
      render: (a) => (
        <div className="min-w-0 max-w-[280px]">
          <div className="font-semibold text-xs text-[var(--color-heading)] flex items-center gap-1.5 truncate">
            <span className="truncate whitespace-nowrap">{a.name}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] shrink-0">
              Template
            </span>
          </div>
          {a.description && (
            <p className="text-[11px] text-[var(--color-muted)] truncate whitespace-nowrap mt-0.5" title={a.description}>
              {a.description}
            </p>
          )}
        </div>
      )
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (a) => <span className="text-xs text-[var(--color-text)] whitespace-nowrap">{a.role}</span>
    },
    {
      key: "voice",
      header: "Default Voice",
      sortable: true,
      render: (a) => {
        const v = formatVoiceDisplay(a.voice?.voice);
        return (
          <div className="flex flex-col text-xs" title={`Default Voice: ${a.voice?.voice || "aura"}`}>
            <span className="font-medium text-[var(--color-heading)] flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-[var(--color-primary)] opacity-70" />
              {v.name}
            </span>
            <span className="text-[10px] text-[var(--color-muted)] font-mono">{v.locale}</span>
          </div>
        );
      }
    },
    {
      key: "status",
      header: "Type",
      render: () => (
        <Badge variant="neutral" size="sm" className="font-medium text-[11px]">
          Built-in
        </Badge>
      )
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (a) => (
        <div className="inline-flex items-center justify-end gap-1.5 py-0.5">
          <button
            type="button"
            onClick={() => setSelectedAgentDetail(a)}
            className="w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)] transition-all cursor-pointer shadow-2xs"
            title="Inspect Template Configuration"
            aria-label="Inspect Template"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPreviewDrawerAgent(a)}
            className="w-7 h-7 inline-flex items-center justify-center rounded-[var(--radius-main,0.375rem)] border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15 transition-all cursor-pointer shadow-2xs"
            title="Test in Browser (Microphone Preview)"
            aria-label="Live Preview Template"
          >
            <Radio className="w-3.5 h-3.5" />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTemplateToUse(a)}
              className="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition-all cursor-pointer shadow-xs"
              title="Create Agent from Template into your Organization"
            >
              <Copy className="w-3 h-3" />
              <span>Use Template</span>
            </button>
          )}
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

          <div className="w-52 h-1.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-full overflow-hidden mx-auto mt-3">
            <div className="h-full bg-[var(--color-primary)] animate-pulse rounded-full w-3/4" />
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
          onClose={() => handleRequestCloseEditor()}
          initialAgent={editingAgent}
          onDirtyChange={(isDirty, currentAgent) => {
            setIsEditorDirty(isDirty);
            setLatestDraftAgent(currentAgent);
          }}
          onSave={async (agent, activate) => {
            await handleSaveAgent(agent, activate);
            setIsEditorDirty(false);
            setEditorOpen(false);
            setEditingAgent(null);
          }}
          onTestCall={(ag) => openTestModal(ag)}
        />

        {/* Unsaved Changes Confirmation Modal */}
        <Modal
          isOpen={showUnsavedConfirmModal}
          onClose={() => setShowUnsavedConfirmModal(false)}
          title="Unsaved Agent Configuration"
          maxWidth="sm"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[var(--color-warning-subtle)] border border-[var(--color-warning)]/30 rounded-[var(--radius-main,0.375rem)] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[var(--color-heading)]">
                  You have unsaved changes on "{latestDraftAgent?.name || "Agent"}"
                </p>
                <p className="text-[var(--color-muted)] leading-relaxed">
                  Do you want to save this as a draft before leaving, or discard your current edits?
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUnsavedConfirmModal(false)}
                className="w-full sm:w-auto cursor-pointer"
              >
                Keep Editing
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDiscardAndLeave}
                className="w-full sm:w-auto cursor-pointer"
              >
                Discard &amp; Exit
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveDraftAndLeave}
                leftIcon={<Save className="w-3.5 h-3.5" />}
                className="w-full sm:w-auto cursor-pointer font-semibold"
              >
                Save Draft &amp; Exit
              </Button>
            </div>
          </div>
        </Modal>

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
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)] text-left">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--color-heading)]">
            AI Voice Agents
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-muted)] mt-1">
            Configure, test, and manage your organization's AI voice agents.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />}
            title="Refresh agents list"
          >
            Sync
          </Button>
          {isAdmin && (
            <Button
              variant="primary"
              size="md"
              onClick={() => openStudioWithTransition(null, "Initializing AI Voice Studio...")}
              leftIcon={<Plus className="w-4 h-4" />}
              className="cursor-pointer font-semibold shadow-xs"
            >
              Create AI Agent
            </Button>
          )}
        </div>
      </div>

      {statusMessage && (
        <Alert
          type={statusMessage.type === "success" ? "success" : "danger"}
          onDismiss={() => setStatusMessage(null)}
        >
          {statusMessage.text}
        </Alert>
      )}

      {/* Global Error State */}
      {fetchError && (
        <div className="p-6 border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-[var(--radius-main,0.375rem)] text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mx-auto" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-heading)]">Unable to load AI agents</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">{fetchError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Try Again
          </Button>
        </div>
      )}

      {/* SECTION 1: MY AI AGENTS */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[var(--color-primary)]" />
              <h2 className="text-sm font-bold text-[var(--color-heading)]">My AI Agents</h2>
              <span className="text-xs text-[var(--color-muted)] font-normal">({myOrgAgents.length})</span>
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              AI voice agents created and managed by your organization.
            </p>
          </div>
        </div>

        {/* Search & Multifacet Filters Bar */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              type="text"
              value={mySearchQuery}
              onChange={(e) => setMySearchQuery(e.target.value)}
              placeholder="Search agents..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] placeholder-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end text-xs">
            {/* Status Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[var(--color-muted)] text-[11px]">Status:</span>
              <select
                value={myStatusFilter}
                onChange={(e) => setMyStatusFilter(e.target.value)}
                className="h-8 px-2 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>

            {/* Role Filter (if roles exist) */}
            {uniqueRoles.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[var(--color-muted)] text-[11px]">Role:</span>
                <select
                  value={myRoleFilter}
                  onChange={(e) => setMyRoleFilter(e.target.value)}
                  className="h-8 px-2 text-xs max-w-[140px] truncate bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="ALL">All Roles</option>
                  {uniqueRoles.map((r: string) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Voice Filter (if voices exist) */}
            {uniqueVoices.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[var(--color-muted)] text-[11px]">Voice:</span>
                <select
                  value={myVoiceFilter}
                  onChange={(e) => setMyVoiceFilter(e.target.value)}
                  className="h-8 px-2 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="ALL">All Voices</option>
                  {uniqueVoices.map(([id, name]: [string, string]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Clear Filters button */}
            {isAnyMyFilterActive && (
              <button
                type="button"
                onClick={clearMyFilters}
                className="text-[11px] text-[var(--color-primary)] hover:underline cursor-pointer font-medium px-1"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Data Table with Empty State & Skeleton */}
        {myOrgAgents.length === 0 && !loading ? (
          <EmptyState
            icon={<Bot className="w-6 h-6 text-[var(--color-primary)]" />}
            title="No AI agents yet"
            description="Create your first AI voice agent from scratch or start from one of the platform templates below."
            action={
              <div className="flex items-center gap-2 justify-center mt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => openStudioWithTransition(null, "Initializing AI Voice Studio...")}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Create AI Agent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const el = document.getElementById("platform-templates-section");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                >
                  Browse Templates
                </Button>
              </div>
            }
          />
        ) : (
          <DataTable
            columns={myColumns}
            data={myAgentsList}
            isLoading={loading}
            loadingMessage="Loading organization voice agents..."
            emptyTitle="No matching agents found"
            emptyDescription="Try adjusting your search query or status/role filters."
            pagination={myAgentsList.length > 10}
            pageSize={10}
          />
        )}
      </div>

      {/* SECTION 2: PLATFORM AGENT TEMPLATES */}
      <div id="platform-templates-section" className="space-y-3 pt-6 border-t border-[var(--color-border)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-[var(--color-heading)]">Platform Agent Templates</h2>
              <span className="text-xs text-[var(--color-muted)] font-normal">({defaultAgentsList.length})</span>
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Ready-to-use AI agents provided by the platform.
            </p>
          </div>
        </div>

        {/* Template Search Bar */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              type="text"
              value={templateSearchQuery}
              onChange={(e) => setTemplateSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] placeholder-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          {templateSearchQuery && (
            <button
              type="button"
              onClick={() => setTemplateSearchQuery("")}
              className="text-[11px] text-[var(--color-primary)] hover:underline cursor-pointer font-medium"
            >
              Clear
            </button>
          )}
        </div>

        <DataTable
          columns={defaultColumns}
          data={defaultAgentsList}
          isLoading={loading}
          loadingMessage="Loading platform agent templates..."
          emptyTitle="No platform templates matching query"
          emptyDescription="Try clearing your search keyword."
          pagination={false}
        />
      </div>

      {/* Use Template Confirmation Modal */}
      <Modal
        isOpen={!!templateToUse}
        onClose={() => setTemplateToUse(null)}
        title="Create Agent from Template"
        description="Creates a customizable copy of this platform template in your organization."
        maxWidth="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTemplateToUse(null)}
              disabled={isUsingTemplate}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isUsingTemplate}
              leftIcon={<Copy className="w-3.5 h-3.5" />}
              onClick={() => templateToUse && handleDuplicate(templateToUse)}
            >
              Create Agent
            </Button>
          </>
        }
      >
        {templateToUse && (
          <div className="space-y-3 text-xs text-left">
            <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-1.5">
              <div className="font-semibold text-xs text-[var(--color-heading)]">{templateToUse.name}</div>
              <div className="text-[11px] text-[var(--color-muted)]">{templateToUse.role}</div>
              <div className="text-[11px] text-[var(--color-text)] italic pt-1 border-t border-[var(--color-border)]">
                "{templateToUse.greeting}"
              </div>
            </div>
            <p className="text-[var(--color-muted)] leading-relaxed">
              This will create a new editable agent in your <strong>My AI Agents</strong> catalog pre-configured with this template's conversational flows, voice settings, and system prompt.
            </p>
          </div>
        )}
      </Modal>

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
                  {selectedAgentDetail.scope === "GLOBAL" ? "Platform Template" : "Organization Private"}
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
                    <span className="font-mono font-semibold text-xs text-[var(--color-heading)]">{v}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Enabled Capabilities */}
            {selectedAgentDetail.skills && selectedAgentDetail.skills.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-heading)] mb-2">Capabilities</h4>
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

      {/* Delete Agent Confirmation Modal */}
      <Modal
        isOpen={!!agentToDelete}
        onClose={() => setAgentToDelete(null)}
        title="Delete AI Voice Agent Permanently"
        description={`Are you sure you want to delete "${agentToDelete?.name}"? This action cannot be undone.`}
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
              Delete Agent
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-left">
          <div className="p-3 bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/20 rounded-[var(--radius-main,0.375rem)] text-[var(--color-danger)]">
            Warning: All active configurations for <strong>{agentToDelete?.name}</strong> will be permanently removed.
          </div>
        </div>
      </Modal>
    </div>
  );
}
