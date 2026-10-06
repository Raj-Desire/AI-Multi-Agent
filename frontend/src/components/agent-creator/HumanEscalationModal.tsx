import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  PhoneForwarded,
  X,
  Shield,
  Zap,
  PhoneCall,
  Clock,
  Voicemail,
  PhoneOff,
  Radio,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Phone
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import { AgentConfig } from "../../types";

interface HumanEscalationModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export function HumanEscalationModal({
  isOpen,
  onClose,
  agentData,
  setAgentData
}: HumanEscalationModalProps) {
  const [newTrigger, setNewTrigger] = useState("");
  const [activeTab, setActiveTab] = useState<"routing" | "fallback" | "triggers">("routing");

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const guardrails = agentData.guardrails || {
    allowed_actions: [],
    restricted_actions: [],
    escalation_rules: [],
    human_transfer_enabled: true,
  };

  const isTransferEnabled = guardrails.human_transfer_enabled ?? true;
  const phoneNumber = guardrails.human_transfer_phone_number || "";
  const whisperMessage = guardrails.human_transfer_whisper_message || "Please hold while we transfer you to a human specialist.";
  const timeoutSeconds = guardrails.human_transfer_timeout_seconds ?? 25;
  const fallbackAction = guardrails.human_transfer_fallback_action || "hangup";
  const fallbackMessage = guardrails.human_transfer_fallback_message || "Our representatives are currently busy. We have logged your request and will follow up shortly.";
  const escalationRules = guardrails.escalation_rules || [];

  const updateGuardrails = (patch: Partial<typeof guardrails>) => {
    setAgentData({
      ...agentData,
      guardrails: {
        ...guardrails,
        ...patch
      }
    });
  };

  const handleAddTrigger = () => {
    if (!newTrigger.trim()) return;
    updateGuardrails({
      escalation_rules: [...escalationRules, newTrigger.trim()]
    });
    setNewTrigger("");
  };

  const handleRemoveTrigger = (idx: number) => {
    updateGuardrails({
      escalation_rules: escalationRules.filter((_, i) => i !== idx)
    });
  };

  const modalNode = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-xs">
              <PhoneForwarded className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-[var(--color-heading)] truncate">
                  Live Human Escalation & Call Routing
                </h3>
                <Badge variant={isTransferEnabled ? "success" : "neutral"} size="sm">
                  {isTransferEnabled ? "Transfer Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-muted)] truncate mt-0.5">
                Mid-call transfer settings, fallback behaviors, and AI handoff triggers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 pt-2 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 text-xs shrink-0 overflow-x-auto scrollbar-none">
          {[
            { id: "routing", label: "Phone & Whisper", icon: PhoneCall },
            { id: "fallback", label: "Timeout & Fallback", icon: Clock },
            { id: "triggers", label: `Escalation Triggers (${escalationRules.length})`, icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 py-2 px-3.5 border-b-2 font-medium text-xs whitespace-nowrap transition-all cursor-pointer rounded-t-md ${isActive
                    ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-surface)] font-semibold shadow-xs"
                    : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface)]/60"
                  }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 overscroll-contain">
          {/* Master Enable Banner */}
          <div className="p-3.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-[var(--color-heading)] block text-xs">
                  Enable Mid-Call Human Transfer
                </span>
                {/* <span className="text-[11px] text-[var(--color-muted)] leading-tight block mt-0.5">
                  Allows the voice agent to transfer the caller seamlessly via live phone routing.
                </span> */}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isTransferEnabled}
              onClick={() => updateGuardrails({ human_transfer_enabled: !isTransferEnabled })}
              className={`w-10 h-5.5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${isTransferEnabled ? "bg-emerald-500" : "bg-[var(--color-border-strong,var(--color-border))]"
                }`}
            >
              <div
                className={`bg-white w-4.5 h-4.5 rounded-full shadow-xs transform transition-transform ${isTransferEnabled ? "translate-x-4.5" : "translate-x-0"
                  }`}
              />
            </button>
          </div>

          {/* TAB 1: Phone Routing & Whisper */}
          {activeTab === "routing" && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="font-bold text-[var(--color-heading)] flex items-center gap-1.5 text-xs">
                  <span>Destination Phone Number</span>
                  <InfoTooltip
                    content="The target mobile or landline number where the caller will be transferred. Must include country code, e.g. +14155552671."
                    position="top"
                  />
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--color-muted)]">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => updateGuardrails({ human_transfer_phone_number: e.target.value })}
                    placeholder="+1 (555) 234-5678 (Leave empty for organization default)"
                    className="w-full h-9 pl-9 pr-3 text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)] shadow-2xs"
                  />
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">
                  If left blank, transfers will route to the primary number configured in Organization Settings.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-[var(--color-heading)] flex items-center gap-1.5 text-xs">
                  <span>Spoken Transition Announcement (Whisper Message)</span>
                  <InfoTooltip
                    content="The voice message spoken by the AI immediately before initiating the PSTN dial transfer to prepare the caller."
                    position="top"
                  />
                </label>
                <textarea
                  rows={2}
                  value={whisperMessage}
                  onChange={(e) => updateGuardrails({ human_transfer_whisper_message: e.target.value })}
                  placeholder="Please hold while we transfer you to a human specialist."
                  className="w-full p-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)] resize-none shadow-2xs leading-relaxed"
                />
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Spoken by the selected AI voice model right before dialing the representative.</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Timeout & Fallback Rules */}
          {activeTab === "fallback" && (
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[var(--color-heading)] flex items-center gap-1.5 text-xs">
                    <span>Dial Ringing Timeout</span>
                    <InfoTooltip
                      content="How many seconds the system rings the human representative before triggering the fallback action."
                      position="top"
                    />
                  </label>
                  <span className="font-mono text-xs font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-md">
                    {timeoutSeconds}s ring limit
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-0.5">
                  {[15, 20, 25, 30, 45].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => updateGuardrails({ human_transfer_timeout_seconds: sec })}
                      className={`flex-1 py-1.5 rounded-lg font-mono text-xs border transition-all cursor-pointer text-center ${timeoutSeconds === sec
                          ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] font-bold shadow-xs"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-heading)] hover:border-[var(--color-border-strong,var(--color-border))] hover:bg-[var(--color-surface-muted)]"
                        }`}
                    >
                      {sec}s
                    </button>
                  ))}
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={timeoutSeconds}
                      onChange={(e) =>
                        updateGuardrails({
                          human_transfer_timeout_seconds: parseInt(e.target.value) || 25
                        })
                      }
                      className="w-14 h-8 text-center font-mono font-bold text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] focus:border-[var(--color-primary)]"
                    />
                    <span className="text-[11px] text-[var(--color-muted)]">sec</span>
                  </div>
                </div>
              </div>

              {/* Fallback Action Choice */}
              <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                <label className="font-bold text-[var(--color-heading)] block text-xs">
                  Action If Human Does Not Answer (Unanswered, Busy, or Timeout)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      id: "hangup",
                      label: "Graceful Hangup",
                      icon: PhoneOff,
                      desc: "Play fallback message and end call politely."
                    },
                    {
                      id: "voicemail",
                      label: "Record Voicemail",
                      icon: Voicemail,
                      desc: "Record caller message for the team inbox."
                    },
                    {
                      id: "re_engage",
                      label: "Log Priority Callback",
                      icon: Radio,
                      desc: "Log priority CRM task and acknowledge caller."
                    }
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = fallbackAction === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateGuardrails({ human_transfer_fallback_action: item.id as any })}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${isSelected
                            ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)] text-[var(--color-heading)] ring-1 ring-[var(--color-primary)]/40 shadow-xs"
                            : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong,var(--color-border))] hover:bg-[var(--color-surface-muted)]"
                          }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-4 h-4 ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
                          {isSelected && <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />}
                        </div>
                        <span className="font-bold text-xs text-[var(--color-heading)] block">{item.label}</span>
                        <span className="text-[10px] text-[var(--color-muted)] mt-1 block leading-tight">{item.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fallback Spoken Message */}
              <div className="space-y-1.5 pt-2">
                <label className="font-bold text-[var(--color-heading)] block text-xs">
                  Fallback Spoken Message (Played upon timeout or busy signal)
                </label>
                <textarea
                  rows={2}
                  value={fallbackMessage}
                  onChange={(e) => updateGuardrails({ human_transfer_fallback_message: e.target.value })}
                  placeholder="Our representatives are currently busy. We have logged your request and will follow up shortly."
                  className="w-full p-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)] resize-none shadow-2xs leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Escalation Triggers */}
          {activeTab === "triggers" && (
            <div className="space-y-3 pt-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTrigger();
                  }}
                  placeholder="e.g. Caller asks to speak with an account manager..."
                  className="flex-1 h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)] shadow-2xs"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleAddTrigger}
                  disabled={!newTrigger.trim()}
                  className="px-3.5 h-9"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                {escalationRules.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-surface-muted)]/30">
                    <Shield className="w-6 h-6 text-[var(--color-muted)] mx-auto mb-1.5 opacity-60" />
                    <p className="text-xs text-[var(--color-muted)] font-medium">No custom triggers configured yet.</p>
                    <p className="text-[11px] text-[var(--color-muted)]/80 mt-0.5">Add phrases or conditions that trigger automatic handoff.</p>
                  </div>
                ) : (
                  escalationRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg flex items-center justify-between text-xs hover:border-[var(--color-border-strong,var(--color-border))] transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span className="text-[var(--color-heading)] font-medium truncate">{rule}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTrigger(idx)}
                        className="text-[var(--color-muted)] hover:text-red-500 transition-colors p-1 rounded-md hover:bg-[var(--color-surface)] cursor-pointer shrink-0"
                        title="Remove trigger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)] shrink-0">
          {/* <div className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5 truncate pr-2">
            <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">Saved directly into active agent configuration draft.</span>
          </div> */}
          <Button type="button" variant="primary" size="sm" onClick={onClose} className="px-4.5 font-semibold shrink-0">
            Done & Save
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalNode, document.body) : modalNode;
}


