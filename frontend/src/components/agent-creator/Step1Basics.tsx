import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Check, Info, Bot, Compass, Plus, Layers, Sliders, ArrowRight, Network, GitBranch, Cpu, X, AlertTriangle, Search, Users } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { AGENT_PURPOSES, AgentPurposeItem } from "./constants";
import { AgentConfig } from "../../types";
import { fetchApi } from "../../api-client";

interface Step1BasicsProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
  selectedPurposeId: string;
  setSelectedPurposeId: (id: string) => void;
  showValidationErrors?: boolean;
}

type CreationMode = "prebuilt" | "custom" | "orchestrator";

interface ChildAgentOption {
  agent_id: string;
  name: string;
  role?: string;
  agent_entity_scope?: string;
}

interface IntentRule {
  intent_keywords: string[];
  target_agent_id: string;
  target_agent_name: string;
  priority: number;
  transition_intro?: string;
}

export function Step1Basics({
  agentData,
  setAgentData,
  selectedPurposeId,
  setSelectedPurposeId,
  showValidationErrors = false
}: Step1BasicsProps) {
  const isCustomMode = selectedPurposeId === "custom";
  const isOrchestratorMode = selectedPurposeId === "orchestrator";

  // Custom purpose specifics
  const [customRoleName, setCustomRoleName] = useState(agentData.role || "");
  const [customHelpScope, setCustomHelpScope] = useState("");
  const [customSuccessCriteria, setCustomSuccessCriteria] = useState("");
  const [shakeTriggerKey, setShakeTriggerKey] = useState(0);

  // Orchestrator state
  const [availableAgents, setAvailableAgents] = useState<ChildAgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(
    (agentData as any).orchestrator_config?.child_agent_ids || []
  );
  const [routingStrategy, setRoutingStrategy] = useState<string>(
    (agentData as any).orchestrator_config?.routing_strategy || "intent"
  );
  const [intentRules, setIntentRules] = useState<IntentRule[]>(
    (agentData as any).orchestrator_config?.intent_routing_rules || []
  );
  const [newRuleKeywords, setNewRuleKeywords] = useState("");
  const [newRuleAgentId, setNewRuleAgentId] = useState("");
  const [newRuleIntro, setNewRuleIntro] = useState("");
  const [childSearchQuery, setChildSearchQuery] = useState("");

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const descInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (selectedPurposeId === "custom" && agentData.role && !customRoleName) {
      setCustomRoleName(agentData.role);
    }
  }, [selectedPurposeId, agentData.role]);

  useEffect(() => {
    if (showValidationErrors) {
      setShakeTriggerKey((k) => k + 1);
      if (!agentData.name || !agentData.name.trim()) nameInputRef.current?.focus();
      else if (!agentData.description || !agentData.description.trim()) descInputRef.current?.focus();
    }
  }, [showValidationErrors]);

  useEffect(() => {
    if (isOrchestratorMode && availableAgents.length === 0) fetchAvailableAgents();
  }, [isOrchestratorMode]);

  // Sync orchestrator config back to agentData whenever it changes
  useEffect(() => {
    if (isOrchestratorMode) {
      setAgentData((prev) => ({
        ...prev,
        is_orchestrator: true,
        orchestrator_config: {
          child_agent_ids: selectedChildIds,
          routing_strategy: routingStrategy,
          intent_routing_rules: intentRules,
          suppress_child_greeting: true,
          handoff_summary_enabled: true,
          shared_context_fields: ["caller_name", "intent", "property_name", "booking_date"],
          auto_return_to_orchestrator: false,
        },
      } as any));
    }
  }, [selectedChildIds, routingStrategy, intentRules, isOrchestratorMode]);

  const fetchAvailableAgents = async () => {
    setLoadingAgents(true);
    try {
      const data = await fetchApi<any[]>("/agents");
      setAvailableAgents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("Could not load agents for orchestrator:", e);
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleModeSwitch = (mode: CreationMode) => {
    if (mode === "orchestrator") {
      setSelectedPurposeId("orchestrator");
      setAgentData((prev) => ({
        ...prev,
        name: prev.name || "",
        description: prev.description || "Multi-agent supervisor that routes callers to the right specialist.",
        role: "Multi-Agent Supervisor",
        objective: "Greet callers, detect intent, and seamlessly delegate to the right specialist agent.",
        greeting: prev.greeting || "Hello! I'm your virtual assistant. How can I help you today?",
        is_orchestrator: true,
      } as any));
    } else if (mode === "custom") {
      setSelectedPurposeId("custom");
      setAgentData((prev) => ({
        ...prev,
        name: prev.name && !prev.name.includes("Agent") ? prev.name : "",
        description: prev.description || "",
        role: customRoleName || prev.role || "",
        objective: customHelpScope || prev.objective || "",
        greeting: prev.greeting || "Hello, thank you for calling. How can I help you today?",
        is_orchestrator: false,
      } as any));
      setTimeout(() => nameInputRef.current?.focus(), 80);
    } else {
      const fallbackPreset =
        AGENT_PURPOSES.find((p) => p.id !== "custom" && p.id === selectedPurposeId) ||
        AGENT_PURPOSES.find((p) => p.id === "follow_up") ||
        AGENT_PURPOSES[0];
      handlePurposeSelect(fallbackPreset);
    }
  };

  const handlePurposeSelect = (purpose: AgentPurposeItem) => {
    if (selectedPurposeId === purpose.id) return;
    setSelectedPurposeId(purpose.id);
    if (purpose.id === "custom") {
      setAgentData((prev) => ({ ...prev, name: "", description: "", role: "", objective: "", is_orchestrator: false } as any));
    } else {
      setAgentData((prev) => ({
        ...prev,
        name: `${purpose.title} Agent`,
        description: purpose.description,
        role: purpose.defaultRole,
        objective: purpose.defaultObjective,
        greeting: purpose.defaultGreeting,
        system_prompt: purpose.defaultSystemPrompt ?? prev.system_prompt,
        communication_style: purpose.defaultCommunicationStyle,
        response_length: purpose.defaultResponseLength,
        skills: purpose.defaultCapabilities,
        personality: { ...prev.personality, ...purpose.defaultPersonality },
        voice: {
          ...prev.voice,
          voice: purpose.recommendedVoiceId || prev.voice?.voice || "aura-orion-en",
          speed: purpose.recommendedSpeed ?? prev.voice?.speed ?? 1.0
        },
        llm: {
          ...prev.llm,
          temperature: purpose.recommendedTemperature ?? prev.llm?.temperature ?? 0.4
        },
        is_orchestrator: false,
      } as any));
    }
  };

  const toggleChildAgent = (agentId: string) => {
    setSelectedChildIds((prev) => {
      if (prev.includes(agentId)) {
        setIntentRules((rules) => rules.filter((r) => r.target_agent_id !== agentId));
        return prev.filter((id) => id !== agentId);
      }
      return [...prev, agentId];
    });
  };

  const addIntentRule = () => {
    if (!newRuleKeywords.trim() || !newRuleAgentId) return;
    const targetAgent = availableAgents.find((a) => a.agent_id === newRuleAgentId);
    const rule: IntentRule = {
      intent_keywords: newRuleKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      target_agent_id: newRuleAgentId,
      target_agent_name: targetAgent?.name || newRuleAgentId,
      priority: intentRules.length + 1,
      transition_intro: newRuleIntro.trim() || undefined,
    };
    setIntentRules((prev) => [...prev, rule]);
    setNewRuleKeywords("");
    setNewRuleAgentId("");
    setNewRuleIntro("");
  };

  const removeIntentRule = (index: number) => setIntentRules((prev) => prev.filter((_, i) => i !== index));

  const isNameInvalid = showValidationErrors && (!agentData.name || !agentData.name.trim());
  const isDescInvalid = showValidationErrors && (!agentData.description || !agentData.description.trim());

  return (
    <div className="space-y-6 text-left">
      {/* ─── MODE SWITCHER ─────────────────────────────────────────────── */}
      <div className="p-3 sm:p-3.5 bg-[var(--color-surface-muted)]/70 border border-[var(--color-border)] rounded-xl shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-heading)]">
              Agent Architecture &amp; Creation Mode
            </span>
            <InfoTooltip
              content="Choose whether to use a curated preset, build a bespoke single agent, or create a Multi-Agent Orchestrator Supervisor."
              position="top"
            />
          </div>

          <div className="relative inline-flex p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs self-start sm:self-auto shrink-0 select-none gap-0.5">
            <button
              type="button"
              onClick={() => handleModeSwitch("prebuilt")}
              className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                !isCustomMode && !isOrchestratorMode
                  ? "bg-[var(--color-primary)] text-white shadow-xs"
                  : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Prebuilt Role</span>
              <span className={`text-[10px] px-1.5 rounded-full font-medium ${!isCustomMode && !isOrchestratorMode ? "bg-white/20 text-white" : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)]"}`}>
                {AGENT_PURPOSES.filter((p) => p.id !== "custom").length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch("custom")}
              className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                isCustomMode
                  ? "bg-[var(--color-primary)] text-white shadow-xs"
                  : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Custom Agent</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch("orchestrator")}
              className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                isOrchestratorMode
                  ? "bg-[var(--color-primary)] text-white shadow-xs"
                  : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Orchestrator</span>
              {!isOrchestratorMode && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] border border-[var(--color-primary)]/20 font-bold">
                  NEW
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── MODE A: PREBUILT PRESETS ───────────────────────────────────── */}
      {!isCustomMode && !isOrchestratorMode && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
            <div className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[var(--color-primary)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)]">
                Select Pre-built Industry Preset
              </h3>
              <InfoTooltip content="Select a preset to auto-configure pacing, greeting templates, and skills." position="top" />
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">Click to apply default workflow</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
            {AGENT_PURPOSES.filter((p) => p.id !== "custom").map((purpose) => {
              const Icon = purpose.icon;
              const isSelected = selectedPurposeId === purpose.id;
              return (
                <div
                  key={purpose.id}
                  onClick={() => handlePurposeSelect(purpose)}
                  className={`p-3 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex items-center justify-between text-left relative select-none ${
                    isSelected
                      ? "bg-[var(--color-primary-light)]/20 border-[var(--color-primary)] shadow-xs ring-1 ring-[var(--color-primary)] font-semibold"
                      : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] hover:bg-[var(--color-surface-muted)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className={`w-7 h-7 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center shrink-0 ${isSelected ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border border-[var(--color-border)]"}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      <h3 className="text-xs font-bold text-[var(--color-heading)] leading-tight truncate">{purpose.title}</h3>
                      {purpose.description && <InfoTooltip content={purpose.description} position="top" />}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center shadow-2xs shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── MODE B: CUSTOM AGENT ───────────────────────────────────────── */}
      {isCustomMode && (
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-4 animate-fade-in shadow-2xs">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                Custom Role Specification
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">Bespoke Setup</span>
              </h3>
              <p className="text-[11px] text-[var(--color-muted)]">Define the exact role without preset constraints.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--color-heading)]">Custom Role Title</label>
              <input type="text" value={customRoleName} onChange={(e) => { setCustomRoleName(e.target.value); setAgentData((prev) => ({ ...prev, role: e.target.value })); }} placeholder="e.g., VIP Concierge Specialist" className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15 transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--color-heading)]">What should this agent help with?</label>
              <input type="text" value={customHelpScope} onChange={(e) => { setCustomHelpScope(e.target.value); setAgentData((prev) => ({ ...prev, objective: e.target.value })); }} placeholder="e.g., Verify account details, process order modifications" className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15 transition-all" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-[var(--color-heading)]">Call Success Criteria</label>
              <input type="text" value={customSuccessCriteria} onChange={(e) => setCustomSuccessCriteria(e.target.value)} placeholder="e.g., Resolution reached or escalated with notes captured" className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15 transition-all" />
              <p className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5 pt-0.5">
                <Info className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                Our AI prompt engine builds tailored telephony instructions from these specifications in Stage 2.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODE C: MULTI-AGENT ORCHESTRATOR ──────────────────────────── */}
      {isOrchestratorMode && (
        <div className="space-y-4 animate-fade-in">
          {/* Banner */}
          <div className="relative overflow-hidden p-4 rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 via-[var(--color-primary)]/5 to-transparent shadow-2xs">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-primary)]/10 rounded-full blur-2xl -translate-y-8 translate-x-8 pointer-events-none" />
            <div className="flex items-start gap-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0 shadow-sm">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-[var(--color-heading)]">Multi-Agent Orchestrator</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30">SUPERVISOR MODE</span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                  Acts as a <strong className="text-[var(--color-heading)]">hub-and-spoke supervisor</strong>. Greets callers, detects intent in real-time,
                  and routes to specialist agents — zero WebSocket drops, full context bridging, no re-greetings.
                </p>
              </div>
            </div>
          </div>

          {/* Child Agent Selector */}
          <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3.5 shadow-2xs">
            {/* Header with counts and bulk actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-[var(--color-heading)]">Child Specialist Agents</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] border border-[var(--color-primary)]/20">
                      {selectedChildIds.length} of {availableAgents.length} Active
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">Select child agents that the supervisor can seamlessly delegate calls to</p>
                </div>
              </div>

              {availableAgents.length > 0 && (
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = availableAgents.map((a) => a.agent_id);
                      setSelectedChildIds(allIds);
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--color-surface-muted)] text-[var(--color-heading)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] border border-[var(--color-border)] transition-colors cursor-pointer"
                  >
                    Select All
                  </button>
                  {selectedChildIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChildIds([]);
                        setIntentRules([]);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-danger)] border border-[var(--color-border)] transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick Search Filter */}
            {availableAgents.length > 4 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--color-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={childSearchQuery}
                  onChange={(e) => setChildSearchQuery(e.target.value)}
                  placeholder="Search agents by name, role, or entity scope..."
                  className="w-full h-8 pl-8 pr-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all"
                />
                {childSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setChildSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-heading)] p-0.5 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {loadingAgents ? (
              <div className="text-xs text-[var(--color-muted)] py-8 text-center flex flex-col items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                <span>Loading available specialist agents...</span>
              </div>
            ) : availableAgents.length === 0 ? (
              <div className="text-xs text-[var(--color-muted)] py-6 text-center flex flex-col items-center justify-center gap-2 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-surface-muted)]/40 p-4">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="font-semibold text-[var(--color-heading)]">No specialist agents found</span>
                <span>Create specialist child agents first, then return here to configure the orchestrator.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[460px] overflow-y-auto pr-0.5 scrollbar-thin">
                {availableAgents
                  .filter((agent) => {
                    if (!childSearchQuery.trim()) return true;
                    const q = childSearchQuery.toLowerCase();
                    return (
                      agent.name.toLowerCase().includes(q) ||
                      (agent.role || "").toLowerCase().includes(q) ||
                      (agent.agent_entity_scope || "").toLowerCase().includes(q)
                    );
                  })
                  .map((agent) => {
                    const isSelected = selectedChildIds.includes(agent.agent_id);
                    return (
                      <div
                        key={agent.agent_id}
                        onClick={() => toggleChildAgent(agent.agent_id)}
                        className={`group p-2.5 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between gap-2 text-left relative ${
                          isSelected
                            ? "bg-[var(--color-primary-light)]/25 border-[var(--color-primary)] shadow-2xs ring-1 ring-[var(--color-primary)]/40"
                            : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-muted)]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs transition-colors ${
                              isSelected
                                ? "bg-[var(--color-primary)] text-white shadow-2xs"
                                : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)] group-hover:text-[var(--color-primary)]"
                            }`}
                          >
                            <Bot className="w-4 h-4" />
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs font-bold text-[var(--color-heading)] truncate">
                                {agent.name}
                              </h4>
                              {agent.agent_entity_scope && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--color-surface-muted)] text-[var(--color-primary)] border border-[var(--color-primary)]/20 font-medium shrink-0 truncate max-w-[130px]">
                                  {agent.agent_entity_scope}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--color-muted)] truncate">
                              {agent.role || "Specialist Agent"}
                            </p>
                          </div>
                        </div>

                        {/* Interactive Selection Checkbox */}
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                            isSelected
                              ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-2xs"
                              : "border-[var(--color-border-strong,var(--color-border))] bg-[var(--color-surface)] group-hover:border-[var(--color-primary)]/60"
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Routing Strategy */}
          <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-2.5">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--color-border)]">
              <Cpu className="w-4 h-4 text-[var(--color-primary)]" />
              <div>
                <h3 className="text-xs font-bold text-[var(--color-heading)]">Routing Strategy</h3>
                <p className="text-[11px] text-[var(--color-muted)]">How the orchestrator decides which specialist to use</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: "intent", label: "Intent Keywords", desc: "Routes based on what caller says" },
                { id: "sequential", label: "Sequential Flow", desc: "Follows predefined agent order" },
                { id: "round_robin", label: "Round Robin", desc: "Cycles through agents evenly" },
              ].map((opt) => (
                <div key={opt.id} onClick={() => setRoutingStrategy(opt.id)} className={`p-2.5 rounded-lg border cursor-pointer transition-all select-none ${routingStrategy === opt.id ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/30" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"}`}>
                  <p className="text-xs font-bold text-[var(--color-heading)]">{opt.label}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Intent Routing: Automatic Smart Keyword Routing with Optional Customization */}
          {routingStrategy === "intent" && (
            <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                  <div>
                    <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                      Intelligent Auto-Routing
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] border border-[var(--color-primary)]/20">
                        Zero-Config Automatic
                      </span>
                    </h3>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Caller intent is automatically routed to the right specialist using their knowledge base and entity scope.
                    </p>
                  </div>
                </div>
              </div>

              {selectedChildIds.length === 0 ? (
                <div className="text-xs text-[var(--color-muted)] py-3 text-center flex items-center justify-center gap-2">
                  <Info className="w-4 h-4 text-[var(--color-primary)]" />
                  Select child agents above — their routing intents and triggers will be created automatically.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedChildIds.map((id) => {
                    const agent = availableAgents.find((a) => a.agent_id === id);
                    if (!agent) return null;

                    // Derive preview keywords for the user display
                    const previewKeywords = [
                      agent.name.toLowerCase().replace(/agent|specialist|coordinator|advisor|concierge/gi, "").trim(),
                      agent.agent_entity_scope?.toLowerCase() || "",
                      agent.role?.toLowerCase() || "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                      .split(/[\s,&]+/)
                      .filter((w) => w.length > 3 && !["with", "from", "clinic", "hotel", "team"].includes(w))
                      .slice(0, 5);

                    return (
                      <div
                        key={id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border)]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                            <span className="text-xs font-bold text-[var(--color-heading)] truncate">
                              {agent.name}
                            </span>
                            {agent.agent_entity_scope && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] border border-[var(--color-primary)]/20 font-medium shrink-0">
                                {agent.agent_entity_scope}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate pl-5">
                            Auto-transfers when caller discusses:{" "}
                            <span className="font-medium text-[var(--color-heading)]">
                              {previewKeywords.length > 0 ? previewKeywords.join(", ") : "domain inquiries & bookings"}
                            </span>
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary-light)] px-2 py-0.5 rounded-md self-start sm:self-center shrink-0">
                          Active &amp; Ready
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── AGENT IDENTITY ─────────────────────────────────────────────── */}
      <div className="space-y-4 pt-1">
        <div className="border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
          <div className="w-6 h-6 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-1.5">
            Agent Identity &amp; Details
            {isOrchestratorMode && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30">Orchestrator</span>
            )}
          </h2>
          <InfoTooltip content="Set the essential identity, display name, and operational summary for your AI voice agent." position="top" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-bold text-[var(--color-heading)] flex items-center gap-1">
                <span>Agent Name</span>
                <span className="text-[var(--color-danger)] font-bold text-sm leading-none">*</span>
              </label>
              <InfoTooltip content="Give your agent a clear, recognizable name used across call logs, reporting, and analytics." position="top" />
            </div>
            {isOrchestratorMode && (
              <span className="text-[10px] font-medium text-[var(--color-primary)] flex items-center gap-1">
                <Network className="w-3 h-3" />Supervisor Name
              </span>
            )}
            {isCustomMode && (
              <span className="text-[10px] font-medium text-[var(--color-primary)] flex items-center gap-1">
                <Sparkles className="w-3 h-3" />Bespoke Name
              </span>
            )}
          </div>
          <input
            key={`name-input-${shakeTriggerKey}`}
            ref={nameInputRef}
            type="text"
            value={agentData.name}
            onChange={(e) => setAgentData({ ...agentData, name: e.target.value })}
            placeholder={isOrchestratorMode ? "e.g., Hotel Concierge Hub, Front Desk Supervisor" : isCustomMode ? "e.g., VIP Support Assistant, Custom Inbound Specialist" : "e.g., Customer Follow-Up Agent, VIP Sales Closer"}
            className={`w-full h-9 px-3.5 text-xs bg-[var(--color-surface)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none font-medium shadow-2xs transition-all duration-200 ${
              isNameInvalid
                ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30 bg-[var(--color-primary-light)]/15 animate-shake"
                : "border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15"
            }`}
          />
          {isNameInvalid && (
            <p className="text-[10px] font-medium text-[var(--color-primary)] flex items-center gap-1 mt-0.5">
              <Info className="w-3 h-3 text-[var(--color-primary)] shrink-0" />
              <span>Please enter an agent name before proceeding to the next step.</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <label className="block text-xs font-bold text-[var(--color-heading)] flex items-center gap-1">
              <span>Description</span>
              <span className="text-[var(--color-danger)] font-bold text-sm leading-none">*</span>
            </label>
            <InfoTooltip content="Explain what this agent does. This helps our AI generator produce optimal prompts." position="top" />
          </div>
          <textarea
            key={`desc-input-${shakeTriggerKey}`}
            ref={descInputRef}
            rows={2}
            value={agentData.description || ""}
            onChange={(e) => setAgentData({ ...agentData, description: e.target.value })}
            placeholder={isOrchestratorMode ? "e.g., Routes hotel callers to the right specialist — Ocean Grand or Skyline — based on their request." : isCustomMode ? "e.g., Handles custom customer inquiries and routes escalated requests." : "e.g., Follows up with existing customers about pending inquiries, orders, or feedback."}
            className={`w-full p-3 text-xs bg-[var(--color-surface)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none shadow-2xs resize-none transition-all duration-200 ${
              isDescInvalid
                ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30 bg-[var(--color-primary-light)]/15 animate-shake"
                : "border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15"
            }`}
          />
          {isDescInvalid && (
            <p className="text-[10px] font-medium text-[var(--color-primary)] flex items-center gap-1 mt-0.5">
              <Info className="w-3 h-3 text-[var(--color-primary)] shrink-0" />
              <span>Please provide a brief description of what this agent handles.</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
