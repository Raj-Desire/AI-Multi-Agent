import React, { useState } from "react";
import { Sparkles, Check, Info } from "lucide-react";
import { AGENT_PURPOSES, AgentPurposeItem } from "./constants";
import { AgentConfig } from "../../types";

interface Step1BasicsProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
  selectedPurposeId: string;
  setSelectedPurposeId: (id: string) => void;
}

export function Step1Basics({
  agentData,
  setAgentData,
  selectedPurposeId,
  setSelectedPurposeId
}: Step1BasicsProps) {
  // Custom purpose specifics
  const [customRoleName, setCustomRoleName] = useState(agentData.role || "");
  const [customHelpScope, setCustomHelpScope] = useState("");
  const [customSuccessCriteria, setCustomSuccessCriteria] = useState("");

  const handlePurposeSelect = (purpose: AgentPurposeItem) => {
    setSelectedPurposeId(purpose.id);

    setAgentData((prev) => {
      // If user hasn't typed custom name, use default
      const shouldUpdateName = !prev.name || prev.name === "Customer Follow-Up Agent" || prev.name === "New Voice Agent";
      const newName = shouldUpdateName ? `${purpose.title} Agent` : prev.name;

      return {
        ...prev,
        name: newName,
        description: prev.description || purpose.description,
        role: purpose.defaultRole,
        objective: purpose.defaultObjective,
        greeting: purpose.defaultGreeting,
        communication_style: purpose.defaultCommunicationStyle,
        response_length: purpose.defaultResponseLength,
        skills: purpose.defaultCapabilities,
        personality: { ...prev.personality, ...purpose.defaultPersonality }
      };
    });
  };

  return (
    <div className="space-y-6 text-left">
      {/* Section 1: Basic Identity */}
      <div className="space-y-4">
        <div className="border-b border-[var(--color-border)] pb-2.5">
          <h2 className="text-sm font-bold text-[var(--color-heading)]">Agent Information</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Provide the basic identity and description for this voice agent.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Agent Name <span className="text-[var(--color-danger)]">*</span>
            </label>
            <input
              type="text"
              value={agentData.name}
              onChange={(e) => setAgentData({ ...agentData, name: e.target.value })}
              placeholder="e.g., Customer Follow-Up Agent, VIP Sales Closer"
              className="w-full h-10 px-3.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium shadow-2xs"
            />
            <p className="text-[11px] text-[var(--color-muted)]">
              Give your agent a clear, recognizable name used in logs and analytics.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Initial Status
            </label>
            <select
              value={agentData.status}
              onChange={(e) => setAgentData({ ...agentData, status: e.target.value as any })}
              className="w-full h-10 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium shadow-2xs cursor-pointer"
            >
              <option value="DRAFT">Draft (Testing only)</option>
              <option value="ACTIVE">Active (Live in Org)</option>
              <option value="INACTIVE">Inactive (Disabled)</option>
            </select>
            <p className="text-[11px] text-[var(--color-muted)]">
              You can change this status anytime.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Description
          </label>
          <textarea
            rows={2}
            value={agentData.description || ""}
            onChange={(e) => setAgentData({ ...agentData, description: e.target.value })}
            placeholder="e.g., Follows up with existing customers about pending inquiries, orders, appointments, or satisfaction feedback."
            className="w-full p-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] shadow-2xs resize-none"
          />
          <p className="text-[11px] text-[var(--color-muted)]">
            Explain what this agent does. This helps colleagues and helps our AI generator produce optimal prompts.
          </p>
        </div>
      </div>

      {/* Section 2: Purpose Selection */}
      <div className="space-y-3 pt-2">
        <div className="border-b border-[var(--color-border)] pb-2.5">
          <h2 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-1.5">
            <span>What is this agent mainly used for?</span>
            <span className="text-[11px] font-normal text-[var(--color-muted)]">(Select purpose)</span>
          </h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Choose a purpose to automatically calibrate conversational style, voice pacing, greeting, and suggested capabilities.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {AGENT_PURPOSES.map((purpose) => {
            const Icon = purpose.icon;
            const isSelected = selectedPurposeId === purpose.id;

            return (
              <div
                key={purpose.id}
                onClick={() => handlePurposeSelect(purpose)}
                className={`p-3.5 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex flex-col justify-between text-left relative ${
                  isSelected
                    ? "bg-[var(--color-primary-light)]/20 border-[var(--color-primary)] shadow-xs ring-1 ring-[var(--color-primary)]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border border-[var(--color-border)]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 pr-4">
                    <h3 className="text-xs font-bold text-[var(--color-heading)] leading-tight">
                      {purpose.title}
                    </h3>
                    <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-snug line-clamp-2">
                      {purpose.description}
                    </p>
                  </div>
                </div>

                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center shadow-2xs">
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Custom Role Fields if Custom is selected */}
      {selectedPurposeId === "custom" && (
        <div className="p-4 bg-[var(--color-surface-muted)]/50 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-3.5 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
            <h3 className="text-xs font-bold text-[var(--color-heading)]">Custom Role Details</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Role Name
              </label>
              <input
                type="text"
                value={customRoleName}
                onChange={(e) => {
                  setCustomRoleName(e.target.value);
                  setAgentData({ ...agentData, role: e.target.value });
                }}
                placeholder="e.g., Passbook Follow-Up Specialist"
                className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                What should this agent help customers with?
              </label>
              <input
                type="text"
                value={customHelpScope}
                onChange={(e) => setCustomHelpScope(e.target.value)}
                placeholder="e.g., Verify incomplete passbook applications and advise next steps"
                className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Success Criteria
              </label>
              <input
                type="text"
                value={customSuccessCriteria}
                onChange={(e) => setCustomSuccessCriteria(e.target.value)}
                placeholder="e.g., Confirm customer status and record missing document reasons"
                className="w-full h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
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
