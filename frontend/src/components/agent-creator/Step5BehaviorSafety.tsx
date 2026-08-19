import React, { useState } from "react";
import {
  ShieldAlert,
  Volume2,
  Clock,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle,
  Sliders,
  Check
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { CALL_DURATION_PRESETS } from "./constants";
import { AgentConfig } from "../../types";

interface Step5BehaviorSafetyProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export function Step5BehaviorSafety({
  agentData,
  setAgentData
}: Step5BehaviorSafetyProps) {
  // New rule inputs
  const [newRestriction, setNewRestriction] = useState("");
  const [newEscalation, setNewEscalation] = useState("");

  // Advanced collapsible
  const [showAdvancedRuntime, setShowAdvancedRuntime] = useState(false);

  const restrictedActions = agentData.guardrails?.restricted_actions || [];
  const escalationRules = agentData.guardrails?.escalation_rules || [];

  const handleAddRestriction = () => {
    if (!newRestriction.trim()) return;
    setAgentData((prev) => ({
      ...prev,
      guardrails: {
        ...prev.guardrails!,
        restricted_actions: [...(prev.guardrails?.restricted_actions || []), newRestriction.trim()]
      }
    }));
    setNewRestriction("");
  };

  const handleRemoveRestriction = (index: number) => {
    setAgentData((prev) => ({
      ...prev,
      guardrails: {
        ...prev.guardrails!,
        restricted_actions: (prev.guardrails?.restricted_actions || []).filter((_, i) => i !== index)
      }
    }));
  };

  const handleAddEscalation = () => {
    if (!newEscalation.trim()) return;
    setAgentData((prev) => ({
      ...prev,
      guardrails: {
        ...prev.guardrails!,
        escalation_rules: [...(prev.guardrails?.escalation_rules || []), newEscalation.trim()]
      }
    }));
    setNewEscalation("");
  };

  const handleRemoveEscalation = (index: number) => {
    setAgentData((prev) => ({
      ...prev,
      guardrails: {
        ...prev.guardrails!,
        escalation_rules: (prev.guardrails?.escalation_rules || []).filter((_, i) => i !== index)
      }
    }));
  };

  const currentDurationSeconds = agentData.runtime?.maximum_call_duration ?? 300;

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5">
        <h2 className="text-sm font-bold text-[var(--color-heading)]">Behavior & Safety</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Configure real-time interruption handling, silence reprompts, maximum duration, guardrails, and escalation triggers.
        </p>
      </div>

      {/* Section 1: Interruption Handling */}
      <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-[var(--color-heading)]">
            Allow customer to interrupt the agent
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            When enabled, the agent immediately stops speaking when the customer starts talking.
          </p>
        </div>
        <input
          type="checkbox"
          checked={agentData.runtime?.barge_in_enabled ?? true}
          onChange={(e) => setAgentData({
            ...agentData,
            runtime: { ...agentData.runtime!, barge_in_enabled: e.target.checked }
          })}
          className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
        />
      </div>

      {/* Section 2: Silence Handling */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3.5">
        <div>
          <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Silence Handling Rule</span>
          </h3>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            Define what the agent does if the caller goes quiet during the phone call.
          </p>
        </div>

        <div className="p-3 bg-[var(--color-surface-muted)]/60 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-[var(--color-muted)] font-medium shrink-0">1. If the customer becomes silent, wait:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="3"
                max="30"
                value={agentData.runtime?.silence_timeout ?? 5}
                onChange={(e) => setAgentData({
                  ...agentData,
                  runtime: { ...agentData.runtime!, silence_timeout: parseInt(e.target.value) || 5 }
                })}
                className="w-16 h-7 px-2 text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-center text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-bold"
              />
              <span className="text-[var(--color-heading)] font-semibold">seconds</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[var(--color-muted)] font-medium block">2. Then say this reprompt message:</span>
            <input
              type="text"
              value={agentData.runtime?.silence_reprompt_message ?? "Are you still there? I'm here if you have any questions."}
              onChange={(e) => setAgentData({
                ...agentData,
                runtime: { ...agentData.runtime!, silence_reprompt_message: e.target.value }
              })}
              placeholder="e.g., Are you still there? I'm happy to help if you have any questions."
              className="w-full h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-[var(--color-border)]">
            <span className="text-[var(--color-muted)] font-medium shrink-0">3. If there is still no response, wait:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="2"
                max="30"
                value={agentData.runtime?.silence_hangup_delay ?? 5}
                onChange={(e) => setAgentData({
                  ...agentData,
                  runtime: { ...agentData.runtime!, silence_hangup_delay: parseInt(e.target.value) || 5 }
                })}
                className="w-16 h-7 px-2 text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-center text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-bold"
              />
              <span className="text-[var(--color-heading)] font-semibold">seconds</span>
              <span className="text-[var(--color-muted)]">&rarr; Then end the call politely.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Call Duration & Goodbye Message */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Maximum Call Duration */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Maximum Call Duration</span>
            </label>
            <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
              {Math.round(currentDurationSeconds / 60)} min ({currentDurationSeconds}s)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "1 min", sec: 60 },
              { label: "3 min", sec: 180 },
              { label: "5 min", sec: 300 },
              { label: "10 min", sec: 600 },
              { label: "15 min", sec: 900 },
              { label: "30 min", sec: 1800 }
            ].map((p) => {
              const isSelected = currentDurationSeconds === p.sec;
              return (
                <button
                  key={p.sec}
                  type="button"
                  onClick={() => setAgentData({
                    ...agentData,
                    runtime: { ...agentData.runtime!, maximum_call_duration: p.sec }
                  })}
                  className={`py-1.5 px-2 rounded-[var(--radius-main,0.375rem)] text-xs font-medium border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-2xs font-semibold"
                      : "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">
            If reached, the AI finishes answering the caller's last question, speaks the goodbye message, and ends the call.
          </p>
        </div>

        {/* Goodbye Message */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2">
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Call Ending & Goodbye Message
          </label>
          <input
            type="text"
            value={agentData.runtime?.conclusion_message ?? "Thank you for your time. Have a great day!"}
            onChange={(e) => setAgentData({
              ...agentData,
              runtime: { ...agentData.runtime!, conclusion_message: e.target.value }
            })}
            placeholder="e.g., Thank you for your time. Have a wonderful day!"
            className="w-full h-8 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
          />
          <p className="text-[11px] text-[var(--color-muted)]">
            Spoken right before the agent gracefully hangs up live calls.
          </p>
        </div>
      </div>

      {/* Section 4: What the Agent Should Not Do (Guardrails) */}
      <div className="space-y-3 pt-2">
        <div>
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            What the Agent Should Not Do (Safety Guardrails)
          </label>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            Strict behavioral limitations enforced during telephone conversations.
          </p>
        </div>

        <div className="space-y-1.5">
          {restrictedActions.map((rule, idx) => (
            <div
              key={idx}
              className="p-2 px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] flex items-center justify-between text-xs shadow-2xs group"
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-[var(--color-heading)] font-medium truncate">{rule}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveRestriction(idx)}
                className="text-[var(--color-muted)] hover:text-red-500 transition-colors p-1 cursor-pointer"
                title="Remove rule"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add Rule Row */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newRestriction}
              onChange={(e) => setNewRestriction(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddRestriction(); }}
              placeholder="Add a new safety restriction (e.g. Never promise legal commitments)..."
              className="flex-1 h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!newRestriction.trim()}
              onClick={handleAddRestriction}
              leftIcon={<Plus className="w-3 h-3" />}
              className="cursor-pointer text-xs h-8 px-3 shrink-0"
            >
              + Add Rule
            </Button>
          </div>
        </div>
      </div>

      {/* Section 5: When Should the Agent Get Help? (Escalation Rules) */}
      <div className="space-y-3 pt-2">
        <div>
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            When Should the Agent Get Help? (Escalation Triggers)
          </label>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            Conditions under which the agent routes the caller to a human or logs an urgent callback.
          </p>
        </div>

        <div className="space-y-1.5">
          {escalationRules.map((rule, idx) => (
            <div
              key={idx}
              className="p-2 px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] flex items-center justify-between text-xs shadow-2xs group"
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[var(--color-heading)] font-medium truncate">{rule}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveEscalation(idx)}
                className="text-[var(--color-muted)] hover:text-red-500 transition-colors p-1 cursor-pointer"
                title="Remove escalation trigger"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add Escalation Row */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newEscalation}
              onChange={(e) => setNewEscalation(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddEscalation(); }}
              placeholder="Add an escalation condition (e.g. Caller asks for supervisor twice)..."
              className="flex-1 h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!newEscalation.trim()}
              onClick={handleAddEscalation}
              leftIcon={<Plus className="w-3 h-3" />}
              className="cursor-pointer text-xs h-8 px-3 shrink-0"
            >
              + Add Escalation Trigger
            </Button>
          </div>
        </div>
      </div>

      {/* Section 6: Advanced Technical Runtime Settings (Collapsible) */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowAdvancedRuntime(!showAdvancedRuntime)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--color-heading)] bg-[var(--color-surface-muted)]/50 hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Advanced Runtime Diagnostics & Timers (Optional)</span>
          </div>
          {showAdvancedRuntime ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
        </button>

        {showAdvancedRuntime && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[var(--color-border)] animate-fade-in text-xs">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Customer Response Timeout (seconds)
              </label>
              <input
                type="number"
                min="5"
                max="60"
                value={agentData.runtime?.customer_response_timeout || 15}
                onChange={(e) => setAgentData({
                  ...agentData,
                  runtime: { ...agentData.runtime!, customer_response_timeout: parseInt(e.target.value) || 15 }
                })}
                className="w-full h-8 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Retry Attempts
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={agentData.runtime?.retry_attempts || 2}
                onChange={(e) => setAgentData({
                  ...agentData,
                  runtime: { ...agentData.runtime!, retry_attempts: parseInt(e.target.value) || 2 }
                })}
                className="w-full h-8 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded font-mono"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
