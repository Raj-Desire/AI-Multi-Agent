import React, { useState, useEffect } from "react";
import {
  Sparkles,
  RefreshCw,
  Send,
  Sliders,
  HelpCircle,
  FileCode,
  Brain,
  Copy,
  Check,
  ShieldAlert,
  Volume2,
  Globe,
  Clock,
  RotateCcw,
  Zap,
  Info
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { AgentConfig } from "../../types";
import { fetchApi } from "../../api-client";
import { toast } from "sonner";

interface Step6PromptInstructionsProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export function Step6PromptInstructions({
  agentData,
  setAgentData
}: Step6PromptInstructionsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");
  const [copied, setCopied] = useState(false);

  // Auto-synthesize on first view if prompt is empty
  useEffect(() => {
    if (!agentData.system_prompt || !agentData.system_prompt.trim()) {
      handleGenerateInstructions(true);
    }
  }, []);

  async function handleGenerateInstructions(silent = false) {
    const desc = agentData.description || agentData.objective || "";
    if (!desc.trim()) {
      if (!silent) {
        toast.error("Description needed", {
          description: "Please enter an agent objective or description before generating instructions."
        });
      }
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
          role: agentData.role || "Assistant",
          description: desc,
          objective: agentData.objective || desc,
          communication_style: agentData.communication_style || "Professional + Friendly",
          response_length: agentData.response_length || "short",
          agent_type: (agentData as any).agent_type || "marketing",
          language: agentData.voice?.language || "en",
          skills: agentData.skills || [],
          custom_knowledge: agentData.custom_knowledge || "",
          guardrails: agentData.guardrails || {},
          personality: agentData.personality || {},
          include_business_knowledge: agentData.include_business_knowledge ?? true
        })
      });

      if (res) {
        setAgentData((prev) => ({
          ...prev,
          system_prompt: res.system_prompt,
          greeting: res.suggested_greeting || prev.greeting || "Hello! How can I help you today?",
          objective: res.suggested_objective || prev.objective || desc,
          voice: res.recommended_voice ? { ...(prev.voice as any), voice: res.recommended_voice } : prev.voice
        }));
        if (!silent) {
          toast.success("Instructions generated successfully!", {
            description: `Synthesized spoken prompt tailored for ${agentData.response_length || "short"} response length and configured tone.`
          });
        }
      }
    } catch (err: any) {
      console.error("Generate error:", err);
      if (!silent) {
        toast.error(err.message || "Failed to generate instructions.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRefineInstructions(customInstruction?: string) {
    const instructionToApply = customInstruction || refinementInput.trim();
    if (!instructionToApply) return;

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
          instruction: instructionToApply,
          name: agentData.name,
          role: agentData.role,
          description: agentData.description || agentData.objective,
          response_length: agentData.response_length || "short"
        })
      });

      if (res) {
        setAgentData((prev) => ({
          ...prev,
          system_prompt: res.system_prompt,
          greeting: res.suggested_greeting || prev.greeting || "Hello! How can I help you today?"
        }));
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

  const handleCopyPrompt = () => {
    if (!agentData.system_prompt) return;
    navigator.clipboard.writeText(agentData.system_prompt);
    setCopied(true);
    toast.success("Prompt copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const QUICK_REFINEMENT_PILLS = [
    { label: "+ Add 20% discount offer rule", prompt: "Add a 20% limited-time discount rule (Promo code SAVE20) if the caller asks about price or promotions." },
    { label: "+ Ask for email before wrap-up", prompt: "Always ask for the caller's email address before concluding the phone call." },
    { label: "+ Address price hesitation", prompt: "When caller hesitates on pricing, politely highlight ROI and offer a flexible monthly option." },
    { label: "+ Emphasize appointment booking", prompt: "Proactively guide the conversation to book a demo or scheduled appointment." },
    { label: "+ Friendly and warm demeanor", prompt: "Make the conversational tone extra warm, positive, and enthusiastic while maintaining brevity." }
  ];

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
          <h2 className="text-sm font-bold text-[var(--color-heading)]">AI Prompt & Instructions</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Synthesize, refine, and customize your agent's real-time spoken call script based on all configured parameters.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyPrompt}
            disabled={!agentData.system_prompt}
            leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            className="cursor-pointer text-xs h-8 px-2.5"
          >
            {copied ? "Copied" : "Copy"}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isGenerating}
            onClick={() => handleGenerateInstructions(false)}
            leftIcon={<Sparkles className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : "text-amber-300"}`} />}
            className="cursor-pointer text-xs h-8 px-3"
          >
            {isGenerating ? "Synthesizing Prompt..." : "Re-Generate with AI"}
          </Button>
        </div>
      </div>

      {/* Parameter Context Chips Banner */}
      <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            Parameters Integrated into this Prompt
          </span>
          <span className="text-[10px] text-[var(--color-muted)]">
            Configured in Steps 1–5
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="neutral" className="text-[11px] py-0.5 px-2 bg-[var(--color-surface)] border border-[var(--color-border)]">
            🎯 <strong>Role:</strong> {agentData.role || "Assistant"}
          </Badge>
          <Badge variant="primary" className="text-[11px] py-0.5 px-2">
            ⏱️ <strong>Length:</strong> {responseLengthLabel}
          </Badge>
          <Badge variant="neutral" className="text-[11px] py-0.5 px-2 bg-[var(--color-surface)] border border-[var(--color-border)]">
            🎭 <strong>Tone:</strong> {agentData.communication_style || "Professional"}
          </Badge>
          <Badge variant="neutral" className="text-[11px] py-0.5 px-2 bg-[var(--color-surface)] border border-[var(--color-border)]">
            🌐 <strong>Language:</strong> {agentData.voice?.language?.toUpperCase() || "EN"}
          </Badge>
          <Badge variant={agentData.include_business_knowledge ? "success" : "neutral"} className="text-[11px] py-0.5 px-2">
            🧠 <strong>Knowledge Base:</strong> {agentData.include_business_knowledge ? "Connected" : "Custom Only"}
          </Badge>
          <Badge variant="neutral" className="text-[11px] py-0.5 px-2 bg-[var(--color-surface)] border border-[var(--color-border)]">
            🛡️ <strong>Guardrails:</strong> {agentData.guardrails?.restricted_actions?.length || 0} active
          </Badge>
        </div>
      </div>

      {/* Main Prompt Editor Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            Spoken System Prompt (Directly Editable)
          </label>
          <span className="text-[11px] text-[var(--color-muted)] font-mono">
            {agentData.system_prompt?.length || 0} characters
          </span>
        </div>

        <textarea
          rows={11}
          value={agentData.system_prompt || ""}
          onChange={(e) => setAgentData({ ...agentData, system_prompt: e.target.value })}
          placeholder="Synthesizing your spoken prompt based on all selected parameters... You can also type or edit instructions directly here."
          className="w-full p-3.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-mono leading-relaxed shadow-2xs resize-y"
        />

        <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)] pt-0.5">
          <span>✨ You can edit this script directly, or use the AI Co-Pilot below to refine specific rules.</span>
          <span className="text-[10px] text-[var(--color-muted)]">Audio Rule: Keep spoken text free of markdown or emojis</span>
        </div>
      </div>

      {/* AI Co-Pilot / Model-Driven Prompt Refiner */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-[var(--color-heading)]">
              Refine Prompt with AI Co-Pilot
            </span>
          </div>
          <Badge variant="neutral" className="text-[10px] py-0 px-1.5 font-medium">
            Powered by GPT-4o
          </Badge>
        </div>

        <p className="text-[11px] text-[var(--color-muted)]">
          Ask the AI model to add a specific rule, handle objections, inject pricing guidelines, or change the speaking style.
        </p>

        {/* Quick Refinement Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {QUICK_REFINEMENT_PILLS.map((pill, i) => (
            <button
              key={i}
              type="button"
              disabled={isRefining}
              onClick={() => handleRefineInstructions(pill.prompt)}
              className="py-1 px-2.5 rounded-full text-[11px] font-medium bg-[var(--color-surface-muted)] hover:bg-[var(--color-primary)]/15 border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-heading)] hover:text-[var(--color-primary)] transition-all cursor-pointer shadow-2xs flex items-center gap-1"
            >
              <span>{pill.label}</span>
            </button>
          ))}
        </div>

        {/* Custom Input */}
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={refinementInput}
            onChange={(e) => setRefinementInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isRefining) handleRefineInstructions();
            }}
            placeholder="e.g., If the caller asks for pricing in INR, quote 50,000 INR per month with a 14-day free trial..."
            className="flex-1 h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isRefining || !refinementInput.trim()}
            onClick={() => handleRefineInstructions()}
            leftIcon={<Send className={`w-3 h-3 ${isRefining ? "animate-spin" : ""}`} />}
            className="cursor-pointer text-xs h-9 px-3.5 shrink-0"
          >
            {isRefining ? "Refining..." : "Refine with AI"}
          </Button>
        </div>
      </div>
    </div>
  );
}
