import React from "react";
import {
  Check,
  Brain,
  Sparkles,
  BookOpen,
  HelpCircle,
  Layers
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { AVAILABLE_CAPABILITIES } from "./constants";
import { AgentConfig } from "../../types";

interface Step2RoleConversationProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
  selectedPurposeId: string;
}

export function Step2RoleConversation({
  agentData,
  setAgentData,
  selectedPurposeId
}: Step2RoleConversationProps) {
  const currentCaps: string[] = agentData.skills || [];

  const toggleCapability = (id: string) => {
    const next = currentCaps.includes(id)
      ? currentCaps.filter((c) => c !== id)
      : [...currentCaps, id];
    setAgentData({ ...agentData, skills: next });
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5">
        <h2 className="text-sm font-bold text-[var(--color-heading)]">Role & Business Knowledge</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Define the primary objective of your calls, opening greeting, capabilities, and business knowledge facts.
        </p>
      </div>

      {/* Section 1: Objective & Greeting */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Primary Agent Objective <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            type="text"
            value={agentData.objective || ""}
            onChange={(e) => setAgentData({ ...agentData, objective: e.target.value })}
            placeholder="e.g., Qualify inbound real-estate buyer leads and schedule tours"
            className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
          />
          <p className="text-[11px] text-[var(--color-muted)]">
            In 1–2 sentences, what is the single most important goal of every phone call?
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Spoken Telephone Opening Greeting <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            type="text"
            value={agentData.greeting || ""}
            onChange={(e) => setAgentData({ ...agentData, greeting: e.target.value })}
            placeholder="e.g., Hi! Thanks for calling Desire AI. How can I help you today?"
            className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
          />
          <p className="text-[11px] text-[var(--color-muted)]">
            The exact first sentence the AI speaks immediately upon answering the phone.
          </p>
        </div>
      </div>

      {/* Section 2: Conversational Capabilities */}
      <div className="space-y-3 pt-3 border-t border-[var(--color-border)]">
        <div>
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Conversational Capabilities & Skills
          </label>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            Select the pre-trained workflows and skills to enable for this agent.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {AVAILABLE_CAPABILITIES.map((cap) => {
            const isEnabled = currentCaps.includes(cap.id);
            return (
              <div
                key={cap.id}
                onClick={() => toggleCapability(cap.id)}
                className={`p-3 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex items-start gap-2.5 ${
                  isEnabled
                    ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)] text-[var(--color-heading)] shadow-2xs"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border)]/80 text-[var(--color-muted)]"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                    isEnabled
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  {isEnabled && <Check className="w-3 h-3 stroke-[2.5]" />}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-[var(--color-heading)] leading-snug">
                    {cap.label}
                  </h4>
                  <p className="text-[11px] leading-tight mt-0.5 opacity-80">
                    {cap.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Verified Company Knowledge Base */}
      <div className="space-y-3 pt-3 border-t border-[var(--color-border)]">
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-[var(--color-primary)]" />
                Organization Business Knowledge Base
              </span>
              <Badge variant="primary" className="text-[10px] py-0 px-1.5 font-semibold">
                Auto-Integrated
              </Badge>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agentData.include_business_knowledge ?? true}
                onChange={(e) =>
                  setAgentData({
                    ...agentData,
                    include_business_knowledge: e.target.checked
                  })
                }
                className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
              />
              <span className="text-xs font-medium text-[var(--color-heading)]">
                Include in Calls
              </span>
            </label>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
            When enabled, this agent automatically knows your company services, head office address, operating hours, email, phone, and standard FAQs configured in <strong>Company Knowledge</strong>.
          </p>

          <div className="pt-2 border-t border-[var(--color-border)]/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-[var(--color-heading)]">
                Additional Custom Knowledge & Specific Facts (Optional)
              </label>
              <span className="text-[10px] text-[var(--color-muted)]">
                Agent-specific context
              </span>
            </div>
            <textarea
              rows={2}
              value={agentData.custom_knowledge || ""}
              onChange={(e) => setAgentData({ ...agentData, custom_knowledge: e.target.value })}
              placeholder="e.g. Special promotion: 20% discount on first-time consultations this month. In-person meetings require 24 hours prior notice."
              className="w-full p-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
