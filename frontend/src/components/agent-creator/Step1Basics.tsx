import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Check, Info, Bot, Compass, Plus, Layers, Sliders, ArrowRight } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { AGENT_PURPOSES, AgentPurposeItem } from "./constants";
import { AgentConfig } from "../../types";

interface Step1BasicsProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
  selectedPurposeId: string;
  setSelectedPurposeId: (id: string) => void;
  showValidationErrors?: boolean;
}

export function Step1Basics({
  agentData,
  setAgentData,
  selectedPurposeId,
  setSelectedPurposeId,
  showValidationErrors = false
}: Step1BasicsProps) {
  // Creation mode: 'prebuilt' | 'custom'
  const isCustomMode = selectedPurposeId === "custom";

  // Custom purpose specifics
  const [customRoleName, setCustomRoleName] = useState(agentData.role || "");
  const [customHelpScope, setCustomHelpScope] = useState("");
  const [customSuccessCriteria, setCustomSuccessCriteria] = useState("");
  const [isCustomHighlighted, setIsCustomHighlighted] = useState(false);
  const [shakeTriggerKey, setShakeTriggerKey] = useState(0);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const descInputRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightTimeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Sync role if custom
  useEffect(() => {
    if (selectedPurposeId === "custom" && agentData.role && !customRoleName) {
      setCustomRoleName(agentData.role);
    }
  }, [selectedPurposeId, agentData.role]);

  // When validation errors are triggered, vibrate and auto-focus the first invalid field
  useEffect(() => {
    if (showValidationErrors) {
      setShakeTriggerKey((k) => k + 1);
      if (!agentData.name || !agentData.name.trim()) {
        nameInputRef.current?.focus();
      } else if (!agentData.description || !agentData.description.trim()) {
        descInputRef.current?.focus();
      }
    }
  }, [showValidationErrors]);

  const handleModeSwitch = (mode: "prebuilt" | "custom") => {
    if (mode === "custom") {
      setSelectedPurposeId("custom");
      setAgentData((prev) => ({
        ...prev,
        name: prev.name && !prev.name.includes("Agent") ? prev.name : "",
        description: prev.description || "",
        role: customRoleName || prev.role || "",
        objective: customHelpScope || prev.objective || "",
        greeting: prev.greeting || "Hello, thank you for calling. How can I help you today?"
      }));

      setIsCustomHighlighted(true);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setIsCustomHighlighted(false);
      }, 1800);

      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 80);
    } else {
      // Revert to first prebuilt or follow_up
      const fallbackPreset =
        AGENT_PURPOSES.find((p) => p.id !== "custom" && p.id === selectedPurposeId) ||
        AGENT_PURPOSES.find((p) => p.id === "follow_up") ||
        AGENT_PURPOSES[0];
      handlePurposeSelect(fallbackPreset);
    }
  };

  const handlePurposeSelect = (purpose: AgentPurposeItem) => {
    if (selectedPurposeId === purpose.id) {
      return;
    }

    setSelectedPurposeId(purpose.id);

    if (purpose.id === "custom") {
      setAgentData((prev) => ({
        ...prev,
        name: "",
        description: "",
        role: "",
        objective: "",
        greeting: prev.greeting || "Hello, thank you for calling. How can I help you today?"
      }));
      setCustomRoleName("");
      setCustomHelpScope("");
      setCustomSuccessCriteria("");

      setIsCustomHighlighted(true);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setIsCustomHighlighted(false);
      }, 1800);

      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 80);
    } else {
      setIsCustomHighlighted(false);
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
        }
      }));
    }
  };

  const isNameInvalid = showValidationErrors && (!agentData.name || !agentData.name.trim());
  const isDescInvalid = showValidationErrors && (!agentData.description || !agentData.description.trim());

  return (
    <div className="space-y-6 text-left">
      {/* ========================================================================= */}
      {/* TOP-LEVEL MODE SWITCHER: PREBUILT ROLE VS CUSTOM AGENT */}
      {/* ========================================================================= */}
      <div className="p-3 sm:p-3.5 bg-[var(--color-surface-muted)]/70 border border-[var(--color-border)] rounded-xl space-y-2.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-heading)] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Agent Architecture &amp; Creation Mode</span>
              </span>
              <InfoTooltip
                content="Choose whether to start from a curated pre-built role preset or build an entirely bespoke agent from scratch."
                position="top"
              />
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              Select how you want to configure your agent's primary role, conversation flow, and core objectives.
            </p>
          </div>

          {/* Segmented Sliding Pill Toggle */}
          <div className="relative inline-flex p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs self-start sm:self-auto shrink-0 select-none">
            <button
              type="button"
              onClick={() => handleModeSwitch("prebuilt")}
              className={`relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                !isCustomMode
                  ? "bg-[var(--color-primary)] text-white shadow-xs"
                  : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Prebuilt Role</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                  !isCustomMode
                    ? "bg-white/20 text-white"
                    : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)]"
                }`}
              >
                {AGENT_PURPOSES.filter((p) => p.id !== "custom").length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch("custom")}
              className={`relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                isCustomMode
                  ? "bg-[var(--color-primary)] text-white shadow-xs"
                  : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Custom Agent</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                  isCustomMode
                    ? "bg-white/20 text-white"
                    : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)]"
                }`}
              >
                Custom
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE A: PREBUILT ROLE PRESETS */}
      {/* ========================================================================= */}
      {!isCustomMode && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
            <div className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[var(--color-primary)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)]">
                Select Pre-built Industry Preset
              </h3>
              <InfoTooltip
                content="Select a preset to auto-configure conversational pacing, greeting templates, and suggested skills."
                position="top"
              />
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">Click a preset to apply default workflow</span>
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
                    <div
                      className={`w-7 h-7 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-[var(--color-primary)] text-white"
                          : "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border border-[var(--color-border)]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      <h3 className="text-xs font-bold text-[var(--color-heading)] leading-tight truncate">
                        {purpose.title}
                      </h3>
                      {purpose.description && (
                        <InfoTooltip content={purpose.description} position="top" />
                      )}
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

      {/* ========================================================================= */}
      {/* MODE B: CUSTOM AGENT CREATION FIELDS (SHOWN WHEN CUSTOM IS ACTIVE) */}
      {/* ========================================================================= */}
      {isCustomMode && (
        <div
          className={`p-4 bg-[var(--color-surface)] border rounded-xl space-y-4 animate-fade-in transition-all duration-300 ${
            isCustomHighlighted
              ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/15 shadow-sm"
              : "border-[var(--color-border)] shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Custom Role Specification</span>
                  <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">
                    Bespoke Setup
                  </span>
                </h3>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Define the exact operational role and scope for this agent without preset constraints.
                </p>
              </div>
            </div>
            {/* {isCustomHighlighted && (
              <span className="text-[10px] font-medium text-[var(--color-primary)] animate-pulse hidden sm:inline-block">
                ✨ Blank Slate Active
              </span>
            )} */}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <label className="block text-xs font-bold text-[var(--color-heading)]">
                  Custom Role Title
                </label>
                <InfoTooltip content="The professional role or job title assigned to this agent (e.g., VIP Support Executive, Intake Dispatcher)." position="top" />
              </div>
              <input
                type="text"
                value={customRoleName}
                onChange={(e) => {
                  setCustomRoleName(e.target.value);
                  setAgentData((prev) => ({ ...prev, role: e.target.value }));
                }}
                placeholder="e.g., VIP Concierge Specialist"
                className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <label className="block text-xs font-bold text-[var(--color-heading)]">
                  What should this agent help customers with?
                </label>
                <InfoTooltip content="Outline the key scenarios, questions, and tasks this custom agent handles." position="top" />
              </div>
              <input
                type="text"
                value={customHelpScope}
                onChange={(e) => {
                  setCustomHelpScope(e.target.value);
                  setAgentData((prev) => ({ ...prev, objective: e.target.value }));
                }}
                placeholder="e.g., Verify account details, process order modifications, and dispatch reminders"
                className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15 transition-all"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <div className="flex items-center gap-1">
                <label className="block text-xs font-bold text-[var(--color-heading)]">
                  Call Success Criteria
                </label>
                <InfoTooltip content="Define what makes a call successful (e.g., meeting scheduled, dispute resolved, information logged)." position="top" />
              </div>
              <input
                type="text"
                value={customSuccessCriteria}
                onChange={(e) => setCustomSuccessCriteria(e.target.value)}
                placeholder="e.g., Resolution reached or escalated with comprehensive notes captured"
                className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15 transition-all"
              />
              <p className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5 pt-0.5">
                <Info className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                <span>Our AI prompt engine automatically builds tailored telephony instructions from these specifications in Stage 2.</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: AGENT IDENTITY (NAME & DESCRIPTION) */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-1">
        <div className="border-b border-[var(--color-border)] pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-1.5">
              Agent Identity &amp; Details
            </h2>
            <InfoTooltip
              content="Set the essential identity, display name, and operational summary for your AI voice agent."
              position="top"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-bold text-[var(--color-heading)] flex items-center gap-1">
                <span>Agent Name</span>
                <span className="text-[var(--color-danger)] font-bold text-sm leading-none">*</span>
              </label>
              <InfoTooltip
                content="Give your agent a clear, recognizable name used across call logs, reporting, and analytics."
                position="top"
              />
            </div>
            {isCustomMode && (
              <span className="text-[10px] font-medium text-[var(--color-primary)] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[var(--color-primary)]" />
                <span>Bespoke Name</span>
              </span>
            )}
          </div>
          <input
            key={`name-input-${shakeTriggerKey}`}
            ref={nameInputRef}
            type="text"
            value={agentData.name}
            onChange={(e) => setAgentData({ ...agentData, name: e.target.value })}
            placeholder={isCustomMode ? "e.g., VIP Support Assistant, Custom Inbound Specialist" : "e.g., Customer Follow-Up Agent, VIP Sales Closer"}
            className={`w-full h-9 px-3.5 text-xs bg-[var(--color-surface)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none font-medium shadow-2xs transition-all duration-300 ${
              isNameInvalid
                ? "border-rose-400 dark:border-rose-500/70 ring-2 ring-rose-400/20 dark:ring-rose-500/20 bg-rose-500/[0.015] animate-shake"
                : isCustomHighlighted
                ? "border-[var(--color-primary)]/40 ring-2 ring-[var(--color-primary)]/15 bg-[var(--color-primary)]/[0.015] animate-soft-highlight"
                : "border border-[var(--color-border)] focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15"
            }`}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-bold text-[var(--color-heading)] flex items-center gap-1">
                <span>Description</span>
                <span className="text-[var(--color-danger)] font-bold text-sm leading-none">*</span>
              </label>
              <InfoTooltip
                content="Explain what this agent does. This helps colleagues and helps our AI generator produce optimal prompts."
                position="top"
              />
            </div>
          </div>
          <textarea
            key={`desc-input-${shakeTriggerKey}`}
            ref={descInputRef}
            rows={2}
            value={agentData.description || ""}
            onChange={(e) => setAgentData({ ...agentData, description: e.target.value })}
            placeholder={
              isCustomMode
                ? "e.g., Handles custom customer inquiries, performs bespoke data lookups, and routes escalated requests."
                : "e.g., Follows up with existing customers about pending inquiries, orders, appointments, or satisfaction feedback."
            }
            className={`w-full p-3 text-xs bg-[var(--color-surface)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none shadow-2xs resize-none transition-all duration-300 ${
              isDescInvalid
                ? "border-rose-400 dark:border-rose-500/70 ring-2 ring-rose-400/20 dark:ring-rose-500/20 bg-rose-500/[0.015] animate-shake"
                : isCustomHighlighted
                ? "border-[var(--color-primary)]/40 ring-2 ring-[var(--color-primary)]/15 bg-[var(--color-primary)]/[0.015] animate-soft-highlight"
                : "border border-[var(--color-border)] focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15"
            }`}
          />
        </div>
      </div>
    </div>
  );
}

