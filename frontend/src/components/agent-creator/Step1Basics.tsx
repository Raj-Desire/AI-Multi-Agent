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

  const handlePurposeSelect = (purpose: AgentPurposeItem) => {
    // If the purpose is already selected, do not erase or overwrite any entered data
    if (selectedPurposeId === purpose.id) {
      return;
    }

    setSelectedPurposeId(purpose.id);

    if (purpose.id === "custom") {
      // 1. Clear agent name, description, role, and objective automatically for custom creation
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

      // 2. Trigger refined, soft professional light highlight
      setIsCustomHighlighted(true);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setIsCustomHighlighted(false);
      }, 2200);

      // 3. Auto-focus agent name input field
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
      {/* Section 1: Basic Identity */}
      <div className="space-y-4">
        <div className="border-b border-[var(--color-border)] pb-2.5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                Agent Information
              </h2>
              <InfoTooltip
                content="Set the essential identity, name, operational status, and purpose for your AI voice agent."
                position="top"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="block text-xs font-bold text-[var(--color-heading)] flex items-center gap-1">
                  <span>Agent Name</span>
                  <span className="text-[var(--color-danger)] font-bold text-sm leading-none">*</span>
                  <span className="text-[10px] font-medium text-[var(--color-muted)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">
                    Required
                  </span>
                </label>
                <InfoTooltip
                  content="Give your agent a clear, recognizable name used across call logs, reporting, and analytics."
                  position="top"
                />
              </div>
              {isCustomHighlighted && (
                <span className="text-[10px] font-medium text-[var(--color-primary)] animate-pulse flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[var(--color-primary)]" />
                  <span>Custom Purpose Name</span>
                </span>
              )}
            </div>
            <input
              key={`name-input-${shakeTriggerKey}`}
              ref={nameInputRef}
              type="text"
              value={agentData.name}
              onChange={(e) => setAgentData({ ...agentData, name: e.target.value })}
              placeholder={selectedPurposeId === "custom" ? "e.g., VIP Support Assistant, Custom Inbound Specialist" : "e.g., Customer Follow-Up Agent, VIP Sales Closer"}
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
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Initial Status
              </label>
              <InfoTooltip
                content="Control whether this agent is ready to take live organizational calls or active only in testing mode."
                position="top"
              />
            </div>
            <select
              value={agentData.status}
              onChange={(e) => setAgentData({ ...agentData, status: e.target.value as any })}
              className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15 font-medium shadow-2xs cursor-pointer"
            >
              <option value="DRAFT">Draft (Testing only)</option>
              <option value="ACTIVE">Active (Live in Org)</option>
              <option value="INACTIVE">Inactive (Disabled)</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-bold text-[var(--color-heading)] flex items-center gap-1">
                <span>Description</span>
                <span className="text-[var(--color-danger)] font-bold text-sm leading-none">*</span>
                <span className="text-[10px] font-medium text-[var(--color-muted)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">
                  Required
                </span>
              </label>
              <InfoTooltip
                content="Explain what this agent does. This helps colleagues and helps our AI generator produce optimal prompts."
                position="top"
              />
            </div>
            {isCustomHighlighted && (
              <span className="text-[10px] font-medium text-[var(--color-primary)] animate-pulse flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[var(--color-primary)]" />
                <span>Custom Description</span>
              </span>
            )}
          </div>
          <textarea
            key={`desc-input-${shakeTriggerKey}`}
            ref={descInputRef}
            rows={2}
            value={agentData.description || ""}
            onChange={(e) => setAgentData({ ...agentData, description: e.target.value })}
            placeholder={
              selectedPurposeId === "custom"
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

      {/* Section 2: Purpose Selection (Pre-built Templates vs Custom Purpose) */}
      <div className="space-y-4 pt-2">
        <div className="border-b border-[var(--color-border)] pb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-1.5">
              <span>What is this agent mainly used for?</span>
            </h2>
            <InfoTooltip
              content="Select an industry pre-built preset to automatically configure conversational pacing, greeting templates, and suggested skills, or choose Custom Purpose for bespoke workflows."
              position="top"
            />
          </div>
        </div>

        {/* Subsection A: Pre-built Industry Presets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                Pre-built Industry Presets ({AGENT_PURPOSES.filter((p) => p.id !== "custom").length})
              </span>
              <InfoTooltip
                content="Ready-to-use voice presets pre-configured with industry dialogue flows, voice pacing, and prompts."
                position="top"
              />
            </div>
            <span className="text-[10px] text-[var(--color-muted)]">Auto-populates best practices</span>
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

        {/* Subsection B: Dedicated Custom Purpose Option Card */}
        {(() => {
          const customPurpose = AGENT_PURPOSES.find((p) => p.id === "custom");
          const isCustomActive = selectedPurposeId === "custom";

          return (
            <div className="pt-2">
              <div
                onClick={() => customPurpose && handlePurposeSelect(customPurpose)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left relative select-none ${
                  isCustomActive
                    ? "bg-gradient-to-r from-[var(--color-primary)]/10 via-[var(--color-primary-light)]/15 to-transparent border-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-primary)]/30"
                    : "bg-[var(--color-surface)] border-dashed border-[var(--color-border-strong,var(--color-border))] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]/60"
                }`}
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
                      isCustomActive
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-[var(--color-surface-muted)] text-[var(--color-primary)] border border-[var(--color-border)]"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-[var(--color-heading)] leading-tight">
                        Custom Purpose &amp; Bespoke Workflow
                      </h3>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">
                        Blank Slate
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-snug">
                      Design an entirely bespoke agent from scratch with custom role definitions, specific company objectives, and tailored prompt logic.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {isCustomActive ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                      <span>Active</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--color-heading)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs hover:border-[var(--color-primary)] transition-all">
                      <span>Create Custom</span>
                      <ArrowRight className="w-3 h-3 text-[var(--color-primary)]" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Section 3: Custom Role Fields if Custom is selected */}
      {selectedPurposeId === "custom" && (
        <div
          className={`p-4 bg-[var(--color-surface-muted)]/50 border rounded-[var(--radius-main,0.375rem)] space-y-3.5 animate-fade-in transition-all duration-300 ${
            isCustomHighlighted
              ? "border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/15"
              : "border-[var(--color-border)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
              <h3 className="text-xs font-bold text-[var(--color-heading)]">Custom Role Details</h3>
              <InfoTooltip
                content="Define custom operational boundaries and specific business goals for non-standard workflows."
                position="top"
              />
            </div>
            {isCustomHighlighted && (
              <span className="text-[10px] font-medium text-[var(--color-primary)] animate-pulse">
                Active Custom Setup
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">
                  Role Name
                </label>
                <InfoTooltip content="The specific title given to this custom agent role." position="top" />
              </div>
              <input
                type="text"
                value={customRoleName}
                onChange={(e) => {
                  setCustomRoleName(e.target.value);
                  setAgentData({ ...agentData, role: e.target.value });
                }}
                placeholder="e.g., Passbook Follow-Up Specialist"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none transition-all ${
                  isCustomHighlighted
                    ? "border border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/15"
                    : "border border-[var(--color-border)] focus:border-[var(--color-primary)]/60"
                }`}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">
                  What should this agent help customers with?
                </label>
                <InfoTooltip content="Outline the key scenarios, questions, and tasks this custom agent handles." position="top" />
              </div>
              <input
                type="text"
                value={customHelpScope}
                onChange={(e) => {
                  setCustomHelpScope(e.target.value);
                  if (e.target.value && (!agentData.objective || selectedPurposeId === "custom")) {
                    setAgentData((prev) => ({ ...prev, objective: e.target.value }));
                  }
                }}
                placeholder="e.g., Verify incomplete passbook applications and advise next steps"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none transition-all ${
                  isCustomHighlighted
                    ? "border border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/15"
                    : "border border-[var(--color-border)] focus:border-[var(--color-primary)]/60"
                }`}
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <div className="flex items-center gap-1">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">
                  Success Criteria
                </label>
                <InfoTooltip content="Define what constitutes a successful call resolution." position="top" />
              </div>
              <input
                type="text"
                value={customSuccessCriteria}
                onChange={(e) => setCustomSuccessCriteria(e.target.value)}
                placeholder="e.g., Confirm customer status and record missing document reasons"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none transition-all ${
                  isCustomHighlighted
                    ? "border border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/15"
                    : "border border-[var(--color-border)] focus:border-[var(--color-primary)]/60"
                }`}
              />
              <p className="text-[11px] text-[var(--color-muted)] flex items-center gap-1 mt-1">
                <Info className="w-3 h-3 text-[var(--color-primary)] shrink-0" />
                <span>Our AI generator automatically translates these business parameters into exact telephony execution instructions.</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
