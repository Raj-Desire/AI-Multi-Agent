import React, { useState } from "react";
import {
  Bot,
  Volume2,
  Sliders,
  ShieldCheck,
  Cpu,
  Edit2,
  CheckCircle2,
  Save,
  ChevronLeft,
  Sparkles,
  AlertTriangle,
  Brain,
  FileCode,
  Check
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { AgentConfig } from "../../types";

interface Step7ReviewActivateProps {
  agentData: AgentConfig;
  saving: boolean;
  onJumpToStep: (stepId: number) => void;
  onSave: (activate: boolean) => void;
}

export function Step7ReviewActivate({
  agentData,
  saving,
  onJumpToStep,
  onSave
}: Step7ReviewActivateProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const durationSec = agentData.runtime?.maximum_call_duration ?? 300;
  const restrictedCount = agentData.guardrails?.restricted_actions?.length || 0;
  const escalationCount = agentData.guardrails?.escalation_rules?.length || 0;
  const enabledSkills = agentData.skills || [];

  const responseLengthLabel =
    agentData.response_length === "detailed"
      ? "Detailed (3–4 sentences)"
      : agentData.response_length === "balanced"
      ? "Balanced (2–3 sentences)"
      : "Short (1–2 sentences)";

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-heading)]">Review & Activate</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Verify all parameters, spoken prompt instructions, and guardrails before launching your AI voice agent.
          </p>
        </div>
      </div>

      {/* Review Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Card 1: Identity & Basics */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 font-bold text-[var(--color-heading)]">
              <Bot className="w-4 h-4 text-[var(--color-primary)]" />
              <span>1. Agent Identity</span>
            </div>
            <button
              type="button"
              onClick={() => onJumpToStep(1)}
              className="text-[var(--color-primary)] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Agent Name</span>
              <span className="font-semibold text-[var(--color-heading)] text-sm">{agentData.name}</span>
            </div>
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Role Title</span>
              <span className="font-medium text-[var(--color-heading)]">{agentData.role}</span>
            </div>
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Description</span>
              <p className="text-[var(--color-muted)] leading-relaxed">{agentData.description || "No description provided."}</p>
            </div>
          </div>
        </div>

        {/* Card 2: Role & Objective */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 font-bold text-[var(--color-heading)]">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>2. Role & Knowledge Base</span>
            </div>
            <button
              type="button"
              onClick={() => onJumpToStep(2)}
              className="text-[var(--color-primary)] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Primary Objective</span>
              <p className="text-[var(--color-text)] font-medium leading-relaxed">{agentData.objective}</p>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]">
              <span className="text-[var(--color-muted)]">Company Knowledge:</span>
              <Badge variant={agentData.include_business_knowledge ? "success" : "neutral"} size="sm">
                {agentData.include_business_knowledge ? "Connected" : "Disabled"}
              </Badge>
            </div>
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Capabilities ({enabledSkills.length})</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {enabledSkills.map((sk) => (
                  <Badge key={sk} variant="neutral" size="sm">
                    {sk}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Voice & Language */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 font-bold text-[var(--color-heading)]">
              <Volume2 className="w-4 h-4 text-[var(--color-primary)]" />
              <span>3. Voice & Engine</span>
            </div>
            <button
              type="button"
              onClick={() => onJumpToStep(3)}
              className="text-[var(--color-primary)] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Voice</span>
              <span className="font-mono font-medium text-[var(--color-heading)]">{agentData.voice?.voice}</span>
            </div>
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Speed</span>
              <span className="font-mono font-medium text-[var(--color-heading)]">{agentData.voice?.speed || 1.0}x</span>
            </div>
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Language</span>
              <span className="font-medium text-[var(--color-heading)]">{agentData.voice?.language?.toUpperCase() || "EN"}</span>
            </div>
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">LLM Model</span>
              <span className="font-mono font-medium text-[var(--color-heading)]">{agentData.llm?.model || "gpt-4o-mini"}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Personality & Communication */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 font-bold text-[var(--color-heading)]">
              <Sliders className="w-4 h-4 text-[var(--color-primary)]" />
              <span>4. Personality & Style</span>
            </div>
            <button
              type="button"
              onClick={() => onJumpToStep(4)}
              className="text-[var(--color-primary)] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-[var(--color-muted)] text-[11px] block">Spoken Greeting</span>
              <p className="text-[11px] font-mono text-[var(--color-heading)] italic mt-0.5 bg-[var(--color-surface-muted)] p-2 rounded border border-[var(--color-border)]">
                "{agentData.greeting}"
              </p>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-[var(--color-border)]">
              <span className="text-[var(--color-muted)]">Tone:</span>
              <span className="font-semibold text-[var(--color-heading)]">{agentData.communication_style || "Professional"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--color-muted)]">Response Length:</span>
              <span className="capitalize text-[var(--color-heading)] font-semibold text-[var(--color-primary)]">
                {responseLengthLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Card 5: Behavior & Safety Guardrails */}
        <div className="md:col-span-2 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 font-bold text-[var(--color-heading)]">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>5. Behavior & Safety Guardrails</span>
            </div>
            <button
              type="button"
              onClick={() => onJumpToStep(5)}
              className="text-[var(--color-primary)] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-2.5 bg-[var(--color-surface-muted)] rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-muted)] text-[11px] block">Max Duration</span>
              <span className="font-semibold text-[var(--color-heading)]">{Math.round(durationSec / 60)} minutes</span>
            </div>
            <div className="p-2.5 bg-[var(--color-surface-muted)] rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-muted)] text-[11px] block">Interruption (Barge-in)</span>
              <span className="font-semibold text-[var(--color-heading)]">
                {agentData.runtime?.barge_in_enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="p-2.5 bg-[var(--color-surface-muted)] rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-muted)] text-[11px] block">Silence Reprompt</span>
              <span className="font-semibold text-[var(--color-heading)]">
                {agentData.runtime?.silence_timeout ?? 5}s wait
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <span className="text-[11px] font-semibold text-[var(--color-heading)] block mb-1">
                Active Restrictions ({restrictedCount})
              </span>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[var(--color-muted)]">
                {(agentData.guardrails?.restricted_actions || []).slice(0, 3).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-[var(--color-heading)] block mb-1">
                Escalation Triggers ({escalationCount})
              </span>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[var(--color-muted)]">
                {(agentData.guardrails?.escalation_rules || []).slice(0, 3).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Card 6: AI Spoken Prompt & Instructions */}
        <div className="md:col-span-2 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 font-bold text-[var(--color-heading)]">
              <FileCode className="w-4 h-4 text-[var(--color-primary)]" />
              <span>6. AI Spoken Prompt & Instructions</span>
            </div>
            <button
              type="button"
              onClick={() => onJumpToStep(6)}
              className="text-[var(--color-primary)] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit Prompt</span>
            </button>
          </div>

          <div className="p-3 bg-[var(--color-surface-muted)] rounded border border-[var(--color-border)] max-h-36 overflow-y-auto">
            <p className="text-[11px] font-mono text-[var(--color-heading)] whitespace-pre-wrap leading-relaxed">
              {agentData.system_prompt?.trim() || "No prompt generated yet. Jump to Step 6 to synthesize your prompt."}
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title={`Activate "${agentData.name}"?`}
        maxWidth="sm"
      >
        <div className="space-y-4 text-left text-xs">
          <p className="text-[var(--color-text)] leading-relaxed">
            This agent will be marked as <strong>ACTIVE</strong> and will be immediately available for phone calls and campaigns in your organization.
          </p>
          <div className="p-3 bg-[var(--color-surface-muted)] rounded border border-[var(--color-border)] text-[11px] text-[var(--color-muted)]">
            You can modify prompts, voice settings, and guardrails at any time, which will automatically increment the agent version.
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={saving}
              onClick={() => {
                setShowConfirmModal(false);
                onSave(true);
              }}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
            >
              {saving ? "Activating..." : "Activate Agent"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
