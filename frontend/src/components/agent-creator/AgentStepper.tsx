import React from "react";
import { Check } from "lucide-react";
import { CREATOR_STEPS } from "./constants";
import { InfoTooltip } from "../ui/Tooltip";
import { AgentConfig } from "../../types";

interface AgentStepperProps {
  currentStep: number;
  onSelectStep: (stepId: number) => void;
  agentData?: AgentConfig;
}

export function isStepCompleted(stepId: number, agentData?: AgentConfig): boolean {
  if (!agentData) return false;

  switch (stepId) {
    case 1: // Basics: Name and Description
      return Boolean(agentData.name?.trim() && agentData.description?.trim());

    case 2: // Role & Knowledge: Role and Objective
      return Boolean(agentData.role?.trim() && agentData.objective?.trim());

    case 3: // Voice & Speech: Voice selection and language
      return Boolean(agentData.voice?.voice && (agentData.voice?.language || (agentData as any).language));

    case 4: // Personality: Communication style and response length
      return Boolean(agentData.communication_style?.trim() && agentData.response_length?.trim());

    case 5: // Behavior & Safety: Call duration runtime and safety settings configured
      return Boolean(agentData.runtime?.maximum_call_duration && agentData.guardrails);

    case 6: // Prompt & Greeting: Opening greeting and System prompt
      return Boolean(agentData.greeting?.trim() && agentData.system_prompt?.trim());

    case 7: // Test Simulator: Completed when prerequisite core configuration (steps 1, 2, 3, 6) are ready
      return Boolean(
        agentData.name?.trim() &&
        agentData.objective?.trim() &&
        agentData.voice?.voice &&
        agentData.greeting?.trim()
      );

    case 8: // Review & Launch: Completed when agent has name and is ready to deploy
      return Boolean(
        agentData.name?.trim() &&
        agentData.description?.trim() &&
        agentData.objective?.trim() &&
        agentData.voice?.voice &&
        agentData.greeting?.trim()
      );

    default:
      return false;
  }
}

export function AgentStepper({ currentStep, onSelectStep, agentData }: AgentStepperProps) {
  return (
    <nav aria-label="Creation Progress" className="p-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs select-none w-full">
      <ol className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-1.5 list-none m-0 p-0 w-full">
        {CREATOR_STEPS.map((step) => {
          const isCurrent = step.id === currentStep;
          const isCompleted = isStepCompleted(step.id, agentData);

          return (
            <li key={step.id} className="relative">
              <div
                className={`w-full group relative flex items-center justify-between gap-1 py-1.5 px-2 rounded-[var(--radius-main,0.375rem)] text-xs font-medium transition-all ${
                  isCurrent
                    ? "bg-[var(--color-primary)] text-white shadow-xs font-semibold ring-1 ring-[var(--color-primary)]"
                    : isCompleted
                    ? "bg-[var(--color-surface)] text-[var(--color-heading)] border border-[var(--color-border)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] font-medium"
                    : "text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectStep(step.id)}
                  className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer text-left focus:outline-none"
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 transition-colors ${
                      isCurrent
                        ? isCompleted
                          ? "bg-white text-[var(--color-primary)] font-bold shadow-2xs"
                          : "bg-white/20 text-white font-bold"
                        : isCompleted
                        ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] font-bold border border-[var(--color-primary)]/30"
                        : "bg-[var(--color-border)] text-[var(--color-muted)] font-mono"
                    }`}
                  >
                    {isCompleted ? <Check className="w-2.5 h-2.5 stroke-[2.5]" /> : step.id}
                  </span>
                  <span className={`truncate ${isCompleted && !isCurrent ? "text-[var(--color-heading)]" : ""}`}>
                    {step.label}
                  </span>
                </button>

                {/* Step Info Tooltip */}
                <InfoTooltip
                  content={
                    <div className="space-y-1 text-left">
                      <p className="font-bold text-white text-[11px] flex items-center justify-between gap-2">
                        <span>Step {step.id}: {step.title}</span>
                        {isCompleted && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/20 text-white font-semibold">
                            Completed
                          </span>
                        )}
                      </p>
                      <p className="text-slate-300 text-[10px] leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  }
                  position="bottom"
                  size={12}
                  iconClassName={
                    isCurrent
                      ? "text-white/80 hover:text-white"
                      : "text-[var(--color-muted)] hover:text-[var(--color-primary)]"
                  }
                />
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
