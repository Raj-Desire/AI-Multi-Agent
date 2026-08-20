import React from "react";
import { Check } from "lucide-react";
import { CREATOR_STEPS } from "./constants";

interface AgentStepperProps {
  currentStep: number;
  onSelectStep: (stepId: number) => void;
}

export function AgentStepper({ currentStep, onSelectStep }: AgentStepperProps) {
  return (
    <nav aria-label="Creation Progress" className="p-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs select-none">
      <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 list-none m-0 p-0">
        {CREATOR_STEPS.map((step) => {
          const isCurrent = step.id === currentStep;
          const isCompleted = step.id < currentStep;

          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelectStep(step.id)}
                className={`w-full flex items-center justify-center gap-1.5 py-2 px-2 rounded-[var(--radius-main,0.375rem)] text-xs font-medium transition-all cursor-pointer text-center ${
                  isCurrent
                    ? "bg-[var(--color-primary)] text-white shadow-xs font-semibold ring-1 ring-[var(--color-primary)]"
                    : isCompleted
                    ? "bg-[var(--color-surface-muted)] text-[var(--color-heading)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)] font-medium border border-[var(--color-border)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                    isCurrent
                      ? "bg-white/20 text-white font-bold"
                      : isCompleted
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-border)] text-[var(--color-muted)] font-mono"
                  }`}
                >
                  {isCompleted ? <Check className="w-2.5 h-2.5 stroke-[2.5]" /> : step.id}
                </span>
                <span className="truncate">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
