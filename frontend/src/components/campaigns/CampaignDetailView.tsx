import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../../api-client";
import {
  Campaign,
  CampaignMember,
  CampaignEvent,
  CallRecord,
  ActiveCampaignCall
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
  Sparkles,
  Zap,
  Radio,
  FileText,
  Flame,
  RotateCcw,
  Headphones
} from "lucide-react";
import { CallDetailDrawer } from "./CallDetailDrawer";
import { CampaignCharts } from "./CampaignCharts";
import { TimezoneLiveClock } from "./TimezoneLiveClock";

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
  const [campaignCalls, setCampaignCalls] = useState<CallRecord[]>([]);
  const [activeCalls, setActiveCalls] = useState<ActiveCampaignCall[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  // Active Call Drawer
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Tabs: "queue" | "calls" | "analytics" | "events" | "settings"
  const [activeTab, setActiveTab] = useState<"queue" | "calls" | "analytics" | "events" | "settings">("queue");

  // Queue Pagination & Filtering
  const [memberPage, setMemberPage] = useState<number>(1);
  const [memberPageSize] = useState<number>(20);
  const [memberTotal, setMemberTotal] = useState<number>(0);
  const [memberTotalPages, setMemberTotalPages] = useState<number>(1);
  const [memberStatusFilter, setMemberStatusFilter] = useState<string>("all");
  const [memberSearch, setMemberSearch] = useState<string>("");

  // Calls History Filtering
  const [callStatusFilter, setCallStatusFilter] = useState<string>("all");
  const [callOutcomeFilter, setCallOutcomeFilter] = useState<string>("all");
  const [callSearch, setCallSearch] = useState<string>("");
  const [callsPage, setCallsPage] = useState<number>(1);
  const [callsTotal, setCallsTotal] = useState<number>(0);
  const [callsTotalPages, setCallsTotalPages] = useState<number>(1);

  // Live ticking counter for in-flight calls
  const [tick, setTick] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadCampaignData(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadCampaignData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // 1. Load Campaign Detail + Real-Time Aggregated Stats
      const cmpData = await fetchApi<Campaign>(`/campaigns/${campaignId}`);
      setCampaign(cmpData);

      // 2. Load Members
      const memParams = new URLSearchParams({
        page: memberPage.toString(),
        page_size: memberPageSize.toString(),
      });
      if (memberStatusFilter !== "all") memParams.set("status", memberStatusFilter);
      if (memberSearch.trim()) memParams.set("search", memberSearch.trim());

      const memRes = await fetchApi<{ items: CampaignMember[]; total: number; total_pages: number }>(
        `/campaigns/${campaignId}/members?${memParams.toString()}`
      );
      if (memRes) {
        setMembers(memRes.items || []);
        setMemberTotal(memRes.total || 0);
        setMemberTotalPages(memRes.total_pages || 1);
      }

      // 3. Load Active Calls
      const activeRes = await fetchApi<ActiveCampaignCall[]>(`/campaigns/${campaignId}/active-calls`).catch(() => []);
      if (Array.isArray(activeRes)) {
        setActiveCalls(activeRes);
      }

      // 4. Load Campaign Calls
      const callParams = new URLSearchParams({
        page: callsPage.toString(),
        page_size: "25",
      });
      if (callStatusFilter !== "all") callParams.set("status", callStatusFilter);
      if (callOutcomeFilter !== "all") callParams.set("outcome", callOutcomeFilter);
      if (callSearch.trim()) callParams.set("search", callSearch.trim());

      const callsRes = await fetchApi<{ items: CallRecord[]; total: number; total_pages: number }>(
        `/campaigns/${campaignId}/calls?${callParams.toString()}`
      ).catch(() => ({ items: [], total: 0, total_pages: 1 }));
      if (callsRes) {
        setCampaignCalls(callsRes.items || []);
        setCallsTotal(callsRes.total || 0);
        setCallsTotalPages(callsRes.total_pages || 1);
      }

      // 5. Load Events
      const evtRes = await fetchApi<CampaignEvent[]>(`/campaigns/${campaignId}/events?limit=50`).catch(() => []);
      if (Array.isArray(evtRes)) {
        setEvents(evtRes);
      }
    } catch (err: any) {
      if (!silent) {
        toast.error("Failed to load campaign data: " + err.message);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [campaignId, memberPage, memberPageSize, memberStatusFilter, memberSearch, callsPage, callStatusFilter, callOutcomeFilter, callSearch]);

  useEffect(() => {
    loadCampaignData();
  }, [loadCampaignData]);

  // Active Real-Time Polling (Only active when campaign is running)
  useEffect(() => {
    if (campaign?.status !== "running") return;

    const interval = setInterval(() => {
      loadCampaignData(true);
    }, 2500);

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
      toast.success(`Campaign "${updated.name}" resumed.`);
      loadCampaignData(true);
    } catch (err: any) {
      toast.error("Failed to resume campaign: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!window.confirm("Are you sure you want to stop this campaign? Active calls will finish, but no new calls will be placed.")) {
      return;
    }
    setIsActionLoading(true);
    try {
      const updated = await fetchApi<Campaign>(`/campaigns/${campaignId}/stop`, { method: "POST" });
      setCampaign(updated);
      toast.warning(`Campaign "${updated.name}" has been stopped.`);
      loadCampaignData(true);
    } catch (err: any) {
      toast.error("Failed to stop campaign: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleTriggerDialNow = async () => {
    setIsActionLoading(true);
    try {
      await fetchApi(`/campaigns/${campaignId}/dial-now`, { method: "POST" });
      toast.success("Dispatched dialer tick now.");
      loadCampaignData(true);
    } catch (err: any) {
      toast.error("Dial trigger notice: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const openCallDetails = (callId: string) => {
    setSelectedCallId(callId);
    setIsDrawerOpen(true);
  };

  if (isLoading && !campaign) {
    return <LoadingState message="Loading campaign intelligence dashboard..." />;
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-lg font-bold text-[var(--color-heading)]">Campaign Not Found</h3>
        <p className="text-sm text-[var(--color-muted)]">The requested campaign could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={onBack} className="shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap">
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>Back to Campaigns</span>
        </Button>
      </div>
    );
  }

  const stats = campaign.stats || {
    total_prospects: 0,
    queued: 0,
    calling: 0,
    retrying: 0,
    completed: 0,
    connected: 0,
    failed: 0,
    no_answer: 0,
    busy: 0,
    voicemail: 0,
    callbacks: 0,
    interested: 0,
    warm_interested: 0,
    highly_interested: 0,
    not_interested: 0,
    qualified: 0,
    converted: 0,
    dnc: 0,
    connection_rate: 0,
    completion_rate: 0,
    avg_duration_seconds: 0,
  };

  const getCampaignStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            <span>RUNNING</span>
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>SCHEDULED</span>
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 whitespace-nowrap">
            <Pause className="w-3.5 h-3.5 shrink-0" />
            <span>PAUSED</span>
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>COMPLETED</span>
          </span>
        );
      case "stopped":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800 whitespace-nowrap">
            <Square className="w-3.5 h-3.5 shrink-0" />
            <span>STOPPED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 uppercase whitespace-nowrap">
            <span>{status}</span>
          </span>
        );
    }
  };

  const getMemberStatusBadge = (st: string) => {
    switch (st) {
      case "calling":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 animate-pulse whitespace-nowrap">
            <PhoneOutgoing className="w-3 h-3 shrink-0" /> <span>Calling</span>
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900 whitespace-nowrap">
            <Clock className="w-3 h-3 shrink-0" /> <span>Queued</span>
          </span>
        );
      case "retrying":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900 whitespace-nowrap">
            <RefreshCw className="w-3 h-3 shrink-0" /> <span>Retrying</span>
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> <span>Completed</span>
          </span>
        );
      case "unanswered":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 whitespace-nowrap">
            <PhoneMissed className="w-3 h-3 shrink-0" /> <span>No Answer</span>
          </span>
        );
      case "skipped_dnc":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 whitespace-nowrap">
            <UserX className="w-3 h-3 shrink-0" /> <span>DNC Blocked</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 capitalize whitespace-nowrap">
            <span>{st.replace("_", " ")}</span>
          </span>
        );
    }
  };

  const formatFriendlyOutcome = (outcome?: string | null, duration?: number): string => {
    if (!outcome) return "—";
    const raw = outcome.trim().toLowerCase().replace(/[-_]/g, " ");

    if (duration && duration > 0 && (raw.includes("no answer") || raw.includes("not answer") || raw.includes("unanswered"))) {
      return "Asked Details";
    }

    if (raw.includes("converted") || raw.includes("meeting") || raw.includes("qualified") || raw.includes("highly") || raw.includes("warm") || raw.includes("interested")) {
      return "Interested";
    }
    if (raw.includes("callback")) return "Callback Requested";
    if (raw.includes("information") || raw.includes("info") || raw.includes("asked")) return "Asked Details";
    if (raw.includes("follow up") || raw.includes("followup") || raw.includes("follow")) return "Follow-up";
    if (raw.includes("do not") || raw.includes("dnc")) return "Do Not Call";
    if (raw.includes("not interested")) return "Not Interested";
    if (raw.includes("no answer") || raw.includes("not answer") || raw.includes("unanswered")) return "No Answer";
    if (raw.includes("voicemail") || raw.includes("machine")) return "Voicemail";
    if (raw.includes("busy")) return "Busy";
    if (raw.includes("connected")) return "Connected";
    if (raw.includes("completed")) return "Completed";
    if (raw.includes("failed")) return "Failed";

    return outcome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getFriendlyOutcomeClass = (outcome?: string | null, duration?: number): string => {
    if (!outcome) return "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border-[var(--color-border)]";
    const raw = outcome.trim().toLowerCase().replace(/[-_]/g, " ");

    if (duration && duration > 0 && (raw.includes("no answer") || raw.includes("not answer") || raw.includes("unanswered"))) {
      return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-300 dark:border-blue-800";
    }

    if (raw.includes("converted") || raw.includes("meeting") || raw.includes("qualified") || raw.includes("highly") || raw.includes("warm") || raw.includes("interested")) {
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800";
    }
    if (raw.includes("callback")) {
      return "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800";
    }
    if (raw.includes("info") || raw.includes("asked") || raw.includes("follow")) {
      return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-300 dark:border-blue-800";
    }
    if (raw.includes("no answer") || raw.includes("busy") || raw.includes("voicemail")) {
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800";
    }
    if (raw.includes("not") || raw.includes("dnc") || raw.includes("failed")) {
      return "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-300 dark:border-rose-800";
    }
    return "bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-300 dark:border-slate-700";
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300 max-w-7xl mx-auto pb-12">
      {/* Top Navigation & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap">
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back</span>
          </Button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-[var(--color-heading)]">{campaign.name}</h1>
              {getCampaignStatusBadge(campaign.status)}
              {/* Subtle Live Active Badge - Only shown when campaign is actively running */}
              {campaign.status === "running" && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                  title="Campaign is actively dialing prospects"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500 animate-pulse" />
                  <span>Live</span>
                </span>
              )}
            </div>
            {campaign.description && (
              <p className="text-xs text-[var(--color-muted)] mt-1">{campaign.description}</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing || isActionLoading}
            className="inline-flex items-center gap-1.5 whitespace-nowrap active:scale-95 transition-transform"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? "animate-spin text-[var(--color-primary)]" : ""}`} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          {campaign.status === "draft" && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStart}
              disabled={isActionLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span>Start Campaign</span>
            </Button>
          )}

          {campaign.status === "scheduled" && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStart}
                disabled={isActionLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 shrink-0" />
                <span>Start Now</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={isActionLoading}
                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 shrink-0" />
                <span>Cancel</span>
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
                className="border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Dial Next Slot</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={isActionLoading}
                className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 border-amber-300 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Pause className="w-3.5 h-3.5 shrink-0" />
                <span>Pause</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={isActionLoading}
                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-300 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 shrink-0" />
                <span>Stop</span>
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
                className="bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 shrink-0" />
                <span>Resume Campaign</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={isActionLoading}
                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 shrink-0" />
                <span>Stop</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Timezone Live Clock Banner */}
      <TimezoneLiveClock schedule={campaign.schedule} />

      {/* Real-Time Operational KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {/* Total Audience */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Total Prospects</span>
            <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
          </div>
          <p className="text-xl font-bold text-[var(--color-heading)] mt-1">{stats.total_prospects}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Campaign audience</span>
        </div>

        {/* Queued */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Queued</span>
            <Clock className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.queued}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Waiting in line</span>
        </div>

        {/* In-Flight (Calling) */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Calling (Live)</span>
            <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.calling}</p>
          <span className="text-[10px] text-[var(--color-muted)]">{campaign.calling_config.max_concurrent_calls} max lines</span>
        </div>

        {/* Connected */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Connected</span>
            <PhoneForwarded className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.connected}</p>
          <span className="text-[10px] text-[var(--color-muted)]">{stats.connection_rate}% pickup rate</span>
        </div>

        {/* Interested Leads */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Interested</span>
            <Flame className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{stats.interested}</p>
          <span className="text-[10px] text-[var(--color-muted)]">{stats.warm_interested || 0} warm leads</span>
        </div>

        {/* Callback Requested */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Callbacks</span>
            <RotateCcw className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{stats.callbacks}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Scheduled calls</span>
        </div>

        {/* No Answer / Timeout */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>No Answer</span>
            <PhoneMissed className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.no_answer}</p>
          <span className="text-[10px] text-[var(--color-muted)]">Eligible for retry</span>
        </div>

        {/* Failed / DNC */}
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Failed / DNC</span>
            <UserX className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <p className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{stats.failed + stats.dnc}</p>
          <span className="text-[10px] text-[var(--color-muted)]">{stats.dnc} DNC blocked</span>
        </div>
      </div>

      {/* Progress Bar with Breakdown */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--color-heading)]">Campaign Progress</span>
            <span className="text-[var(--color-muted)]">
              ({stats.completed + stats.failed + stats.dnc} of {stats.total_prospects} finished)
            </span>
          </div>
          <span className="font-extrabold text-[var(--color-primary)] text-sm">{stats.completion_rate}%</span>
        </div>
        <div className="w-full bg-[var(--color-surface-muted)] h-2.5 rounded-full overflow-hidden flex">
          <div
            style={{ width: `${Math.min(100, stats.completion_rate)}%` }}
            className="bg-[var(--color-primary)] h-full transition-all duration-700"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)] pt-1">
          <span>{stats.connected} Connected</span>
          <span>•</span>
          <span>{stats.no_answer} No Answer</span>
          <span>•</span>
          <span>{stats.busy + stats.voicemail} Voicemail/Busy</span>
          <span>•</span>
          <span>{stats.failed} Failed</span>
          <span>•</span>
          <span>{stats.dnc} DNC</span>
        </div>
      </div>

      {/* LIVE CURRENT ACTIVE CALLS FEED */}
      {activeCalls.length > 0 && (
        <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
              Active In-Flight Calls Right Now ({activeCalls.length})
            </h3>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
              Live updates streaming
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeCalls.map((ac) => {
              const liveSecs = ac.started_at
                ? Math.max(0, Math.floor((Date.now() - new Date(ac.started_at).getTime()) / 1000))
                : ac.duration || 0;
              const mins = Math.floor(liveSecs / 60);
              const secs = liveSecs % 60;
              const formattedTime = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

              return (
                <div
                  key={ac.call_session_id}
                  className="p-3 bg-[var(--color-surface)] border border-emerald-300 dark:border-emerald-700 rounded-lg shadow-xs flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="font-mono text-xs text-[var(--color-heading)] block">
                        {ac.phone_number}
                      </strong>
                      <span className="text-[11px] text-[var(--color-muted)] flex items-center gap-1 mt-0.5">
                        <Bot className="w-3 h-3 text-[var(--color-primary)]" />
                        {ac.agent_name || "Sales Agent"}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 animate-pulse">
                      {ac.status || "Connected"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)] text-xs">
                    <div className="flex items-center gap-1 text-[var(--color-muted)] font-mono">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{formattedTime}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCallDetails(ac.call_session_id)}
                      className="text-[11px] h-6 px-2 text-[var(--color-primary)] inline-flex items-center justify-center whitespace-nowrap"
                    >
                      <span>Live View</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dashboard Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={`px-3 py-2 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "queue"
              ? "bg-[var(--color-primary)] text-white shadow-2xs"
              : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
          }`}
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span>Audience & Queue ({memberTotal})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("calls")}
          className={`px-3 py-2 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "calls"
              ? "bg-[var(--color-primary)] text-white shadow-2xs"
              : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
          }`}
        >
          <PhoneCall className="w-3.5 h-3.5 shrink-0" />
          <span>Call Intelligence History ({callsTotal})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`px-3 py-2 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "analytics"
              ? "bg-[var(--color-primary)] text-white shadow-2xs"
              : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
          }`}
        >
          <Activity className="w-3.5 h-3.5 shrink-0" />
          <span>Outcomes & Charts</span>
        </button>

        {/* <button
          type="button"
          onClick={() => setActiveTab("events")}
          className={`px-3 py-2 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "events"
              ? "bg-[var(--color-primary)] text-white shadow-2xs"
              : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
          }`}
        >
          <History className="w-3.5 h-3.5 shrink-0" />
          <span>Event Timeline ({events.length})</span>
        </button> */}

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`px-3 py-2 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "settings"
              ? "bg-[var(--color-primary)] text-white shadow-2xs"
              : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
          }`}
        >
          <Sliders className="w-3.5 h-3.5 shrink-0" />
          <span>Configuration & Schedule</span>
        </button>
      </div>

      {/* TAB 1: AUDIENCE & QUEUE */}
      {activeTab === "queue" && (
        <div className="space-y-4">
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
                  className={`px-2.5 py-1 rounded text-xs capitalize cursor-pointer font-medium transition-all whitespace-nowrap inline-flex items-center ${
                    memberStatusFilter === st
                      ? "bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] font-bold border border-[var(--color-primary)]/30"
                      : "bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"
                  }`}
                >
                  <span>{st.replace("_", " ")}</span>
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

          <div className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface)] shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-muted)] font-semibold">
                    <th className="py-2.5 px-3 whitespace-nowrap">Contact</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Phone Number</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Queue Status</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Attempts</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Outcome</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Last Attempt</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Next Retry</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-[var(--color-surface-muted)]/60 transition-colors cursor-pointer"
                      onClick={() => {
                        if (m.last_call_id) {
                          const matched = campaignCalls.find(
                            (c) => c.id === m.last_call_id || c.prospect_id === m.prospect_id || c.to_number === m.phone_number || (c as any).session_id === m.last_call_id || (c as any).call_session_id === m.last_call_id
                          );
                          openCallDetails(matched?.id || m.last_call_id);
                        }
                      }}
                    >
                      <td className="py-2.5 px-3 font-medium text-[var(--color-heading)] whitespace-nowrap">
                        {m.prospect_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--color-muted)] whitespace-nowrap">
                        {m.phone_number}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {getMemberStatusBadge(m.status)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-semibold text-[var(--color-heading)]">{m.attempts}</span>
                        <span className="text-[var(--color-muted)]">/{campaign.calling_config.max_attempts_per_prospect}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {m.last_call_outcome ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${getFriendlyOutcomeClass(m.last_call_outcome, m.last_call_duration)}`}>
                            <span>{formatFriendlyOutcome(m.last_call_outcome, m.last_call_duration)}</span>
                            {m.last_call_duration > 0 && <span className="opacity-75 font-normal">({m.last_call_duration}s)</span>}
                          </span>
                        ) : (
                          <span className="text-[var(--color-muted)] opacity-60">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[var(--color-muted)] whitespace-nowrap">
                        {m.last_attempt_at
                          ? new Date(m.last_attempt_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[var(--color-muted)] whitespace-nowrap">
                        {m.next_attempt_at
                          ? new Date(m.next_attempt_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {m.last_call_id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              const matched = campaignCalls.find(
                                (c) => c.id === m.last_call_id || c.prospect_id === m.prospect_id || c.to_number === m.phone_number || (c as any).session_id === m.last_call_id || (c as any).call_session_id === m.last_call_id
                              );
                              openCallDetails(matched?.id || m.last_call_id!);
                            }}
                            className="text-[11px] h-6 px-2 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span>Transcript</span>
                          </Button>
                        ) : (
                          <span className="text-[var(--color-muted)] text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs text-[var(--color-muted)]">
                        No contacts found matching the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span>Showing {members.length} of {memberTotal} contacts</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMemberPage((p) => Math.max(1, p - 1))}
                  disabled={memberPage <= 1}
                  className="inline-flex items-center justify-center whitespace-nowrap"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="whitespace-nowrap">Page {memberPage} of {memberTotalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMemberPage((p) => Math.min(memberTotalPages, p + 1))}
                  disabled={memberPage >= memberTotalPages}
                  className="inline-flex items-center justify-center whitespace-nowrap"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CALLS HISTORY & INTELLIGENCE */}
      {activeTab === "calls" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status filter */}
              <select
                value={callStatusFilter}
                onChange={(e) => {
                  setCallStatusFilter(e.target.value);
                  setCallsPage(1);
                }}
                className="px-2.5 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              >
                <option value="all">All Telephony Statuses</option>
                <option value="completed">Completed</option>
                <option value="in-progress">In Progress</option>
                <option value="no-answer">No Answer</option>
                <option value="busy">Busy</option>
                <option value="failed">Failed</option>
              </select>

              {/* Outcome filter */}
              <select
                value={callOutcomeFilter}
                onChange={(e) => {
                  setCallOutcomeFilter(e.target.value);
                  setCallsPage(1);
                }}
                className="px-2.5 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-semibold text-[var(--color-primary)]"
              >
                <option value="all">All Outcomes</option>
                <option value="interested">Interested</option>
                <option value="callback">Callback Requested</option>
                <option value="asked_details">Asked Details</option>
                <option value="follow_up">Follow-up</option>
                <option value="not_interested">Not Interested</option>
                <option value="dnc">Do Not Call</option>
                <option value="no_answer">No Answer</option>
                <option value="busy">Busy / Voicemail</option>
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--color-muted)]" />
              <input
                type="text"
                value={callSearch}
                onChange={(e) => {
                  setCallSearch(e.target.value);
                  setCallsPage(1);
                }}
                placeholder="Search recipient, summary, intent..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              />
            </div>
          </div>

          {/* Calls Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {campaignCalls.map((c) => (
              <div
                key={c.id}
                onClick={() => openCallDetails(c.id)}
                className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] rounded-xl shadow-2xs space-y-3 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[var(--color-heading)]">{c.to_number}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${getFriendlyOutcomeClass(c.business_outcome || c.outcome, c.duration)}`}>
                    {formatFriendlyOutcome(c.business_outcome || c.outcome, c.duration)}
                  </span>
                </div>

                <p className="text-xs text-[var(--color-text)] line-clamp-2 leading-relaxed">
                  {c.summary || "Conversation finished. Click to review full spoken turns and AI intelligence."}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>{c.duration}s</span>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--color-primary)] group-hover:underline inline-flex items-center gap-1 whitespace-nowrap">
                    <span>View Transcript</span>
                    <span>&rarr;</span>
                  </span>
                </div>
              </div>
            ))}

            {campaignCalls.length === 0 && (
              <div className="col-span-full py-16 text-center text-xs text-[var(--color-muted)]">
                No calls recorded matching the selected filter criteria.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: REAL-TIME CHARTS & OUTCOMES */}
      {activeTab === "analytics" && (
        <CampaignCharts stats={stats} calls={campaignCalls} />
      )}

      {/* TAB 4: EVENT TIMELINE */}
      {activeTab === "events" && (
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2 whitespace-nowrap">
            <History className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
            <span>Audit & Real-Time Event Dispatch Log</span>
          </h3>

          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2 divide-y divide-[var(--color-border)]">
            {events.map((evt) => (
              <div key={evt.id} className="pt-3 first:pt-0 flex items-start gap-3 text-xs">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-[var(--color-muted)] shrink-0 whitespace-nowrap">
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
              <p className="text-xs text-[var(--color-muted)] py-8 text-center">No campaign events recorded yet.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: CONFIGURATION & SCHEDULE */}
      {activeTab === "settings" && (
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs space-y-4 text-xs">
          <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2 whitespace-nowrap">
            <Sliders className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
            <span>Campaign Operational Configuration & Schedule</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[var(--color-surface-muted)] rounded-xl border border-[var(--color-border)] space-y-2.5">
              <span className="font-bold text-[var(--color-heading)] block text-xs">Calling Rules & Concurrency</span>
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
                Retry Cooldown Delay: <strong className="text-[var(--color-heading)]">{campaign.calling_config.retry_delay_minutes} minutes</strong>
              </p>
            </div>

            <div className="p-4 bg-[var(--color-surface-muted)] rounded-xl border border-[var(--color-border)] space-y-2.5">
              <span className="font-bold text-[var(--color-heading)] block text-xs">Schedule & Timezone Rules</span>
              <p className="text-[var(--color-muted)]">
                Allowed Calling Days: <strong className="text-[var(--color-heading)]">{campaign.schedule.calling_days.join(", ")}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Daily Window: <strong className="text-[var(--color-heading)]">{campaign.schedule.calling_start_time} - {campaign.schedule.calling_end_time}</strong>
              </p>
              <p className="text-[var(--color-muted)]">
                Configured Timezone: <strong className="text-[var(--color-heading)]">{campaign.schedule.timezone}</strong>
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

      {/* Call Detail Drawer */}
      <CallDetailDrawer
        callId={selectedCallId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onRefreshParent={() => loadCampaignData(true)}
      />
    </div>
  );
}
