import React from "react";
import { ChevronLeft, Play, Save, CheckCircle2, Bot, GitFork, ChevronDown } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { DEFAULT_CONVERSATION_FLOWS } from "./constants";
import { AgentConfig } from "../../types";

interface AgentStepHeaderProps {
  agentData: AgentConfig;
  initialAgent?: AgentConfig | null;
  currentStep: number;
  totalSteps: number;
  currentStepLabel: string;
  saving: boolean;
  onBack: () => void;
  onSave: (activate: boolean) => void;
  onTestCall?: (agent: AgentConfig) => void;
}

export function AgentStepHeader({
  agentData,
  initialAgent,
  currentStep,
  totalSteps,
  currentStepLabel,
  saving,
  onBack,
  onSave,
  onTestCall
}: AgentStepHeaderProps) {
  return (
    <header className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Left: Back button + Agent Identity */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          leftIcon={<ChevronLeft className="w-4 h-4" />}
          className="cursor-pointer font-medium text-xs h-8 px-2.5"
        >
          Back to Agents
        </Button>

        <div className="h-5 w-px bg-[var(--color-border)] hidden sm:block" />

        <div className="flex items-center gap-2.5">
          <div
            style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary)" }}
            className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center shadow-2xs shrink-0"
          >
            <Bot className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-[var(--color-heading)] tracking-tight truncate max-w-[260px] sm:max-w-[340px]">
                {initialAgent ? `Edit: ${agentData.name || initialAgent.name}` : (agentData.name || "Create AI Voice Agent")}
              </h1>
              <Badge
                variant={agentData.status === "ACTIVE" ? "success" : "neutral"}
                className="text-[10px] py-0 px-1.5 font-medium"
              >
                {agentData.status === "ACTIVE" ? "Active" : "Draft"}
              </Badge>
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              Step {currentStep} of {totalSteps}: <strong className="text-[var(--color-heading)]">{currentStepLabel}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 self-end sm:self-center">
        {/* Conversation Flow Hover Popover */}
        <div className="relative group">
          <button
            type="button"
            className="flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] text-[var(--color-heading)] rounded-[var(--radius-main,0.375rem)] shadow-2xs transition-colors cursor-pointer"
            title="View standard phone call conversation progression"
          >
            <GitFork className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Conversation Flow</span>
            <ChevronDown className="w-3 h-3 opacity-60 group-hover:rotate-180 transition-transform duration-200" />
          </button>

          {/* Popover Card on Hover */}
          <div className="absolute right-0 top-full mt-1.5 w-80 sm:w-96 p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-xl z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto text-left">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-heading)]">
                <GitFork className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Standard Conversation Flow</span>
              </div>
              <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">6 Steps</Badge>
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mb-2.5">
              The logical conversational progression followed on live telephone calls:
            </p>
            <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
              {DEFAULT_CONVERSATION_FLOWS.map((flow, index) => (
                <div
                  key={flow.id}
                  className="p-2 bg-[var(--color-surface-muted)]/60 hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-left transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-heading)]">
                    <span className="w-4 h-4 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-[10px] font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <span>{flow.title.replace(/^\d+\.\s*/, "")}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5 pl-5.5 leading-snug">
                    {flow.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {onTestCall && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onTestCall(agentData)}
            leftIcon={<Play className="w-3.5 h-3.5 text-emerald-500" />}
            className="cursor-pointer text-xs h-8 px-3"
            title="Test current unsaved configuration over real telephone"
          >
            Test Call
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => onSave(false)}
          leftIcon={<Save className="w-3.5 h-3.5" />}
          className="cursor-pointer text-xs h-8 px-3"
        >
          Save Draft
        </Button>

        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={saving}
          onClick={() => onSave(true)}
          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          className="cursor-pointer text-xs h-8 px-3.5 font-semibold"
        >
          {saving ? "Saving..." : "Activate"}
        </Button>
      </div>
    </header>
  );
}
