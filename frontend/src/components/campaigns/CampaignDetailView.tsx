import React, { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../../api-client";
import {
  Campaign,
  CampaignMember,
  CampaignEvent,
  CampaignStatus,
  CampaignMemberStatus,
} from "../../types";
import { Button } from "../ui/Button";
import { LoadingState } from "../ui/LoadingState";
import { toast } from "sonner";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  RefreshCw,
  Users,
  PhoneCall,
  PhoneOutgoing,
  Bot,
  Clock,
  Calendar,
  Sliders,
  CheckCircle2,
  AlertCircle,
  PhoneForwarded,
  ShieldCheck,
  UserX,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Activity,
  History,
  PhoneMissed,
  PhoneOff,
  Sparkles
} from "lucide-react";

interface CampaignDetailViewProps {
  campaignId: string;
  onBack: () => void;
  onEditCampaign?: (campaign: Campaign) => void;
}

export function CampaignDetailView({
  campaignId,
  onBack,
  onEditCampaign,
}: CampaignDetailViewProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<"queue" | "analytics" | "events" | "settings">("queue");

  // Queue Pagination & Filtering
  const [memberPage, setMemberPage] = useState<number>(1);
  const [memberPageSize] = useState<number>(20);
  const [memberTotal, setMemberTotal] = useState<number>(0);
  const [memberTotalPages, setMemberTotalPages] = useState<number>(1);
  const [memberStatusFilter, setMemberStatusFilter] = useState<string>("all");
  const [memberSearch, setMemberSearch] = useState<string>("");

  const loadCampaignData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // 1. Load Campaign Detail + Stats
      const cmpData = await fetchApi<Campaign>(`/campaigns/${campaignId}`);
      setCampaign(cmpData);

      // 2. Load Members
      const params = new URLSearchParams({
        page: memberPage.toString(),
        page_size: memberPageSize.toString(),
      });
      if (memberStatusFilter !== "all") {
        params.set("status", memberStatusFilter);
      }
      if (memberSearch.trim()) {
        params.set("search", memberSearch.trim());
      }

      const memRes = await fetchApi<{ items: CampaignMember[]; total: number; total_pages: number }>(
        `/campaigns/${campaignId}/members?${params.toString()}`
      );
      if (memRes) {
        setMembers(memRes.items || []);
        setMemberTotal(memRes.total || 0);
        setMemberTotalPages(memRes.total_pages || 1);
      }

      // 3. Load Events
      const evtRes = await fetchApi<CampaignEvent[]>(`/campaigns/${campaignId}/events?limit=50`);
      if (Array.isArray(evtRes)) {
        setEvents(evtRes);
      }
    } catch (err: any) {
      toast.error("Failed to load campaign data: " + err.message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [campaignId, memberPage, memberPageSize, memberStatusFilter, memberSearch]);

  useEffect(() => {
    loadCampaignData();
  }, [loadCampaignData]);

  // Polling when running or calling
  useEffect(() => {
    if (!campaign || campaign.status !== "running") return;
    const interval = setInterval(() => {
      loadCampaignData(true);
    }, 1500);
    return () => clearInterval(interval);
  }, [campaign?.status, loadCampaignData]);

  // Lifecycle actions
  const handleStart = async () => {
    setIsActionLoading(true);
    try {
      const updated = await fetchApi<Campaign>(`/campaigns/${campaignId}/start`, { method: "POST" });
      setCampaign(updated);
      toast.success(`Campaign "${updated.name}" started successfully!`);
      loadCampaignData(true);
    } catch (err: any) {
      toast.error("Failed to start campaign: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePause = async () => {
    setIsActionLoading(true);
    try {
      const updated = await fetchApi<Campaign>(`/campaigns/${campaignId}/pause`, { method: "POST" });
      setCampaign(updated);
      toast.info(`Campaign "${updated.name}" is now paused.`);
      loadCampaignData(true);
    } catch (err: any) {
      toast.error("Failed to pause campaign: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleResume = async () => {
    setIsActionLoading(true);
    try {
      const updated = await fetchApi<Campaign>(`/campaigns/${campaignId}/resume`, { method: "POST" });
      setCampaign(updated);
      toast.success(`Campaign "${updated.name}" resumed!`);
      loadCampaignData(true);
    } catch (err: any) {
      toast.error("Failed to resume campaign: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!confirm("Are you sure you want to stop this campaign? Stopping is permanent.")) return;
    setIsActionLoading(true);
    try {
      const updated = await fetchApi<Campaign>(`/campaigns/${campaignId}/stop`, { method: "POST" });
      setCampaign(updated);
      toast.warning(`Campaign "${updated.name}" was stopped.`);
      loadCampaignData(true);
    } catch (err: any) {
      toast.error("Failed to stop campaign: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleTriggerDialNow = async () => {
    try {
      await fetchApi(`/campaigns/${campaignId}/dial-now`, { method: "POST" });
      toast.success("Triggered dialer execution tick.");
      loadCampaignData(true);
    } catch (err: any) {
      toast.error("Dialer trigger error: " + err.message);
    }
  };

  if (isLoading || !campaign) {
    return (
      <div className="py-20 text-center">
        <LoadingState message="Loading campaign operations dashboard..." />
      </div>
    );
  }

  const stats = campaign.stats || {
    total_prospects: 0,
    queued: 0,
    calling: 0,
    completed: 0,
    connected: 0,
    failed: 0,
    no_answer: 0,
    busy: 0,
    voicemail: 0,
    callbacks: 0,
    interested: 0,
    not_interested: 0,
    dnc: 0,
    connection_rate: 0,
    completion_rate: 0,
    avg_duration_seconds: 0,
  };

  const getStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            RUNNING
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Pause className="w-3 h-3" />
            PAUSED
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" />
            SCHEDULED
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30">
            <CheckCircle2 className="w-3 h-3" />
            COMPLETED
          </span>
        );
      case "stopped":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <Square className="w-3 h-3" />
            STOPPED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)]">
            DRAFT
          </span>
        );
    }
  };

  const getMemberStatusBadge = (status: CampaignMemberStatus) => {
    switch (status) {
      case "calling":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 animate-pulse">
            Calling...
          </span>
        );
      case "queued":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-600 border border-blue-500/30">
            Queued
          </span>
        );
      case "retrying":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/30">
            Retrying
          </span>
        );
      case "unanswered":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/30">
            Not Answered
          </span>
        );
      case "completed":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-500/10 text-slate-600 border border-slate-500/30">
            Completed
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-600 border border-rose-500/30">
            Failed
          </span>
        );
      case "skipped_dnc":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-600 border border-purple-500/30">
            DNC Blocked
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--color-surface-muted)] text-[var(--color-muted)]">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-left max-w-7xl mx-auto">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] cursor-pointer"
            aria-label="Back to Campaigns"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-[var(--color-heading)] tracking-tight">
                {campaign.name}
              </h1>
              {getStatusBadge(campaign.status)}
            </div>
            {campaign.description && (
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{campaign.description}</p>
            )}
          </div>
        </div>

        {/* Action Controls based on Campaign State */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadCampaignData(false)}
            disabled={isActionLoading}
          >
            <span className="flex items-center">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isActionLoading ? "animate-spin" : ""}`} />
              Refresh
            </span>
          </Button>

          {campaign.status === "draft" && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStart}
              disabled={isActionLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Start Campaign
            </Button>
          )}

          {campaign.status === "scheduled" && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStart}
                disabled={isActionLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                Start Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={isActionLoading}
                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            </>
          )}

          {campaign.status === "running" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerDialNow}
                disabled={isActionLoading}
                className="border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))]"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Dial Tick Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={isActionLoading}
                className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 border-amber-300"
              >
                <Pause className="w-3.5 h-3.5 mr-1.5" />
                Pause
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={isActionLoading}
                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-300"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop
              </Button>
            </>
          )}

          {campaign.status === "paused" && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={handleResume}
                disabled={isActionLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                Resume Campaign
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={isActionLoading}
                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Meta Chips Bar */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--color-muted)] bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center gap-1.5">
          <Bot className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Agent: <strong className="text-[var(--color-heading)] font-semibold">{campaign.calling_config.agent_id}</strong></span>
        </div>
        <span className="opacity-30">•</span>
        <div className="flex items-center gap-1.5">
          <PhoneCall className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Caller ID: <strong className="font-mono text-[var(--color-heading)]">{campaign.calling_config.caller_phone_number}</strong></span>
        </div>
        <span className="opacity-30">•</span>
        <div className="flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Concurrency: <strong className="text-[var(--color-heading)]">{campaign.calling_config.max_concurrent_calls} lines</strong></span>
        </div>
        <span className="opacity-30">•</span>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Window: <strong className="text-[var(--color-heading)]">{campaign.schedule.calling_start_time} - {campaign.schedule.calling_end_time} ({campaign.schedule.timezone.split("/").pop()})</strong></span>
        </div>
      </div>

      {/* Live Operational Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {/* Total Audience */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Total</span>
            <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
          </div>
          <p className="text-xl font-bold text-[var(--color-heading)] mt-1">{stats.total_prospects}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Target contacts</span>
        </div>

        {/* Queued */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Queued</span>
            <Clock className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.queued}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Waiting in line</span>
        </div>

        {/* In-Flight / Calling */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>In-Flight</span>
            <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.calling}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Active now</span>
        </div>

        {/* Retrying */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Retrying</span>
            <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.retrying || 0}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Cooldown</span>
        </div>

        {/* Connected */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Connected</span>
            <PhoneForwarded className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.connected}</p>
          <span className="text-[10px] text-[var(--color-muted)]">{stats.connection_rate}% rate</span>
        </div>

        {/* No Answer */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>No Answer</span>
            <PhoneMissed className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.no_answer}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Eligible for retry</span>
        </div>

        {/* Busy / Voicemail */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Busy/VM</span>
            <PhoneOff className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.busy + stats.voicemail}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Busy / Voicemail</span>
        </div>

        {/* Callbacks / Interested */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Interested</span>
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{stats.interested + stats.callbacks}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Hot Leads</span>
        </div>

        {/* DNC Blocked */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>DNC</span>
            <UserX className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{stats.dnc}</p>
          <span className="text-[10px] text-[var(--color-muted)]">DNC Protected</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--color-heading)]">Campaign Completion Progress</span>
            <span className="text-[var(--color-muted)]">
              ({stats.completed + stats.failed + stats.dnc} of {stats.total_prospects} finished)
            </span>
          </div>
          <span className="font-bold text-[var(--color-primary)]">{stats.completion_rate}%</span>
        </div>
        <div className="w-full bg-[var(--color-surface-muted)] h-2.5 rounded-full overflow-hidden flex">
          <div
            style={{ width: `${Math.min(100, stats.completion_rate)}%` }}
            className="bg-[var(--color-primary)] h-full transition-all duration-500"
          />
        </div>
      </div>

      {/* Dashboard Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={`px-3 py-2 text-xs font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1.5 ${activeTab === "queue"
            ? "bg-[var(--color-primary)] text-white shadow-2xs"
            : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
            }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Audience & Live Queue ({memberTotal})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`px-3 py-2 text-xs font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1.5 ${activeTab === "analytics"
            ? "bg-[var(--color-primary)] text-white shadow-2xs"
            : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
            }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Outcomes & Analytics</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("events")}
          className={`px-3 py-2 text-xs font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1.5 ${activeTab === "events"
            ? "bg-[var(--color-primary)] text-white shadow-2xs"
            : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
            }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Event Timeline ({events.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`px-3 py-2 text-xs font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1.5 ${activeTab === "settings"
            ? "bg-[var(--color-primary)] text-white shadow-2xs"
            : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
            }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Configuration & Schedule</span>
        </button>
      </div>

      {/* Tab 1: Audience & Queue Table */}
      {activeTab === "queue" && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {["all", "queued", "calling", "retrying", "unanswered", "completed", "failed", "skipped_dnc"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setMemberStatusFilter(st);
                    setMemberPage(1);
                  }}
                  className={`px-2.5 py-1 rounded text-xs capitalize cursor-pointer font-medium transition-all ${memberStatusFilter === st
                    ? "bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] font-bold border border-[var(--color-primary)]/30"
                    : "bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"
                    }`}
                >
                  {st.replace("_", " ")}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--color-muted)]" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  setMemberPage(1);
                }}
                placeholder="Search contact name or phone..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              />
            </div>
          </div>

          {/* Members Table */}
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-muted)] font-semibold">
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3">Phone Number</th>
                    <th className="py-2.5 px-3">Queue Status</th>
                    <th className="py-2.5 px-3">Attempts</th>
                    <th className="py-2.5 px-3">Last Outcome</th>
                    <th className="py-2.5 px-3">Last Attempt</th>
                    <th className="py-2.5 px-3">Next Retry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-[var(--color-surface-muted)]/50 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-[var(--color-heading)]">
                        {m.prospect_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--color-muted)]">
                        {m.phone_number}
                      </td>
                      <td className="py-2.5 px-3">
                        {getMemberStatusBadge(m.status)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-[var(--color-heading)]">
                          {m.attempts}
                        </span>
                        <span className="text-[var(--color-muted)]">
                          /{campaign.calling_config.max_attempts_per_prospect}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 capitalize">
                        {m.last_call_outcome ? (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface-muted)] text-[10px] font-medium border border-[var(--color-border)]">
                            {m.last_call_outcome.replace("_", " ")}
                            {m.last_call_duration > 0 && ` (${m.last_call_duration}s)`}
                          </span>
                        ) : (
                          <span className="text-[var(--color-muted)] opacity-60">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[var(--color-muted)]">
                        {m.last_attempt_at
                          ? new Date(m.last_attempt_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[var(--color-muted)]">
                        {m.next_attempt_at
                          ? new Date(m.next_attempt_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-[var(--color-muted)]">
                        No contacts found matching the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span>
                Showing {members.length} of {memberTotal} contacts
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMemberPage((p) => Math.max(1, p - 1))}
                  disabled={memberPage <= 1}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span>
                  Page {memberPage} of {memberTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMemberPage((p) => Math.min(memberTotalPages, p + 1))}
                  disabled={memberPage >= memberTotalPages}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Analytics & Outcomes */}
      {activeTab === "analytics" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--color-primary)]" />
              Call Outcome Distribution
            </h3>

            <div className="space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--color-muted)]">Connected / Answered</span>
                  <span className="font-bold text-emerald-600">{stats.connected} ({stats.connection_rate}%)</span>
                </div>
                <div className="w-full bg-[var(--color-surface-muted)] h-2 rounded-full overflow-hidden">
                  <div style={{ width: `${stats.connection_rate}%` }} className="bg-emerald-500 h-full" />
                </div>
              </div>

              <div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--color-muted)]">Unanswered / Ringing Timeout</span>
                  <span className="font-bold text-amber-600">{stats.no_answer}</span>
                </div>
                <div className="w-full bg-[var(--color-surface-muted)] h-2 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${stats.total_prospects > 0 ? (stats.no_answer / stats.total_prospects) * 100 : 0}%` }}
                    className="bg-amber-500 h-full"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--color-muted)]">Busy / Voicemail</span>
                  <span className="font-bold text-amber-600">{stats.busy + stats.voicemail}</span>
                </div>
                <div className="w-full bg-[var(--color-surface-muted)] h-2 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${stats.total_prospects > 0 ? ((stats.busy + stats.voicemail) / stats.total_prospects) * 100 : 0}%` }}
                    className="bg-amber-400 h-full"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--color-muted)]">Do Not Contact (DNC) Blocked</span>
                  <span className="font-bold text-purple-600">{stats.dnc}</span>
                </div>
                <div className="w-full bg-[var(--color-surface-muted)] h-2 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${stats.total_prospects > 0 ? (stats.dnc / stats.total_prospects) * 100 : 0}%` }}
                    className="bg-purple-500 h-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--color-primary)]" />
              Efficiency & Quality Benchmarks
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
                <span className="text-[11px] text-[var(--color-muted)]">Average Call Duration</span>
                <p className="text-lg font-bold text-[var(--color-heading)] mt-1">{stats.avg_duration_seconds}s</p>
                <span className="text-[10px] text-[var(--color-muted)]">Spoken conversation time</span>
              </div>

              <div className="p-3 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
                <span className="text-[11px] text-[var(--color-muted)]">Connection Rate</span>
                <p className="text-lg font-bold text-emerald-600 mt-1">{stats.connection_rate}%</p>
                <span className="text-[10px] text-[var(--color-muted)]">Pickups vs Dialed</span>
              </div>

              <div className="p-3 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
                <span className="text-[11px] text-[var(--color-muted)]">Completion Rate</span>
                <p className="text-lg font-bold text-blue-600 mt-1">{stats.completion_rate}%</p>
                <span className="text-[10px] text-[var(--color-muted)]">Audience reached</span>
              </div>

              <div className="p-3 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
                <span className="text-[11px] text-[var(--color-muted)]">Interested / Qualified</span>
                <p className="text-lg font-bold text-indigo-600 mt-1">{stats.interested + stats.callbacks}</p>
                <span className="text-[10px] text-[var(--color-muted)]">Lead conversion signal</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Event Timeline */}
      {activeTab === "events" && (
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--color-primary)]" />
            Audit & Dispatch Activity Log
          </h3>

          <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 divide-y divide-[var(--color-border)]">
            {events.map((evt) => (
              <div key={evt.id} className="pt-3 first:pt-0 flex items-start gap-3 text-xs">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-[var(--color-muted)] shrink-0">
                  {evt.event_type}
                </span>
                <div className="flex-1">
                  <p className="text-[var(--color-heading)] font-medium">{evt.message}</p>
                  <span className="text-[10px] text-[var(--color-muted)]">
                    {new Date(evt.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-xs text-[var(--color-muted)] py-4 text-center">No campaign events recorded yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Configuration & Settings */}
      {activeTab === "settings" && (
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-4 text-xs">
          <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[var(--color-primary)]" />
            Campaign Operational Configuration
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-[var(--color-surface-muted)] rounded-md border border-[var(--color-border)] space-y-2">
              <span className="font-semibold text-[var(--color-heading)]">Calling Rules</span>
              <p className="text-[var(--color-muted)]">
                Assigned Agent: <strong className="text-[var(--color-heading)]">{campaign.calling_config.agent_id}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Caller Phone Number: <strong className="font-mono text-[var(--color-heading)]">{campaign.calling_config.caller_phone_number}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Max Concurrent Live Lines: <strong className="text-[var(--color-heading)]">{campaign.calling_config.max_concurrent_calls}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Max Attempts Per Contact: <strong className="text-[var(--color-heading)]">{campaign.calling_config.max_attempts_per_prospect}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Retry Delay: <strong className="text-[var(--color-heading)]">{campaign.calling_config.retry_delay_minutes} minutes</strong>
              </p>
            </div>

            <div className="p-3 bg-[var(--color-surface-muted)] rounded-md border border-[var(--color-border)] space-y-2">
              <span className="font-semibold text-[var(--color-heading)]">Schedule & Timezone</span>
              <p className="text-[var(--color-muted)]">
                Allowed Days: <strong className="text-[var(--color-heading)]">{campaign.schedule.calling_days.join(", ")}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Daily Window: <strong className="text-[var(--color-heading)]">{campaign.schedule.calling_start_time} - {campaign.schedule.calling_end_time}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Timezone: <strong className="text-[var(--color-heading)]">{campaign.schedule.timezone}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Start Date: <strong className="text-[var(--color-heading)]">{campaign.schedule.start_date || "Immediate"}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                End Date: <strong className="text-[var(--color-heading)]">{campaign.schedule.end_date || "No Expiration"}</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
