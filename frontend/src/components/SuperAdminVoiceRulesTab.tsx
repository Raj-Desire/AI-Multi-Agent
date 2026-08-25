import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  CalendarX,
  CalendarSearch,
  Clock,
  Compass,
  Volume2,
  Hash,
  Mail,
  DollarSign,
  FileCode,
  Brain,
  UserCheck,
  CheckCheck,
  RotateCcw,
  ShieldAlert,
  PauseCircle,
  MicOff,
  AlertTriangle,
  Lock,
  ShieldCheck,
  HeartHandshake,
  ShieldBan,
  CheckCircle2,
  ListChecks,
  HelpCircle,
  Sparkles,
  Search,
  Filter,
  Check,
  RefreshCw,
  Save,
  Info,
  SlidersHorizontal,
  Layers,
  Zap,
  CheckCircle,
  PhoneOff,
  Binary,
  Voicemail,
  PhoneForwarded,
  PhoneMissed,
  Bot
} from "lucide-react";
import { VoiceRulesResponse, VoiceRuleCategory, VoiceRuleItem } from "../types";
import { fetchApi } from "../api-client";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { InfoTooltip } from "./ui/Tooltip";
import { toast } from "sonner";

// Icon mapping for dynamic icons
const RULE_ICONS: Record<string, React.ElementType> = {
  Calendar,
  CalendarX,
  CalendarSearch,
  Clock,
  Compass,
  Volume2,
  Hash,
  Mail,
  DollarSign,
  FileCode,
  Brain,
  UserCheck,
  CheckCheck,
  RotateCcw,
  ShieldAlert,
  PauseCircle,
  MicOff,
  AlertTriangle,
  Lock,
  ShieldCheck,
  HeartHandshake,
  ShieldBan,
  CheckCircle2,
  ListChecks,
  HelpCircle,
  Sparkles,
  Zap,
  PhoneOff,
  Binary,
  Voicemail,
  PhoneForwarded,
  PhoneMissed,
  Bot
};

export const SuperAdminVoiceRulesTab: React.FC = () => {
  const [data, setData] = useState<VoiceRulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");

  // Local state map of ruleId -> boolean to allow immediate interactive toggles
  const [ruleStates, setRuleStates] = useState<Record<string, boolean>>({});
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const loadRules = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchApi<VoiceRulesResponse>("/superadmin/voice-rules");
      setData(res);

      const initialMap: Record<string, boolean> = {};
      res.categories.forEach((cat) => {
        cat.rules.forEach((r) => {
          initialMap[r.id] = r.enabled;
        });
      });
      setRuleStates(initialMap);
      setHasPendingChanges(false);
    } catch (err: any) {
      setError(err.message || "Failed to load platform voice agent rules.");
      toast.error("Failed to load platform voice agent rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleToggleRule = (ruleId: string) => {
    setRuleStates((prev) => {
      const next = { ...prev, [ruleId]: !prev[ruleId] };
      setHasPendingChanges(true);
      return next;
    });
  };

  const handleToggleCategory = (cat: VoiceRuleCategory, targetState: boolean) => {
    setRuleStates((prev) => {
      const next = { ...prev };
      cat.rules.forEach((r) => {
        next[r.id] = targetState;
      });
      setHasPendingChanges(true);
      return next;
    });
  };

  const handleEnableAll = () => {
    if (!data) return;
    setRuleStates((prev) => {
      const next = { ...prev };
      data.categories.forEach((cat) => {
        cat.rules.forEach((r) => {
          next[r.id] = true;
        });
      });
      setHasPendingChanges(true);
      return next;
    });
    toast.info("All platform voice rules set to Enabled.");
  };

  const handleDisableAll = () => {
    if (!data) return;
    setRuleStates((prev) => {
      const next = { ...prev };
      data.categories.forEach((cat) => {
        cat.rules.forEach((r) => {
          next[r.id] = false;
        });
      });
      setHasPendingChanges(true);
      return next;
    });
    toast.info("All platform voice rules set to Disabled.");
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetchApi<VoiceRulesResponse>("/superadmin/voice-rules", {
        method: "PUT",
        body: JSON.stringify({ rules: ruleStates })
      });
      setData(res);
      const updatedMap: Record<string, boolean> = {};
      res.categories.forEach((cat) => {
        cat.rules.forEach((r) => {
          updatedMap[r.id] = r.enabled;
        });
      });
      setRuleStates(updatedMap);
      setHasPendingChanges(false);
      toast.success("Platform AI voice rules successfully saved and applied globally.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save voice rules.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    try {
      setSaving(true);
      const res = await fetchApi<VoiceRulesResponse>("/superadmin/voice-rules/reset", {
        method: "POST"
      });
      setData(res);
      const updatedMap: Record<string, boolean> = {};
      res.categories.forEach((cat) => {
        cat.rules.forEach((r) => {
          updatedMap[r.id] = r.enabled;
        });
      });
      setRuleStates(updatedMap);
      setHasPendingChanges(false);
      toast.success("All platform voice rules reset to recommended defaults.");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset voice rules.");
    } finally {
      setSaving(false);
    }
  };

  // Compute active counts
  const totalRulesCount = useMemo(() => {
    return Object.keys(ruleStates).length;
  }, [ruleStates]);

  const activeRulesCount = useMemo(() => {
    return Object.values(ruleStates).filter(Boolean).length;
  }, [ruleStates]);

  // Filtered categories and rules
  const filteredCategories = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.toLowerCase().trim();

    return data.categories
      .filter((cat) => {
        if (selectedCategoryFilter !== "all" && cat.id !== selectedCategoryFilter) {
          return false;
        }
        return true;
      })
      .map((cat) => {
        const matchingRules = cat.rules.filter((r) => {
          if (!q) return true;
          return (
            r.title.toLowerCase().includes(q) ||
            r.summary.toLowerCase().includes(q) ||
            r.rule_directive.toLowerCase().includes(q) ||
            r.example.toLowerCase().includes(q)
          );
        });

        return {
          ...cat,
          rules: matchingRules
        };
      })
      .filter((cat) => cat.rules.length > 0);
  }, [data, searchQuery, selectedCategoryFilter]);

  if (loading && !data) {
    return (
      <div className="p-12 text-center text-xs text-[var(--color-muted)] flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
        <span>Loading SuperAdmin Platform Voice Rules...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner / Stat Header */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
                  <span>AI Voice Agent Platform Intelligence Rules</span>
                  <Badge variant="primary" size="sm" className="text-[10px] font-mono">
                    SuperAdmin Master
                  </Badge>
                </h3>
                <p className="text-xs text-[var(--color-muted)]">
                  Global reasoning rules, calendar sanity checks, speech pacing, resilience guardrails, and conversation continuity injected across all AI voice agents.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2.5 self-start md:self-center shrink-0">
            <div className="px-3 py-1.5 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] text-center">
              <span className="text-[10px] text-[var(--color-muted)] block font-medium uppercase">Active Rules</span>
              <span className="text-sm font-bold font-mono text-[var(--color-primary)]">
                {activeRulesCount} / {totalRulesCount}
              </span>
            </div>
            <div className="px-3 py-1.5 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] text-center">
              <span className="text-[10px] text-[var(--color-muted)] block font-medium uppercase">Categories</span>
              <span className="text-sm font-bold font-mono text-[var(--color-heading)]">
                {data?.categories.length || 6}
              </span>
            </div>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="pt-3 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEnableAll}
              className="text-xs h-8 px-2.5"
            >
              Enable All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisableAll}
              className="text-xs h-8 px-2.5"
            >
              Disable All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              disabled={saving}
              leftIcon={<RotateCcw className="w-3 h-3" />}
              className="text-xs h-8 px-2.5"
            >
              Reset Recommended
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {hasPendingChanges && (
              <span className="text-xs font-semibold text-amber-500 flex items-center gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Unsaved rule updates
              </span>
            )}
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={saving}
              disabled={!hasPendingChanges}
              leftIcon={<Save className="w-3.5 h-3.5" />}
              className="text-xs h-8 px-4 font-semibold shadow-2xs"
            >
              Save &amp; Apply Rules
            </Button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search voice rules by title, keyword, or example..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter("all")}
            className={`px-2.5 py-1 rounded-[var(--radius-main,0.25rem)] text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              selectedCategoryFilter === "all"
                ? "bg-[var(--color-primary)] text-white shadow-2xs"
                : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)] border border-[var(--color-border)]"
            }`}
          >
            All Categories ({totalRulesCount})
          </button>
          {data?.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryFilter(cat.id)}
              className={`px-2.5 py-1 rounded-[var(--radius-main,0.25rem)] text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                selectedCategoryFilter === cat.id
                  ? "bg-[var(--color-primary)] text-white shadow-2xs"
                  : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)] border border-[var(--color-border)]"
              }`}
            >
              {cat.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Categories & Rules Grid */}
      <div className="space-y-6">
        {filteredCategories.map((cat, idx) => {
          const CategoryIcon = RULE_ICONS[cat.icon] || Layers;
          const catActiveCount = cat.rules.filter((r) => ruleStates[r.id]).length;
          const isAllCatActive = catActiveCount === cat.rules.length;

          return (
            <div
              key={cat.id}
              className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-4"
            >
              {/* Category Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[var(--color-border)]">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5">
                    <CategoryIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-[var(--color-heading)]">
                        {idx + 1}. {cat.name}
                      </h4>
                      <Badge
                        variant={catActiveCount > 0 ? "primary" : "neutral"}
                        size="sm"
                        className="text-[10px] font-mono"
                      >
                        {catActiveCount} / {cat.rules.length} Active
                      </Badge>
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                      {cat.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleCategory(cat, !isAllCatActive)}
                    className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline cursor-pointer px-2 py-0.5"
                  >
                    {isAllCatActive ? "Disable Group" : "Enable Group"}
                  </button>
                </div>
              </div>

              {/* Rules Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {cat.rules.map((rule) => {
                  const RuleIcon = RULE_ICONS[rule.icon || ""] || Sparkles;
                  const isEnabled = ruleStates[rule.id] ?? rule.enabled;

                  const tooltipContent = (
                    <div className="space-y-2 max-w-xs text-left p-0.5">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)] block">
                          Rule Behavioral Purpose
                        </span>
                        <p className="text-xs text-[var(--color-heading)] mt-0.5">
                          {rule.summary}
                        </p>
                      </div>

                      <div className="pt-1.5 border-t border-[var(--color-border)]/60">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">
                          AI Prompt Directive
                        </span>
                        <p className="text-[11px] font-mono text-[var(--color-heading)] mt-0.5 leading-relaxed bg-[var(--color-surface-muted)] p-1.5 rounded">
                          {rule.rule_directive}
                        </p>
                      </div>

                      <div className="pt-1.5 border-t border-[var(--color-border)]/60">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 block">
                          Live Dialogue Example
                        </span>
                        <p className="text-[11px] italic text-[var(--color-heading)] mt-0.5 leading-relaxed">
                          {rule.example}
                        </p>
                      </div>
                    </div>
                  );

                  return (
                    <div
                      key={rule.id}
                      className={`p-3.5 rounded-[var(--radius-main,0.375rem)] border flex flex-col justify-between gap-3 transition-all ${
                        isEnabled
                          ? "bg-[var(--color-surface-muted)]/60 border-[var(--color-border)] hover:border-[var(--color-primary)]/40 shadow-2xs"
                          : "bg-[var(--color-surface-muted)]/20 border-[var(--color-border)]/60 opacity-60"
                      }`}
                    >
                      {/* Card Header & Toggle */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-[var(--radius-main,0.25rem)] flex items-center justify-center shrink-0 mt-0.5 ${
                              isEnabled
                                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                                : "bg-[var(--color-border)]/50 text-[var(--color-muted)]"
                            }`}
                          >
                            <RuleIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h5 className="text-xs font-bold text-[var(--color-heading)] truncate">
                                {rule.title}
                              </h5>
                              <InfoTooltip
                                content={tooltipContent}
                                position="top"
                              />
                            </div>
                            <p className="text-[11px] text-[var(--color-muted)] mt-0.5 line-clamp-2 leading-relaxed">
                              {rule.summary}
                            </p>
                          </div>
                        </div>

                        {/* Switch */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isEnabled}
                            onClick={() => handleToggleRule(rule.id)}
                            className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                              isEnabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform ${
                                isEnabled ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Rule Spoken Example Box */}
                      <div className="p-2 bg-[var(--color-surface)] rounded-[var(--radius-main,0.25rem)] border border-[var(--color-border)] text-[11px] text-[var(--color-heading)] flex items-start gap-1.5">
                        <span className="text-[9px] font-bold font-mono text-[var(--color-primary)] uppercase shrink-0 mt-0.5">
                          Ex:
                        </span>
                        <p className="italic font-medium leading-relaxed line-clamp-2">
                          {rule.example}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filteredCategories.length === 0 && (
          <div className="p-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] text-center text-xs text-[var(--color-muted)]">
            No voice agent rules match your search query "{searchQuery}".
          </div>
        )}
      </div>
    </div>
  );
};
