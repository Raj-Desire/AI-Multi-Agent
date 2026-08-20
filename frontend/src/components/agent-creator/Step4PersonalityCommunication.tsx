import React, { useState } from "react";
import {
  Sliders,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Volume2,
  Smile
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { COMMUNICATION_STYLES } from "./constants";
import { AgentConfig, AgentPersonality } from "../../types";

interface Step4PersonalityCommunicationProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export function Step4PersonalityCommunication({
  agentData,
  setAgentData
}: Step4PersonalityCommunicationProps) {
  const [showAdvancedPersonality, setShowAdvancedPersonality] = useState(false);

  const updatePersonality = (key: keyof AgentPersonality, val: number) => {
    setAgentData((prev) => ({
      ...prev,
      personality: { ...prev.personality, [key]: val }
    }));
  };

  const primaryStyle = (agentData.communication_style || "").split("+")[0]?.trim() || "Professional";
  const secondaryStyle = (agentData.communication_style || "").split("+")[1]?.trim() || "Friendly";

  const handleStyleChange = (prim: string, sec?: string) => {
    const combined = sec && sec !== "None" ? `${prim} + ${sec}` : prim;
    setAgentData({ ...agentData, communication_style: combined });
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5">
        <h2 className="text-sm font-bold text-[var(--color-heading)]">Personality & Style</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Define your agent's conversational tone, turn response length, and core personality traits.
        </p>
      </div>

      {/* Section 1: Communication Style & Response Length */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Style selection */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Communication Style
            </label>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              Select primary and optional secondary tone.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-[var(--color-muted)] block mb-1">Primary Tone</span>
              <select
                value={primaryStyle}
                onChange={(e) => handleStyleChange(e.target.value, secondaryStyle)}
                className="w-full h-8 px-2 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium cursor-pointer"
              >
                {COMMUNICATION_STYLES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-[11px] text-[var(--color-muted)] block mb-1">Secondary Tone</span>
              <select
                value={secondaryStyle}
                onChange={(e) => handleStyleChange(primaryStyle, e.target.value)}
                className="w-full h-8 px-2 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium cursor-pointer"
              >
                <option value="None">None</option>
                {COMMUNICATION_STYLES.filter((st) => st !== primaryStyle).map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Response Length */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Response Length
              </label>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                How long the AI speaks in a single turn.
              </p>
            </div>
            <Badge variant="success" className="text-[9px] py-0 px-1 font-semibold">
              Voice Recommended
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "short", label: "Short (1–2 sentences)", sub: "Best for telephony" },
              { id: "balanced", label: "Balanced (2–3 sentences)", sub: "Standard queries" },
              { id: "detailed", label: "Detailed (3+ sentences)", sub: "Complex guidance" }
            ].map((len) => {
              const isSelected = (agentData.response_length || "short") === len.id;

              return (
                <div
                  key={len.id}
                  onClick={() => setAgentData({ ...agentData, response_length: len.id })}
                  className={`p-2 rounded-[var(--radius-main,0.375rem)] border text-center cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[var(--color-primary-light)]/20 border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] shadow-2xs"
                      : "bg-[var(--color-surface-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  <span className="text-xs font-bold text-[var(--color-heading)] block leading-tight">
                    {len.label.split(" ")[0]}
                  </span>
                  <span className="text-[10px] text-[var(--color-muted)] block mt-0.5">
                    {len.sub}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 3: Core Personality Sliders */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Personality Traits
            </label>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              Adjust how your agent behaves and feels during conversations.
            </p>
          </div>
        </div>

        {/* 4 Core Personality Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {[
            { key: "professionalism" as const, label: "Professionalism", desc: "Formal, respectful, and business-focused" },
            { key: "friendliness" as const, label: "Friendliness", desc: "Warm, welcoming, and approachable" },
            { key: "empathy" as const, label: "Empathy", desc: "Validates feelings and active listening" },
            { key: "confidence" as const, label: "Confidence", desc: "Authoritative and assured responses" }
          ].map((item) => (
            <div key={item.key} className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-xs font-semibold text-[var(--color-heading)]">{item.label}</span>
                  <span className="text-[10px] text-[var(--color-muted)] block">{item.desc}</span>
                </div>
                <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                  {agentData.personality?.[item.key] ?? 80}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={agentData.personality?.[item.key] ?? 80}
                onChange={(e) => updatePersonality(item.key, parseInt(e.target.value))}
                className="w-full accent-[var(--color-primary)] cursor-pointer"
              />
            </div>
          ))}
        </div>

        {/* Advanced Personality Collapsible */}
        <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] overflow-hidden shadow-2xs">
          <button
            type="button"
            onClick={() => setShowAdvancedPersonality(!showAdvancedPersonality)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--color-heading)] bg-[var(--color-surface-muted)]/50 hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Smile className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Show Advanced Personality Settings (Patience, Energy, Humor, Assertiveness, Curiosity)</span>
            </div>
            {showAdvancedPersonality ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
          </button>

          {showAdvancedPersonality && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-[var(--color-border)] animate-fade-in text-xs">
              {[
                { key: "patience" as const, label: "Patience" },
                { key: "energy" as const, label: "Energy" },
                { key: "humor" as const, label: "Humor" },
                { key: "assertiveness" as const, label: "Assertiveness" },
                { key: "curiosity" as const, label: "Curiosity" }
              ].map((item) => (
                <div key={item.key} className="p-2.5 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-[var(--color-heading)]">{item.label}</span>
                    <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                      {agentData.personality?.[item.key] ?? 50}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={agentData.personality?.[item.key] ?? 50}
                    onChange={(e) => updatePersonality(item.key, parseInt(e.target.value))}
                    className="w-full accent-[var(--color-primary)] cursor-pointer"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
