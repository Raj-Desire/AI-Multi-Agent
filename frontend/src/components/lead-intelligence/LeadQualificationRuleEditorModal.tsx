import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Sliders, Plus, Trash2, CheckCircle2, ShieldAlert, Sparkles, Save, RotateCcw, Lock, Palette } from "lucide-react";
import { Button } from "../ui/Button";
import { LeadQualificationRules, SignalRule, QualificationTier } from "../../types";
import { fetchApi } from "../../api-client";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";

const AVAILABLE_COLORS = [
  { id: "emerald", label: "Emerald", border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  { id: "teal", label: "Teal", border: "border-teal-500/30", bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500" },
  { id: "blue", label: "Blue", border: "border-blue-500/30", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  { id: "indigo", label: "Indigo", border: "border-indigo-500/30", bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500" },
  { id: "purple", label: "Purple", border: "border-purple-500/30", bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
  { id: "amber", label: "Amber", border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  { id: "orange", label: "Orange", border: "border-orange-500/30", bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  { id: "rose", label: "Rose", border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  { id: "slate", label: "Slate", border: "border-slate-500/30", bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400", dot: "bg-slate-500" },
];

export function getColorConfig(colorName?: string) {
  const match = AVAILABLE_COLORS.find((c) => c.id === colorName);
  return match || AVAILABLE_COLORS[0];
}

interface LeadQualificationRuleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRulesUpdated?: () => void;
}

export function LeadQualificationRuleEditorModal({
  isOpen,
  onClose,
  onRulesUpdated,
}: LeadQualificationRuleEditorModalProps) {
  const { isAdmin } = useAuth();
  const [rules, setRules] = useState<LeadQualificationRules | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // New Signal Input States
  const [newPositivePhrase, setNewPositivePhrase] = useState("");
  const [newPositiveWeight, setNewPositiveWeight] = useState(15);
  const [newPositiveCategory, setNewPositiveCategory] = useState<SignalRule["category"]>("buying_intent");

  const [newNegativePhrase, setNewNegativePhrase] = useState("");
  const [newNegativeWeight, setNewNegativeWeight] = useState(20);
  const [newNegativeCategory, setNewNegativeCategory] = useState<SignalRule["category"]>("objection");

  useEffect(() => {
    if (isOpen) {
      loadRules();
    }
  }, [isOpen]);

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const res = await fetchApi<LeadQualificationRules>("/lead-intelligence/qualification-rules");
      // Ensure qualification_tiers exists with defaults if missing
      if (!res.qualification_tiers || res.qualification_tiers.length === 0) {
        res.qualification_tiers = [
          {
            id: "tier_hot",
            name: "Qualified (Hot)",
            min_score: res.qualification_threshold ?? 70,
            color: "emerald",
            description: "Leads scoring above this receive top priority and immediate CRM assignment.",
            is_fallback: false,
          },
          {
            id: "tier_warm",
            name: "Warm Interested",
            min_score: res.warm_threshold ?? 40,
            color: "amber",
            description: "Leads with moderate engagement queued for proactive follow-up.",
            is_fallback: false,
          },
          {
            id: "tier_cold",
            name: "Cold Lead",
            min_score: 0,
            color: "slate",
            description: "Scores below warm threshold are classified as Cold.",
            is_fallback: true,
          },
        ];
      }
      setRules(res);
    } catch (err: any) {
      toast.error("Failed to load qualification rules: " + (err.message || "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!rules) return;
    setIsSaving(true);
    try {
      const updated = await fetchApi<LeadQualificationRules>("/lead-intelligence/qualification-rules", {
        method: "PUT",
        body: JSON.stringify(rules),
      });
      setRules(updated);
      toast.success("Lead qualification rules successfully saved");
      if (onRulesUpdated) onRulesUpdated();
      onClose();
    } catch (err: any) {
      toast.error("Failed to save rules: " + (err.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPositiveSignal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPositivePhrase.trim() || !rules) return;
    const newSignal: SignalRule = {
      id: "pos_" + Date.now(),
      phrase: newPositivePhrase.trim(),
      weight: Number(newPositiveWeight) || 10,
      category: newPositiveCategory,
    };
    setRules({
      ...rules,
      positive_signals: [...rules.positive_signals, newSignal],
    });
    setNewPositivePhrase("");
  };

  const handleRemovePositiveSignal = (id: string) => {
    if (!rules) return;
    setRules({
      ...rules,
      positive_signals: rules.positive_signals.filter((s) => s.id !== id),
    });
  };

  const handleAddNegativeSignal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNegativePhrase.trim() || !rules) return;
    const newSignal: SignalRule = {
      id: "neg_" + Date.now(),
      phrase: newNegativePhrase.trim(),
      weight: Number(newNegativeWeight) || 15,
      category: newNegativeCategory,
    };
    setRules({
      ...rules,
      negative_signals: [...rules.negative_signals, newSignal],
    });
    setNewNegativePhrase("");
  };

  const handleRemoveNegativeSignal = (id: string) => {
    if (!rules) return;
    setRules({
      ...rules,
      negative_signals: rules.negative_signals.filter((s) => s.id !== id),
    });
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.75rem)] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-heading)] flex items-center gap-2">
                Custom Lead Qualification Rules
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">
                  AI Evaluator
                </span>
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Configure intent score thresholds, positive signals, and objection penalties
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-text)] p-1.5 rounded-md hover:bg-[var(--color-background)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="py-16 text-center text-xs text-[var(--color-muted)]">
              Loading qualification rules...
            </div>
          ) : rules ? (
            <>
              {/* Admin Notice or Read-Only Banner */}
              {!isAdmin && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
                  <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    <strong>View-Only Mode:</strong> Lead qualification rules are managed by organization administrators. You can review the active thresholds and scoring criteria below.
                  </span>
                </div>
              )}

              {/* Dynamic Qualification Tiers (Custom names, colors & score logic: 2 to 5 tiers) */}
              <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                      Organization Qualification Parameters ({rules.qualification_tiers?.length || 3}/5)
                    </h3>
                    <span className="text-[11px] text-[var(--color-muted)]">
                      Customize tier names, colors, and scoring rules for your organization.
                    </span>
                  </div>
                  {isAdmin && (rules.qualification_tiers?.length || 0) < 5 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const current = rules.qualification_tiers || [];
                        const nonFallback = current.filter((t) => !t.is_fallback);
                        const lastScore = nonFallback.length > 0 ? nonFallback[nonFallback.length - 1].min_score : 50;
                        const newScore = Math.max(10, lastScore - 15);
                        const newTier: QualificationTier = {
                          id: "tier_" + Date.now(),
                          name: `Tier ${current.length + 1}`,
                          min_score: newScore,
                          color: AVAILABLE_COLORS[(current.length) % AVAILABLE_COLORS.length].id,
                          description: "Custom lead qualification tier",
                          is_fallback: false,
                        };
                        // Insert right before fallback tier
                        const fallbackIdx = current.findIndex((t) => t.is_fallback);
                        const nextTiers = fallbackIdx >= 0
                          ? [...current.slice(0, fallbackIdx), newTier, ...current.slice(fallbackIdx)]
                          : [...current, newTier];
                        setRules({ ...rules, qualification_tiers: nextTiers });
                      }}
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Add Parameter
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(rules.qualification_tiers || []).map((tier, idx) => {
                    const colorCfg = getColorConfig(tier.color);
                    const isFallback = Boolean(tier.is_fallback);

                    // Find previous tier threshold to show < X boundary on fallback
                    const prevTier = idx > 0 ? (rules.qualification_tiers || [])[idx - 1] : null;

                    return (
                      <div
                        key={tier.id || idx}
                        className={`p-3.5 rounded-lg bg-[var(--color-surface)] border ${colorCfg.border} shadow-2xs space-y-3 flex flex-col justify-between`}
                      >
                        <div className="space-y-2.5">
                          {/* Header: Name input & Score badge */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${colorCfg.dot} shrink-0`} />
                              <input
                                type="text"
                                disabled={!isAdmin}
                                value={tier.name}
                                onChange={(e) => {
                                  const next = [...(rules.qualification_tiers || [])];
                                  next[idx] = { ...tier, name: e.target.value };
                                  setRules({ ...rules, qualification_tiers: next });
                                }}
                                placeholder="Tier name"
                                className={`text-xs font-bold ${colorCfg.text} bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none w-full truncate`}
                              />
                            </div>

                            <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${colorCfg.bg} ${colorCfg.text} shrink-0`}>
                              {isFallback ? (prevTier ? `< ${prevTier.min_score}` : "< 40") : `≥ ${tier.min_score}`}
                            </span>

                            {isAdmin && !isFallback && (rules.qualification_tiers || []).length > 2 && (
                              <button
                                type="button"
                                title="Remove parameter"
                                onClick={() => {
                                  const next = (rules.qualification_tiers || []).filter((_, i) => i !== idx);
                                  setRules({ ...rules, qualification_tiers: next });
                                }}
                                className="text-[var(--color-muted)] hover:text-rose-500 p-0.5 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Color picker selector */}
                          <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[var(--color-border)]/50">
                            <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)] font-medium">
                              <span className="flex items-center gap-1">
                                <Palette className="w-3 h-3" />
                                Color Theme:
                              </span>
                              <span className="capitalize font-semibold text-[var(--color-heading)]">{colorCfg.label}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                              {AVAILABLE_COLORS.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  disabled={!isAdmin}
                                  title={c.label}
                                  onClick={() => {
                                    const next = [...(rules.qualification_tiers || [])];
                                    next[idx] = { ...tier, color: c.id };
                                    setRules({ ...rules, qualification_tiers: next });
                                  }}
                                  className={`w-4 h-4 rounded-full ${c.dot} transition-transform cursor-pointer ${
                                    tier.color === c.id ? "ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-125" : "opacity-60 hover:opacity-100 hover:scale-110"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Slider / Range (if not fallback) */}
                          {!isFallback ? (
                            <div className="space-y-1 pt-1">
                              <div className="flex justify-between items-center text-[10px] text-[var(--color-muted)]">
                                <span>Minimum Score</span>
                                <span className="font-mono font-semibold">{tier.min_score}</span>
                              </div>
                              <input
                                type="range"
                                min="10"
                                max="95"
                                disabled={!isAdmin}
                                value={tier.min_score}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const next = [...(rules.qualification_tiers || [])];
                                  next[idx] = { ...tier, min_score: val };
                                  setRules({ ...rules, qualification_tiers: next });
                                }}
                                className={`w-full accent-[var(--color-primary)] ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                              />
                            </div>
                          ) : (
                            <div className="text-[11px] text-[var(--color-muted)] pt-1 italic">
                              Fallback tier for any caller score below the thresholds above.
                            </div>
                          )}
                        </div>

                        {/* Description field */}
                        <input
                          type="text"
                          disabled={!isAdmin}
                          value={tier.description || ""}
                          placeholder="Short description (optional)..."
                          onChange={(e) => {
                            const next = [...(rules.qualification_tiers || [])];
                            next[idx] = { ...tier, description: e.target.value };
                            setRules({ ...rules, qualification_tiers: next });
                          }}
                          className="text-[10px] text-[var(--color-muted)] bg-transparent border-t border-[var(--color-border)]/40 pt-1.5 focus:outline-none focus:text-[var(--color-text)]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Score words: the organisation's own labels for score ranges */}
              <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)]">Your words for scores</h3>
                  <span className="text-[11px] text-[var(--color-muted)]">Shown next to the score in the lead list. Leave empty to use the standard words.</span>
                </div>
                {(rules.score_tiers || []).map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="text-[var(--color-muted)]">From score</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={!isAdmin}
                      value={tier.min_score}
                      onChange={(e) => {
                        const next = [...(rules.score_tiers || [])];
                        next[idx] = { ...tier, min_score: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) };
                        setRules({ ...rules, score_tiers: next });
                      }}
                      className="w-20 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)]"
                    />
                    <span className="text-[var(--color-muted)]">show</span>
                    <input
                      type="text"
                      maxLength={40}
                      disabled={!isAdmin}
                      value={tier.label}
                      placeholder="e.g. Booked, Hot lead, Needs follow-up"
                      onChange={(e) => {
                        const next = [...(rules.score_tiers || [])];
                        next[idx] = { ...tier, label: e.target.value };
                        setRules({ ...rules, score_tiers: next });
                      }}
                      className="flex-1 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)]"
                    />
                    {isAdmin && (
                      <button
                        type="button"
                        aria-label="Remove this word"
                        onClick={() => setRules({ ...rules, score_tiers: (rules.score_tiers || []).filter((_, i) => i !== idx) })}
                        className="p-1 text-[var(--color-muted)] hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRules({ ...rules, score_tiers: [...(rules.score_tiers || []), { min_score: 80, label: "" }] })}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add a word
                  </Button>
                )}
              </div>

              {/* Scoring instructions given to the model together with each agent's own instructions */}
              <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-5 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)]">How to judge a good call</h3>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Every call is already judged against the goal in its own agent's instructions. Add anything specific to your business here, for example
                  "a caller who only asks our opening hours and gets them counts as a success", or "a booking only counts when an address was given".
                </p>
                <textarea
                  rows={4}
                  maxLength={1500}
                  disabled={!isAdmin}
                  value={rules.scoring_guidance || ""}
                  onChange={(e) => setRules({ ...rules, scoring_guidance: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] resize-y"
                  placeholder="Optional. Applies to calls analysed after you save."
                />
              </div>

              {/* Positive Signals Configuration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Positive Buying Signals (+ Score)
                  </h3>
                  <span className="text-xs text-[var(--color-muted)]">
                    {rules.positive_signals.length} rules active
                  </span>
                </div>

                {/* Add Positive Signal Form - Admin Only */}
                {isAdmin && (
                  <form onSubmit={handleAddPositiveSignal} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Enter phrase, e.g., 'send proposal' or 'budget approved'"
                      value={newPositivePhrase}
                      onChange={(e) => setNewPositivePhrase(e.target.value)}
                      className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <select
                      value={newPositiveCategory}
                      onChange={(e) => setNewPositiveCategory(e.target.value as any)}
                      className="px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-[var(--color-text)]"
                    >
                      <option value="buying_intent">Buying Intent</option>
                      <option value="decision_maker">Decision Maker</option>
                      <option value="budget_approved">Budget Approved</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-emerald-600 font-semibold">+</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={newPositiveWeight}
                        onChange={(e) => setNewPositiveWeight(parseInt(e.target.value))}
                        className="w-16 px-2 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-[var(--color-text)]"
                      />
                      <span className="text-[10px] text-[var(--color-muted)]">pts</span>
                    </div>
                    <Button type="submit" size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />}>
                      Add Signal
                    </Button>
                  </form>
                )}

                {/* Positive Signals List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {rules.positive_signals.map((sig) => (
                    <div
                      key={sig.id}
                      className="flex items-center justify-between p-2.5 rounded-md bg-[var(--color-background)] border border-emerald-500/20 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold text-[10px]">
                          +{sig.weight}
                        </span>
                        <span className="font-medium text-[var(--color-text)]">"{sig.phrase}"</span>
                        <span className="text-[10px] text-[var(--color-muted)] capitalize">({sig.category.replace("_", " ")})</span>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleRemovePositiveSignal(sig.id)}
                          className="text-[var(--color-muted)] hover:text-rose-500 p-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Negative Signals & Objection Penalties */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)] flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                    Negative Signals &amp; Objection Penalties (- Score)
                  </h3>
                  <span className="text-xs text-[var(--color-muted)]">
                    {rules.negative_signals.length} rules active
                  </span>
                </div>

                {/* Add Negative Signal Form - Admin Only */}
                {isAdmin && (
                  <form onSubmit={handleAddNegativeSignal} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Enter phrase, e.g., 'not interested' or 'too expensive'"
                      value={newNegativePhrase}
                      onChange={(e) => setNewNegativePhrase(e.target.value)}
                      className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                    <select
                      value={newNegativeCategory}
                      onChange={(e) => setNewNegativeCategory(e.target.value as any)}
                      className="px-2.5 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-[var(--color-text)]"
                    >
                      <option value="negative">Explicit Negative</option>
                      <option value="objection">Pricing/Competitor Objection</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-rose-600 font-semibold">-</span>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={newNegativeWeight}
                        onChange={(e) => setNewNegativeWeight(parseInt(e.target.value))}
                        className="w-16 px-2 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-[var(--color-text)]"
                      />
                      <span className="text-[10px] text-[var(--color-muted)]">pts</span>
                    </div>
                    <Button type="submit" size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />}>
                      Add Penalty
                    </Button>
                  </form>
                )}

                {/* Negative Signals List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {rules.negative_signals.map((sig) => (
                    <div
                      key={sig.id}
                      className="flex items-center justify-between p-2.5 rounded-md bg-[var(--color-background)] border border-rose-500/20 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-bold text-[10px]">
                          -{sig.weight}
                        </span>
                        <span className="font-medium text-[var(--color-text)]">"{sig.phrase}"</span>
                        <span className="text-[10px] text-[var(--color-muted)] capitalize">({sig.category.replace("_", " ")})</span>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleRemoveNegativeSignal(sig.id)}
                          className="text-[var(--color-muted)] hover:text-rose-500 p-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Automation Toggles */}
              <div className="p-4 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)]">
                  Automatic Actions
                </h4>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-[var(--color-text)]">
                      Auto-qualify when budget is confirmed
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      Automatically boosts score to threshold if caller confirms approved budget
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={rules.auto_qualify_on_budget_approval}
                    onChange={(e) =>
                      setRules({ ...rules, auto_qualify_on_budget_approval: e.target.checked })
                    }
                    className={`w-4 h-4 rounded text-[var(--color-primary)] ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-[var(--color-text)]">
                      Auto-tag Qualified Leads in CRM
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      Applies custom tag label when lead crosses the qualification score threshold
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={rules.qualification_tag}
                      onChange={(e) => setRules({ ...rules, qualification_tag: e.target.value })}
                      className={`px-2.5 py-1 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text)] w-28 ${
                        !isAdmin ? "cursor-not-allowed opacity-60" : ""
                      }`}
                    />
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={rules.auto_tag_qualified_leads}
                      onChange={(e) =>
                        setRules({ ...rules, auto_tag_qualified_leads: e.target.checked })
                      }
                      className={`w-4 h-4 rounded text-[var(--color-primary)] ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
            {isAdmin ? "Cancel" : "Close"}
          </Button>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadRules}
                disabled={isSaving}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Reset
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !rules}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                {isSaving ? "Saving..." : "Save Qualification Rules"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <Lock className="w-3.5 h-3.5" />
              <span>Admin permission required to modify rules</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
