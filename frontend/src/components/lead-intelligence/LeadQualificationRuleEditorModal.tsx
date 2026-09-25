import React, { useState, useEffect } from "react";
import { X, Sliders, Plus, Trash2, CheckCircle2, ShieldAlert, Sparkles, Save, RotateCcw, Lock } from "lucide-react";
import { Button } from "../ui/Button";
import { LeadQualificationRules, SignalRule } from "../../types";
import { fetchApi } from "../../api-client";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.75rem)] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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

              {/* Threshold Sliders */}
              <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-heading)] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                    Classification Thresholds (0 - 100)
                  </h3>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    Defines Hot, Warm, and Cold categorization
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Qualified / Hot */}
                  <div className="p-3 rounded-md bg-[var(--color-surface)] border border-emerald-500/20 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Qualified (Hot)
                      </span>
                      <span className="text-xs font-bold text-emerald-600">≥ {rules.qualification_threshold}</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      disabled={!isAdmin}
                      value={rules.qualification_threshold}
                      onChange={(e) =>
                        setRules({ ...rules, qualification_threshold: parseInt(e.target.value) })
                      }
                      className={`w-full accent-emerald-600 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                    />
                    <p className="text-[10px] text-[var(--color-muted)]">
                      Leads scoring above this receive top priority and immediate CRM assignment.
                    </p>
                  </div>

                  {/* Warm */}
                  <div className="p-3 rounded-md bg-[var(--color-surface)] border border-amber-500/20 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-600">Warm Interested</span>
                      <span className="text-xs font-bold text-amber-600">≥ {rules.warm_threshold}</span>
                    </div>
                    <input
                      type="range"
                      min="25"
                      max="65"
                      disabled={!isAdmin}
                      value={rules.warm_threshold}
                      onChange={(e) =>
                        setRules({ ...rules, warm_threshold: parseInt(e.target.value) })
                      }
                      className={`w-full accent-amber-600 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                    />
                    <p className="text-[10px] text-[var(--color-muted)]">
                      Leads with moderate engagement queued for proactive follow-up.
                    </p>
                  </div>

                  {/* Cold */}
                  <div className="p-3 rounded-md bg-[var(--color-surface)] border border-slate-500/20 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Cold Lead</span>
                      <span className="text-xs font-bold text-slate-500">&lt; {rules.warm_threshold}</span>
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)] pt-1">
                      Scores below warm threshold are classified as Cold.
                    </div>
                  </div>
                </div>
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
}
