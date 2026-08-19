import React from "react";
import {
  Bot,
  Volume2,
  Clock,
  Sparkles,
  ShieldCheck,
  Radio,
  CheckCircle2,
  Play
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { AgentLivePreview } from "../AgentLivePreview";
import { AgentConfig } from "../../types";

interface Step6TestPreviewProps {
  agentData: AgentConfig;
  onTestCall?: (agent: AgentConfig) => void;
}

export function Step6TestPreview({ agentData, onTestCall }: Step6TestPreviewProps) {
  const durationSec = agentData.runtime?.maximum_call_duration ?? 300;

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-heading)]">Test Your Agent</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Try a real-time conversation simulator before saving or activating your voice agent.
          </p>
        </div>
        <Badge variant="neutral" className="text-[10px] py-1 px-2.5 font-medium shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
          Testing Current Unsaved Config
        </Badge>
      </div>

      {/* Two Column Layout: Left Summary Card, Right Interactive Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Configuration Snapshot (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3.5 text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--color-border)]">
              <Bot className="w-4 h-4 text-[var(--color-primary)]" />
              <h3 className="font-bold text-[var(--color-heading)]">Configuration Active in Test</h3>
            </div>

            <div className="space-y-2">
              <div>
                <span className="text-[var(--color-muted)] text-[11px] block">Agent Identity</span>
                <span className="font-semibold text-[var(--color-heading)] block">{agentData.name}</span>
                <span className="text-[11px] text-[var(--color-muted)]">{agentData.role}</span>
              </div>

              <div className="pt-2 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-muted)] text-[11px] block">Voice & Engine</span>
                <span className="font-mono font-medium text-[var(--color-heading)]">
                  {agentData.voice?.voice} ({agentData.voice?.speed || 1.0}x)
                </span>
                <span className="text-[11px] text-[var(--color-muted)] block font-mono mt-0.5">
                  LLM: {agentData.llm?.model || "gpt-4o-mini"}
                </span>
              </div>

              <div className="pt-2 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-muted)] text-[11px] block">Communication Style</span>
                <span className="font-medium text-[var(--color-heading)]">
                  {agentData.communication_style || "Professional"}
                </span>
                <span className="text-[11px] text-[var(--color-muted)] block capitalize">
                  Response length: {agentData.response_length || "short"}
                </span>
              </div>

              <div className="pt-2 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-muted)] text-[11px] block">Safety & Limits</span>
                <span className="text-[var(--color-text)] block">
                  Max Duration: <strong>{Math.round(durationSec / 60)} min</strong>
                </span>
                <span className="text-[var(--color-text)] block">
                  Interruption: <strong>{agentData.runtime?.barge_in_enabled ? "Allowed" : "Disabled"}</strong>
                </span>
              </div>

              <div className="pt-2 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-muted)] text-[11px] block">Greeting Spoken</span>
                <p className="text-[11px] font-mono text-[var(--color-heading)] italic mt-0.5 bg-[var(--color-surface-muted)] p-2 rounded border border-[var(--color-border)]">
                  "{agentData.greeting}"
                </p>
              </div>
            </div>

            {onTestCall && (
              <div className="pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => onTestCall(agentData)}
                  className="w-full py-2 px-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-heading)] hover:border-[var(--color-primary)] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Receive Phone Call Test</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Conversation Simulator (8 cols) */}
        <div className="lg:col-span-8">
          <AgentLivePreview agentConfig={agentData} />
        </div>
      </div>
    </div>
  );
}
