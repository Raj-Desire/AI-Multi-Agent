import React, { useState, useEffect } from "react";
import {
  History,
  RotateCcw,
  Calendar,
  User,
  FileText,
  Check,
  X,
  AlertCircle,
  Loader2,
  Clock,
  Sparkles,
  ChevronRight,
  GitCommit
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import { PromptVersionSnapshot, AgentConfig } from "../../types";
import { fetchApi } from "../../api-client";
import { toast } from "sonner";

interface PromptVersionHistoryModalProps {
  agentData: AgentConfig;
  isOpen: boolean;
  onClose: () => void;
  onRollbackComplete: (restoredConfig: AgentConfig) => void;
}

export function PromptVersionHistoryModal({
  agentData,
  isOpen,
  onClose,
  onRollbackComplete
}: PromptVersionHistoryModalProps) {
  const [versions, setVersions] = useState<PromptVersionSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersionSnapshot | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [confirmRollbackVer, setConfirmRollbackVer] = useState<PromptVersionSnapshot | null>(null);

  useEffect(() => {
    if (isOpen && agentData.agent_id) {
      loadVersionHistory();
    }
  }, [isOpen, agentData.agent_id]);

  const loadVersionHistory = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<PromptVersionSnapshot[]>(
        `/agents/${agentData.agent_id}/versions`
      );
      if (res && Array.isArray(res)) {
        setVersions(res);
        if (res.length > 0) {
          setSelectedVersion(res[0]);
        }
      }
    } catch (err: any) {
      console.warn("Could not fetch version history from server:", err);
      // Fallback local snapshot of current agent state
      const localFallback: PromptVersionSnapshot[] = [
        {
          id: `local_v${agentData.version || 1}`,
          agent_id: agentData.agent_id,
          organization_id: agentData.organization_id || "org",
          version: agentData.version || 1,
          system_prompt: agentData.system_prompt,
          greeting: agentData.greeting,
          role: agentData.role,
          objective: agentData.objective,
          summary_of_changes: "Current active version",
          created_at: agentData.updated_at || new Date().toISOString()
        }
      ];
      setVersions(localFallback);
      setSelectedVersion(localFallback[0]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteRollback = async () => {
    if (!confirmRollbackVer) return;
    try {
      setIsRollingBack(true);
      const res = await fetchApi<AgentConfig>(
        `/agents/${agentData.agent_id}/rollback/${confirmRollbackVer.version}`,
        { method: "POST" }
      );
      if (res) {
        toast.success(`Successfully rolled back to Version ${confirmRollbackVer.version}!`);
        onRollbackComplete(res);
        setConfirmRollbackVer(null);
        onClose();
      }
    } catch (err: any) {
      console.error("Rollback failed:", err);
      // Fallback rollback in local state if offline/testing
      const restoredLocal: AgentConfig = {
        ...agentData,
        system_prompt: confirmRollbackVer.system_prompt || agentData.system_prompt,
        greeting: confirmRollbackVer.greeting || agentData.greeting,
        role: confirmRollbackVer.role || agentData.role,
        objective: confirmRollbackVer.objective || agentData.objective,
        version: (agentData.version || 1) + 1
      };
      toast.success(`Applied prompt from Version ${confirmRollbackVer.version} locally!`);
      onRollbackComplete(restoredLocal);
      setConfirmRollbackVer(null);
      onClose();
    } finally {
      setIsRollingBack(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in text-left">
      <div className="w-full max-w-4xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.75rem)] shadow-modal flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface-muted)]/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--color-heading)]">
                  Prompt Version History &amp; Rollback
                </h3>
                <Badge variant="primary" size="sm">
                  Active v{agentData.version || 1}
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--color-muted)]">
                Inspect past snapshots of your AI agent instructions and restore previous revisions.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-heading)] rounded hover:bg-[var(--color-surface)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
          {/* Left: Version Timeline List (5 cols) */}
          <div className="md:col-span-5 p-3 overflow-y-auto space-y-2 bg-[var(--color-surface-muted)]/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] block px-1">
              Recorded Snapshots ({versions.length})
            </span>

            {isLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--color-muted)] text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                <span>Loading versions...</span>
              </div>
            ) : versions.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--color-muted)]">
                No past versions recorded yet. Updates will appear here automatically.
              </div>
            ) : (
              versions.map((ver) => {
                const isSelected = selectedVersion?.version === ver.version;
                const isCurrent = ver.version === agentData.version;
                const dateFormatted = new Date(ver.created_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  <div
                    key={ver.id || ver.version}
                    onClick={() => setSelectedVersion(ver)}
                    className={`p-3 rounded-[var(--radius-main,0.375rem)] border text-left cursor-pointer transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-[var(--color-surface)] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30 shadow-2xs"
                        : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <GitCommit className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span className="text-xs font-bold text-[var(--color-heading)]">
                          Version {ver.version}
                        </span>
                        {isCurrent && (
                          <Badge variant="primary" size="sm" className="text-[9px] py-0 px-1.5">
                            Active
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--color-muted)] font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {dateFormatted}
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--color-text)] line-clamp-2">
                      {ver.summary_of_changes || "Prompt configuration updated"}
                    </p>

                    <div className="text-[10px] text-[var(--color-muted)] flex items-center justify-between pt-1 border-t border-[var(--color-border)]">
                      <span>{(ver.system_prompt || "").length} characters</span>
                      <span>By: {ver.created_by ? "User" : "System"}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Selected Version Prompt Detail & Diff Preview (7 cols) */}
          <div className="md:col-span-7 p-4 overflow-y-auto space-y-3.5 flex flex-col justify-between">
            {selectedVersion ? (
              <div className="space-y-3 flex-1 flex flex-col">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                      <span>Snapshot: Version {selectedVersion.version}</span>
                      <span className="text-[11px] font-normal text-[var(--color-muted)]">
                        ({new Date(selectedVersion.created_at).toLocaleString()})
                      </span>
                    </h4>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      {selectedVersion.summary_of_changes || "Standard update"}
                    </p>
                  </div>

                  {selectedVersion.version !== agentData.version && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setConfirmRollbackVer(selectedVersion)}
                      leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      className="cursor-pointer text-xs h-7 px-3 font-semibold shrink-0"
                    >
                      Rollback to v{selectedVersion.version}
                    </Button>
                  )}
                </div>

                {/* Opening Greeting at that version */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                    Greeting at v{selectedVersion.version}
                  </span>
                  <p className="text-xs font-mono text-[var(--color-heading)] p-2.5 bg-[var(--color-surface-muted)] rounded border border-[var(--color-border)] italic">
                    "{selectedVersion.greeting || "No custom greeting"}"
                  </p>
                </div>

                {/* System Prompt View */}
                <div className="space-y-1 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                      System Prompt Instructions
                    </span>
                    <span className="text-[10px] font-mono text-[var(--color-muted)]">
                      {(selectedVersion.system_prompt || "").length} chars
                    </span>
                  </div>
                  <pre className="p-3 bg-[var(--color-surface-muted)]/70 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-xs font-mono text-[var(--color-heading)] whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto flex-1">
                    {selectedVersion.system_prompt || "(Empty prompt)"}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-[var(--color-muted)]">
                Select a version on the left to review its prompt instructions.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface-muted)]/30">
          <span className="text-[11px] text-[var(--color-muted)] flex items-center gap-1">
            <InfoTooltip
              content="Rollbacks create a new version increment while safely preserving the historical record of all prior prompts."
              position="top"
            />
            <span>Rollbacks safely increment version numbers without deleting historical logs.</span>
          </span>

          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs h-8 px-3">
            Close
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog Modal */}
      {confirmRollbackVer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 animate-fade-in">
          <div className="max-w-md w-full p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] space-y-3 shadow-modal text-left">
            <div className="flex items-center gap-2 text-amber-500 font-bold text-xs uppercase tracking-wider">
              <RotateCcw className="w-4 h-4" />
              <span>Confirm Prompt Rollback</span>
            </div>
            <p className="text-xs text-[var(--color-heading)] leading-relaxed">
              Are you sure you want to restore the system prompt and spoken instructions from{" "}
              <strong>Version {confirmRollbackVer.version}</strong>?
            </p>
            <p className="text-[11px] text-[var(--color-muted)]">
              This will update your active prompt while creating a new version revision in history so nothing is permanently lost.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmRollbackVer(null)}
                className="text-xs h-7 px-3"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isRollingBack}
                onClick={handleExecuteRollback}
                leftIcon={isRollingBack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                className="text-xs h-7 px-3 font-semibold"
              >
                {isRollingBack ? "Restoring..." : "Yes, Rollback Now"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
