import React, { useState } from "react";
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  Send,
  Sliders,
  HelpCircle,
  FileCode
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { AVAILABLE_CAPABILITIES } from "./constants";
import { AgentConfig } from "../../types";
import { fetchApi } from "../../api-client";

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
  // Generation & Refinement state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Accordion toggles
  const [showCoPilot, setShowCoPilot] = useState(false);
  const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(false);

  const toggleCapability = (capLabel: string) => {
    const current = agentData.skills || [];
    const updated = current.includes(capLabel)
      ? current.filter((s) => s !== capLabel)
      : [...current, capLabel];
    setAgentData({ ...agentData, skills: updated });
  };

  async function handleGenerateInstructions() {
    const desc = (agentData.description || agentData.objective || "").trim();
    if (!desc) {
      setStatusFeedback("Please ensure your agent has an objective or description before generating instructions.");
      return;
    }

    try {
      setIsGenerating(true);
      setStatusFeedback(null);

      const res = await fetchApi<{
        system_prompt: string;
        suggested_greeting?: string;
        suggested_objective?: string;
        recommended_voice?: string;
      }>("/agents/generate-prompt", {
        method: "POST",
        body: JSON.stringify({
          name: agentData.name || "Voice Agent",
          description: desc,
          agent_type: selectedPurposeId,
          role: agentData.role || "Voice Consultant",
          objective: agentData.objective || desc,
          communication_style: agentData.communication_style || "Professional"
        })
      });

      if (res) {
        setAgentData((prev) => ({
          ...prev,
          system_prompt: res.system_prompt,
          greeting: res.suggested_greeting || prev.greeting,
          objective: res.suggested_objective || prev.objective || desc,
          voice: res.recommended_voice ? { ...prev.voice, voice: res.recommended_voice } : prev.voice
        }));
        setStatusFeedback("✨ Spoken instructions and greeting generated with Azure GPT-4o!");
      }
    } catch (err: any) {
      console.error("Generate error:", err);
      setStatusFeedback(err.message || "Failed to generate instructions.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRefineInstructions() {
    if (!refinementInput.trim()) return;
    if (!agentData.system_prompt) {
      await handleGenerateInstructions();
    }

    try {
      setIsRefining(true);
      setStatusFeedback(null);

      const res = await fetchApi<{
        system_prompt: string;
        suggested_greeting?: string;
        summary_of_changes?: string;
      }>("/agents/refine-prompt", {
        method: "POST",
        body: JSON.stringify({
          current_prompt: agentData.system_prompt || "",
          user_instruction: refinementInput.trim(),
          agent_name: agentData.name,
          role: agentData.role
        })
      });

      if (res) {
        setAgentData((prev) => ({
          ...prev,
          system_prompt: res.system_prompt,
          greeting: res.suggested_greeting || prev.greeting
        }));
        setStatusFeedback(`✨ ${res.summary_of_changes || "Instructions updated successfully!"}`);
        setRefinementInput("");
      }
    } catch (err: any) {
      console.error("Refine error:", err);
      setStatusFeedback(err.message || "Failed to refine instructions.");
    } finally {
      setIsRefining(false);
    }
  }

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5">
        <h2 className="text-sm font-bold text-[var(--color-heading)]">Role & Conversation</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Define what the agent should accomplish during a call and how it should guide the conversation.
        </p>
      </div>

      {/* Section 1: Primary Objective */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-[var(--color-heading)]">
          Primary Objective <span className="text-[var(--color-danger)]">*</span>
        </label>
        <textarea
          rows={3}
          value={agentData.objective}
          onChange={(e) => setAgentData({ ...agentData, objective: e.target.value })}
          placeholder="e.g., Follow up with customers who have not completed their passbook request and help them understand the next step."
          className="w-full p-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium shadow-2xs leading-relaxed"
        />
        <p className="text-[11px] text-[var(--color-muted)]">
          In 1–2 sentences, what is the single most important goal of every phone call?
        </p>
      </div>

      {/* Section 2: What can the agent help with? */}
      <div className="space-y-2.5 pt-2">
        <div>
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            What can the agent help with?
          </label>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            Select the specific capabilities and actions enabled for this voice agent.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AVAILABLE_CAPABILITIES.map((cap) => {
            const isEnabled = (agentData.skills || []).includes(cap.id);

            return (
              <div
                key={cap.id}
                onClick={() => toggleCapability(cap.id)}
                className={`p-2.5 rounded-[var(--radius-main,0.375rem)] border flex items-start gap-2.5 cursor-pointer transition-all ${
                  isEnabled
                    ? "bg-[var(--color-primary-light)]/20 border-[var(--color-primary)] shadow-2xs"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
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
                  <p className="text-[11px] text-[var(--color-muted)] leading-tight mt-0.5">
                    {cap.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: AI Instructions */}
      <div className="space-y-3 pt-3 border-t border-[var(--color-border)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              AI Spoken Instructions
            </label>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              These instructions tell the AI how to behave during calls. You can edit them directly or generate them automatically.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isGenerating}
            onClick={handleGenerateInstructions}
            leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-300" />}
            className="cursor-pointer text-xs h-8 px-3 shrink-0"
          >
            {isGenerating ? "Generating Instructions..." : "Generate Instructions"}
          </Button>
        </div>

        {statusFeedback && (
          <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-xs text-[var(--color-heading)] flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
            <span>{statusFeedback}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <textarea
            rows={5}
            value={agentData.system_prompt || ""}
            onChange={(e) => setAgentData({ ...agentData, system_prompt: e.target.value })}
            placeholder="Click 'Generate Instructions' above to auto-create spoken conversational instructions based on your role and objective, or write custom instructions here..."
            className="w-full p-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-mono leading-relaxed shadow-2xs"
          />
        </div>

        {/* Collapsible: AI Instruction Co-Pilot */}
        <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] overflow-hidden shadow-2xs">
          <button
            type="button"
            onClick={() => setShowCoPilot(!showCoPilot)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--color-heading)] bg-[var(--color-surface-muted)]/50 hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Refine with AI Co-Pilot (Optional)</span>
            </div>
            {showCoPilot ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
          </button>

          {showCoPilot && (
            <div className="p-3.5 space-y-2.5 border-t border-[var(--color-border)] animate-fade-in text-xs">
              <p className="text-[11px] text-[var(--color-muted)]">
                Ask the AI Co-Pilot to add specific rules or modify the spoken style without rewriting the instructions manually.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refinementInput}
                  onChange={(e) => setRefinementInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRefineInstructions(); }}
                  placeholder="e.g., Add a 20% discount offer code SAVE20, or be more firm on budget qualification..."
                  className="flex-1 h-8 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRefining || !refinementInput.trim()}
                  onClick={handleRefineInstructions}
                  leftIcon={<Send className="w-3 h-3" />}
                  className="cursor-pointer text-xs h-8 px-3"
                >
                  {isRefining ? "Applying..." : "Apply"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
