import React, { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../../api-client";
import {
  Campaign,
  CampaignStatus,
  CampaignPaginationResponse,
} from "../../types";
import { Button } from "../ui/Button";
import { LoadingState } from "../ui/LoadingState";
import { CampaignCreateWizardView } from "./CampaignCreateWizardView";
import { CampaignDetailView } from "./CampaignDetailView";
import { toast } from "sonner";
import {
  Megaphone,
  Plus,
  Search,
  RefreshCw,
  Play,
  Pause,
  Square,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Bot,
  Users,
  Clock,
  CheckCircle2,
  PhoneCall,
  Activity
} from "lucide-react";

interface CampaignsViewProps {
  onEditorDirtyChange?: (isDirty: boolean, handleSaveDraft: () => Promise<void>, handleDiscard: () => void) => void;
}

export function CampaignsView({ onEditorDirtyChange }: CampaignsViewProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState<boolean>(false);

  // Filters & Search
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(15);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const loadCampaigns = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort_by: "created_at",
        sort_order: "desc",
      });

      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const res = await fetchApi<CampaignPaginationResponse>(`/campaigns?${params.toString()}`);
      if (res) {
        setCampaigns(res.items || []);
        setTotal(res.total || 0);
        setTotalPages(res.total_pages || 1);
      }
    } catch (err: any) {
      toast.error("Failed to load campaigns: " + err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Periodic refresh when at least one campaign is running
  useEffect(() => {
    const hasRunning = campaigns.some((c) => c.status === "running");
    if (!hasRunning) return;

    const interval = setInterval(() => {
      loadCampaigns(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [campaigns, loadCampaigns]);

  // Quick Action Handlers
  const handleStartCampaign = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetchApi(`/campaigns/${campaign.id}/start`, { method: "POST" });
      toast.success(`Campaign "${campaign.name}" started.`);
      loadCampaigns(true);
    } catch (err: any) {
      toast.error("Failed to start: " + err.message);
    }
  };

  const handlePauseCampaign = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetchApi(`/campaigns/${campaign.id}/pause`, { method: "POST" });
      toast.info(`Campaign "${campaign.name}" paused.`);
      loadCampaigns(true);
    } catch (err: any) {
      toast.error("Failed to pause: " + err.message);
    }
  };

  const handleResumeCampaign = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetchApi(`/campaigns/${campaign.id}/resume`, { method: "POST" });
      toast.success(`Campaign "${campaign.name}" resumed.`);
      loadCampaigns(true);
    } catch (err: any) {
      toast.error("Failed to resume: " + err.message);
    }
  };

  const handleStopCampaign = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to stop campaign "${campaign.name}"?`)) return;
    try {
      await fetchApi(`/campaigns/${campaign.id}/stop`, { method: "POST" });
      toast.warning(`Campaign "${campaign.name}" stopped.`);
      loadCampaigns(true);
    } catch (err: any) {
      toast.error("Failed to stop: " + err.message);
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete campaign "${campaign.name}" and all its queue records?`)) return;
    try {
      await fetchApi(`/campaigns/${campaign.id}`, { method: "DELETE" });
      toast.success(`Campaign "${campaign.name}" deleted.`);
      loadCampaigns(true);
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message);
    }
  };

  // If a detail view is active
  if (selectedCampaignId) {
    return (
      <CampaignDetailView
        campaignId={selectedCampaignId}
        onBack={() => {
          setSelectedCampaignId(null);
          loadCampaigns(true);
        }}
      />
    );
  }

  // Summary Metrics Across Loaded Campaigns
  const runningCount = campaigns.filter((c) => c.status === "running").length;
  const totalAudience = campaigns.reduce((acc, c) => acc + (c.stats?.total_prospects || 0), 0);
  const totalConnected = campaigns.reduce((acc, c) => acc + (c.stats?.connected || 0), 0);
  const avgConnectionRate =
    campaigns.length > 0
      ? Math.round(campaigns.reduce((acc, c) => acc + (c.stats?.connection_rate || 0), 0) / campaigns.length)
      : 0;

  const getStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 -ml-3" />
            RUNNING
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Pause className="w-3 h-3" />
            PAUSED
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" />
            SCHEDULED
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30">
            <CheckCircle2 className="w-3 h-3" />
            COMPLETED
          </span>
        );
      case "stopped":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <Square className="w-3 h-3" />
            STOPPED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)]">
            DRAFT
          </span>
        );
    }
  };

  // If user is currently creating a campaign in-page
  if (isCreatingCampaign) {
    return (
      <div className="max-w-7xl mx-auto">
        <CampaignCreateWizardView
          onCancel={() => {
            setIsCreatingCampaign(false);
            if (onEditorDirtyChange) onEditorDirtyChange(false, async () => {}, () => {});
          }}
          onCampaignCreated={(newCmp) => {
            setIsCreatingCampaign(false);
            setSelectedCampaignId(newCmp.id);
            loadCampaigns(true);
            if (onEditorDirtyChange) onEditorDirtyChange(false, async () => {}, () => {});
          }}
          onDirtyChange={onEditorDirtyChange}
        />
      </div>
    );
  }

  // If user is viewing a campaign detail view
  if (selectedCampaignId) {
    return (
      <CampaignDetailView
        campaignId={selectedCampaignId}
        onBack={() => {
          setSelectedCampaignId(null);
          loadCampaigns(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 text-left max-w-7xl mx-auto">
      {/* Top Header & Metrics Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-heading)] tracking-tight flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[var(--color-primary)]" />
            Outbound Calling Campaigns
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Automated dialer scheduler, audience queues, and real-time AI voice conversation dispatching.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadCampaigns(false)}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreatingCampaign(true)}
            className="bg-[var(--color-primary)] text-white shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Campaign
          </Button>
        </div>
      </div>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Active Campaigns</span>
            <Megaphone className="w-4 h-4 text-[var(--color-primary)]" />
          </div>
          <p className="text-2xl font-bold text-[var(--color-heading)] mt-1">{runningCount}</p>
          <span className="text-[11px] text-[var(--color-muted)]">{campaigns.length} total campaigns</span>
        </div>

        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Target Audience</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{totalAudience}</p>
          <span className="text-[11px] text-[var(--color-muted)]">Enrolled prospects</span>
        </div>

        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Live Pickups / Connected</span>
            <PhoneCall className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{totalConnected}</p>
          <span className="text-[11px] text-[var(--color-muted)]">Conversations completed</span>
        </div>

        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Avg Connection Rate</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{avgConnectionRate}%</p>
          <span className="text-[11px] text-[var(--color-muted)]">Across all campaigns</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)]">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {["all", "running", "paused", "scheduled", "draft", "completed", "stopped"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize cursor-pointer transition-all ${
                statusFilter === st
                  ? "bg-[var(--color-primary)] text-white shadow-2xs"
                  : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--color-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search campaigns..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* Main Campaign List Content */}
      {isLoading ? (
        <div className="py-20 text-center">
          <LoadingState message="Loading outbound campaigns..." />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="py-16 text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-3">
          <div className="w-12 h-12 rounded-full bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] flex items-center justify-center mx-auto">
            <Megaphone className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[var(--color-heading)]">No campaigns found</h3>
          <p className="text-xs text-[var(--color-muted)] max-w-md mx-auto">
            {search || statusFilter !== "all"
              ? "No campaigns match your filter criteria. Try clearing search or status filters."
              : "Create your first automated outbound dialing campaign to reach prospects with AI Voice Agents."}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreatingCampaign(true)}
            className="bg-[var(--color-primary)] text-white mt-2"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Campaign
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((cmp) => {
            const stats = cmp.stats || {
              total_prospects: 0,
              queued: 0,
              calling: 0,
              completed: 0,
              connected: 0,
              failed: 0,
              connection_rate: 0,
              completion_rate: 0,
            };

            return (
              <div
                key={cmp.id}
                onClick={() => setSelectedCampaignId(cmp.id)}
                className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)]/50 hover:shadow-xs transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: Info */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-sm font-bold text-[var(--color-heading)] truncate">
                      {cmp.name}
                    </h3>
                    {getStatusBadge(cmp.status)}
                  </div>

                  {cmp.description && (
                    <p className="text-xs text-[var(--color-muted)] line-clamp-1">
                      {cmp.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap text-[11px] text-[var(--color-muted)]">
                    <span className="flex items-center gap-1 font-medium text-[var(--color-heading)]">
                      <Bot className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      {cmp.calling_config.agent_id}
                    </span>
                    <span className="opacity-30">•</span>
                    <span className="flex items-center gap-1 font-mono">
                      <PhoneCall className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      {cmp.calling_config.caller_phone_number}
                    </span>
                    <span className="opacity-30">•</span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      {stats.total_prospects} contacts
                    </span>
                    <span className="opacity-30">•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      {cmp.schedule.calling_start_time} - {cmp.schedule.calling_end_time} ({cmp.schedule.timezone.split("/").pop()})
                    </span>
                  </div>
                </div>

                {/* Middle: Progress & Rates */}
                <div className="w-full md:w-56 space-y-1.5 shrink-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-[var(--color-muted)]">Progress</span>
                    <span className="font-bold text-[var(--color-heading)]">
                      {stats.completion_rate}% ({stats.completed}/{stats.total_prospects})
                    </span>
                  </div>
                  <div className="w-full bg-[var(--color-surface-muted)] h-2 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${Math.min(100, stats.completion_rate)}%` }}
                      className="bg-[var(--color-primary)] h-full transition-all"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)]">
                    <span>Connected: <strong className="text-emerald-600">{stats.connected} ({stats.connection_rate}%)</strong></span>
                    <span>Queued: <strong className="text-blue-600">{stats.queued}</strong></span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {cmp.status === "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleStartCampaign(cmp, e)}
                      className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Start
                    </Button>
                  )}

                  {cmp.status === "scheduled" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleStartCampaign(cmp, e)}
                      className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Start
                    </Button>
                  )}

                  {cmp.status === "running" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handlePauseCampaign(cmp, e)}
                        className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      >
                        <Pause className="w-3.5 h-3.5 mr-1" />
                        Pause
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleStopCampaign(cmp, e)}
                        className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Square className="w-3.5 h-3.5 mr-1" />
                        Stop
                      </Button>
                    </>
                  )}

                  {cmp.status === "paused" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleResumeCampaign(cmp, e)}
                        className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      >
                        <Play className="w-3.5 h-3.5 mr-1" />
                        Resume
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleStopCampaign(cmp, e)}
                        className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Square className="w-3.5 h-3.5 mr-1" />
                        Stop
                      </Button>
                    </>
                  )}

                  {cmp.status !== "running" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteCampaign(cmp, e)}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCampaignId(cmp.id)}
                  >
                    <ChevronRight className="w-4 h-4 text-[var(--color-muted)]" />
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>
              Showing {campaigns.length} of {total} campaigns
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
