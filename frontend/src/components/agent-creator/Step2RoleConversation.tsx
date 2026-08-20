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
  FileCode,
  Brain
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { AVAILABLE_CAPABILITIES } from "./constants";
import { AgentConfig } from "../../types";
import { fetchApi } from "../../api-client";
import { toast } from "sonner";

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
  const [showCoPilot, setShowCoPilot] = useState(false);

  const currentCaps: string[] = agentData.skills || [];

  const toggleCapability = (id: string) => {
    const next = currentCaps.includes(id)
      ? currentCaps.filter((c) => c !== id)
      : [...currentCaps, id];
    setAgentData({ ...agentData, skills: next });
  };

  async function handleGenerateInstructions() {
    const desc = agentData.description || agentData.objective || "";
    if (!desc.trim()) {
      toast.error("Description needed", {
        description: "Please enter an agent objective or description before generating instructions."
      });
      return;
    }

    try {
      setIsGenerating(true);

      const res = await fetchApi<{
        system_prompt: string;
        suggested_greeting?: string;
        suggested_objective?: string;
        communication_style?: string;
        recommended_voice?: string;
      }>("/agents/generate-prompt", {
        method: "POST",
        body: JSON.stringify({
          name: agentData.name || "Voice Assistant",
          description: desc,
          objective: agentData.objective || desc,
          communication_style: agentData.communication_style || "Professional + Friendly",
          agent_type: (agentData as any).agent_type || "marketing"
        })
      });

      if (res) {
        setAgentData({
          ...agentData,
          system_prompt: res.system_prompt,
          greeting: res.suggested_greeting || agentData.greeting || "Hello! How can I help you today?",
          objective: res.suggested_objective || agentData.objective || desc,
          voice: res.recommended_voice ? { ...(agentData.voice as any), voice: res.recommended_voice } : agentData.voice
        });
        toast.success("Instructions generated successfully!", {
          description: "Synthesized natural spoken conversational instructions with Azure GPT-4o."
        });
      }
    } catch (err: any) {
      console.error("Generate error:", err);
      toast.error(err.message || "Failed to generate instructions.");
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
        setAgentData({
          ...agentData,
          system_prompt: res.system_prompt,
          greeting: res.suggested_greeting || agentData.greeting || "Hello! How can I help you today?"
        });
        toast.success(res.summary_of_changes || "Instructions refined successfully!");
        setRefinementInput("");
      }
    } catch (err: any) {
      console.error("Refine error:", err);
      toast.error(err.message || "Failed to refine instructions.");
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
          Define what this agent does, its key conversational capabilities, and spoken instructions.
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

      {/* Section 4: AI Spoken Instructions */}
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
