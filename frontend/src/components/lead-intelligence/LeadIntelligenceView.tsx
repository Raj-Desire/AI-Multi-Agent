import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi, getAuthHeaders } from "../../api-client";
import { useAuth } from "../../context/AuthContext";
import {
  LeadKPISummary,
  LeadTrendsResponse,
  LeadOutcomeDistributionResponse,
  CampaignLeadStat,
  AgentLeadStat,
  LeadListItem,
  LeadListPaginationResponse,
  CallbackListItem,
  CallbackListPaginationResponse,
  VoiceTelemetryEvent
} from "../../types";
import { LeadKpiSection } from "./LeadKpiSection";
import { LeadFilterBar, LeadFilterState } from "./LeadFilterBar";
import { LeadTrendsChart } from "./LeadTrendsChart";
import { LeadOutcomeDistribution } from "./LeadOutcomeDistribution";
import { CampaignPerformanceSection } from "./CampaignPerformanceSection";
import { AgentPerformanceSection } from "./AgentPerformanceSection";
import { LeadTable } from "./LeadTable";
import { CallbackRequestsView } from "./CallbackRequestsView";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import {
  Sparkles,
  Flame,
  PhoneForwarded,
  BarChart3,
  Users,
  RefreshCw,
  Radio,
  Download,
  AlertCircle,
  HelpCircle,
  Megaphone,
  CheckCircle2,
  TrendingUp,
  ArrowRight
} from "lucide-react";
import { Button } from "../ui/Button";
import { toast } from "sonner";

const INITIAL_FILTERS: LeadFilterState = {
  search: "",
  dateRange: "7d",
  customStart: "",
  customEnd: "",
  campaignId: "all",
  outcome: "all",
  interestLevel: "all",
  scoreRange: "all",
  agentId: "all",
  prospectStatus: "all",
  followUp: "all",
};

export function LeadIntelligenceView() {
  const { user } = useAuth();

  // Navigation View Tab: "leads" | "callbacks" | "analytics"
  const [activeTab, setActiveTab] = useState<"leads" | "callbacks" | "analytics">("leads");

  // Filter State
  const [filters, setFilters] = useState<LeadFilterState>(INITIAL_FILTERS);

  // Data States
  const [summary, setSummary] = useState<LeadKPISummary | null>(null);
  const [trends, setTrends] = useState<LeadTrendsResponse | null>(null);
  const [distribution, setDistribution] = useState<LeadOutcomeDistributionResponse | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignLeadStat[]>([]);
  const [agents, setAgents] = useState<AgentLeadStat[]>([]);

  // Leads Table State
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [leadsTotal, setLeadsTotal] = useState<number>(0);
  const [leadsPage, setLeadsPage] = useState<number>(1);
  const [leadsPageSize] = useState<number>(20);
  const [leadsTotalPages, setLeadsTotalPages] = useState<number>(1);
  const [leadsSortBy, setLeadsSortBy] = useState<string>("last_call_at");
  const [leadsSortOrder, setLeadsSortOrder] = useState<"asc" | "desc">("desc");

  // Callback Queue State
  const [callbacks, setCallbacks] = useState<CallbackListItem[]>([]);
  const [callbacksTotal, setCallbacksTotal] = useState<number>(0);
  const [callbacksPage, setCallbacksPage] = useState<number>(1);
  const [callbacksTotalPages, setCallbacksTotalPages] = useState<number>(1);

  // Active Trend Metric
  const [trendMetric, setTrendMetric] = useState<string>("all");

  // Loading States
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState<boolean>(true);
  const [isLoadingTrends, setIsLoadingTrends] = useState<boolean>(true);
  const [isLoadingCallbacks, setIsLoadingCallbacks] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Detail Drawer State
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Real-time WebSocket connection
  const wsRef = useRef<WebSocket | null>(null);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  // -------------------------------------------------------------
  // Data Fetching
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // Data Fetching Optimization: Tab-scoped & low query rate
  // -------------------------------------------------------------
  const loadSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      const params = new URLSearchParams();
      if (filters.dateRange !== "all") params.set("date_range", filters.dateRange);
      if (filters.customStart) params.set("custom_start", filters.customStart);
      if (filters.customEnd) params.set("custom_end", filters.customEnd);
      if (filters.campaignId !== "all") params.set("campaign_id", filters.campaignId);

      const queryStr = params.toString() ? `?${params.toString()}` : "";

      const [sumRes, cmpRes, agRes] = await Promise.all([
        fetchApi<LeadKPISummary>(`/lead-intelligence/summary${queryStr}`).catch(() => null),
        fetchApi<CampaignLeadStat[]>(`/lead-intelligence/campaigns${queryStr}`).catch(() => []),
        fetchApi<AgentLeadStat[]>(`/lead-intelligence/agents${queryStr}`).catch(() => []),
      ]);

      if (sumRes) setSummary(sumRes);
      if (Array.isArray(cmpRes)) setCampaigns(cmpRes);
      if (Array.isArray(agRes)) setAgents(agRes);
    } catch (err) {
      console.error("Failed to load lead summary:", err);
    } finally {
      setIsLoadingSummary(false);
    }
  }, [filters.dateRange, filters.customStart, filters.customEnd, filters.campaignId]);

  const loadAnalyticsDetails = useCallback(async () => {
    setIsLoadingTrends(true);
    try {
      const params = new URLSearchParams();
      if (filters.dateRange !== "all") params.set("date_range", filters.dateRange);
      if (filters.customStart) params.set("custom_start", filters.customStart);
      if (filters.customEnd) params.set("custom_end", filters.customEnd);
      if (filters.campaignId !== "all") params.set("campaign_id", filters.campaignId);

      const queryStr = params.toString() ? `?${params.toString()}` : "";

      const distPromise = fetchApi<LeadOutcomeDistributionResponse>(`/lead-intelligence/distribution${queryStr}`).catch(() => null);

      const trendParams = new URLSearchParams(params);
      trendParams.set("metric", trendMetric);
      const trendPromise = fetchApi<LeadTrendsResponse>(`/lead-intelligence/trends?${trendParams.toString()}`).catch(() => null);

      const [distRes, trendRes] = await Promise.all([distPromise, trendPromise]);

      if (distRes) setDistribution(distRes);
      if (trendRes) setTrends(trendRes);
    } catch (err) {
      console.error("Failed to load analytics details:", err);
    } finally {
      setIsLoadingTrends(false);
    }
  }, [filters.dateRange, filters.customStart, filters.customEnd, filters.campaignId, trendMetric]);

  const loadLeads = useCallback(async () => {
    setIsLoadingLeads(true);
    try {
      const params = new URLSearchParams({
        page: leadsPage.toString(),
        page_size: leadsPageSize.toString(),
        sort_by: leadsSortBy,
        sort_order: leadsSortOrder,
      });

      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.dateRange !== "all") params.set("date_range", filters.dateRange);
      if (filters.customStart) params.set("custom_start", filters.customStart);
      if (filters.customEnd) params.set("custom_end", filters.customEnd);
      if (filters.campaignId !== "all") params.set("campaign_id", filters.campaignId);
      if (filters.outcome !== "all") params.set("outcome", filters.outcome);
      if (filters.interestLevel !== "all") params.set("interest_level", filters.interestLevel);
      if (filters.agentId !== "all") params.set("agent_id", filters.agentId);
      if (filters.prospectStatus !== "all") params.set("prospect_status", filters.prospectStatus);
      if (filters.followUp !== "all") params.set("follow_up", filters.followUp);

      if (filters.scoreRange === "81_100") {
        params.set("min_score", "81");
        params.set("max_score", "100");
      } else if (filters.scoreRange === "61_80") {
        params.set("min_score", "61");
        params.set("max_score", "80");
      } else if (filters.scoreRange === "31_60") {
        params.set("min_score", "31");
        params.set("max_score", "60");
      } else if (filters.scoreRange === "0_30") {
        params.set("min_score", "0");
        params.set("max_score", "30");
      }

      params.set("only_high_value", filters.outcome !== "all" ? "false" : "true");

      const res = await fetchApi<LeadListPaginationResponse>(`/lead-intelligence/leads?${params.toString()}`);
      if (res) {
        setLeads(res.items || []);
        setLeadsTotal(res.total || 0);
        setLeadsTotalPages(res.total_pages || 1);
      }
    } catch (err) {
      console.error("Failed to load leads list:", err);
    } finally {
      setIsLoadingLeads(false);
    }
  }, [
    leadsPage,
    leadsPageSize,
    leadsSortBy,
    leadsSortOrder,
    filters.search,
    filters.dateRange,
    filters.customStart,
    filters.customEnd,
    filters.campaignId,
    filters.outcome,
    filters.interestLevel,
    filters.scoreRange,
    filters.agentId,
    filters.prospectStatus,
    filters.followUp,
  ]);

  const loadCallbacks = useCallback(async () => {
    setIsLoadingCallbacks(true);
    try {
      const params = new URLSearchParams({
        page: callbacksPage.toString(),
        page_size: "20",
      });
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.campaignId !== "all") params.set("campaign_id", filters.campaignId);

      const res = await fetchApi<CallbackListPaginationResponse>(`/lead-intelligence/callbacks?${params.toString()}`);
      if (res) {
        setCallbacks(res.items || []);
        setCallbacksTotal(res.total || 0);
        setCallbacksTotalPages(res.total_pages || 1);
      }
    } catch (err) {
      console.error("Failed to load callbacks:", err);
    } finally {
      setIsLoadingCallbacks(false);
    }
  }, [callbacksPage, filters.search, filters.campaignId]);

  // Initial and reactive load: Summary is always loaded
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Load Leads only when on 'leads' tab
  useEffect(() => {
    if (activeTab === "leads") {
      loadLeads();
    }
  }, [activeTab, loadLeads]);

  // Load Analytics only when on 'analytics' tab
  useEffect(() => {
    if (activeTab === "analytics") {
      loadAnalyticsDetails();
    }
  }, [activeTab, loadAnalyticsDetails]);

  // Load Callbacks only when on 'callbacks' tab
  useEffect(() => {
    if (activeTab === "callbacks") {
      loadCallbacks();
    }
  }, [activeTab, loadCallbacks]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const promises: Promise<any>[] = [loadSummary()];
      if (activeTab === "leads") promises.push(loadLeads());
      if (activeTab === "analytics") promises.push(loadAnalyticsDetails());
      if (activeTab === "callbacks") promises.push(loadCallbacks());
      await Promise.all(promises);
      toast.success("Lead intelligence synchronized.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // -------------------------------------------------------------
  // Real-Time WebSocket Telemetry
  // -------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    const orgId = user.organization_id || "default";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/voice/telemetry/org_${orgId}`;

    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsWsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data: VoiceTelemetryEvent = JSON.parse(event.data);
          if (data.event_type === "CallEnded" || data.event_type === "LeadIntelligenceUpdated") {
            const outcome = data.payload?.business_outcome || data.payload?.outcome || "";
            const leadScore = data.payload?.lead_score || 0;
            const prospectName = data.payload?.prospect_name || data.payload?.customer_name || "A prospective lead";
            const campaignName = data.payload?.campaign_name || "an active campaign";

            // If valuable outcome, notify user
            if (
              outcome.toLowerCase().includes("interested") ||
              outcome.toLowerCase().includes("callback") ||
              outcome.toLowerCase().includes("qualified") ||
              leadScore >= 70
            ) {
              toast.success(`New Lead Detected: ${prospectName}`, {
                description: `${outcome} from ${campaignName} (Lead Score: ${leadScore}/100)`,
                action: {
                  label: "View Lead",
                  onClick: () => {
                    if (data.payload?.prospect_id) {
                      setSelectedProspectId(data.payload.prospect_id);
                      setIsDrawerOpen(true);
                    }
                  },
                },
              });
            }

            // Silently refresh data
            loadSummary();
            if (activeTab === "analytics") loadAnalyticsDetails();
            loadLeads();
            if (activeTab === "callbacks") loadCallbacks();
          }
        } catch (e) {
          console.error("Error parsing telemetry event:", e);
        }
      };

      socket.onclose = () => {
        setIsWsConnected(false);
      };

      socket.onerror = () => {
        setIsWsConnected(false);
      };
    } catch (err) {
      console.warn("WebSocket could not connect:", err);
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [user, loadSummary, loadAnalyticsDetails, loadLeads, loadCallbacks, activeTab]);

  // -------------------------------------------------------------
  // Filter Handlers
  // -------------------------------------------------------------
  const handleFilterChange = (newPartial: Partial<LeadFilterState>) => {
    setFilters((prev) => ({ ...prev, ...newPartial }));
    setLeadsPage(1);
    setCallbacksPage(1);
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setLeadsPage(1);
    setCallbacksPage(1);
  };

  const handleSelectOutcomeFilter = (outcome: string) => {
    handleFilterChange({ outcome });
    if (activeTab !== "leads") setActiveTab("leads");
  };

  const handleSelectCampaign = (campaignId: string) => {
    handleFilterChange({ campaignId });
    if (activeTab !== "leads") setActiveTab("leads");
  };

  const handleSelectAgent = (agentId: string) => {
    handleFilterChange({ agentId });
    if (activeTab !== "leads") setActiveTab("leads");
  };

  // -------------------------------------------------------------
  // Export CSV
  // -------------------------------------------------------------
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.dateRange !== "all") params.set("date_range", filters.dateRange);
      if (filters.customStart) params.set("custom_start", filters.customStart);
      if (filters.customEnd) params.set("custom_end", filters.customEnd);
      if (filters.campaignId !== "all") params.set("campaign_id", filters.campaignId);
      if (filters.outcome !== "all") params.set("outcome", filters.outcome);
      if (filters.interestLevel !== "all") params.set("interest_level", filters.interestLevel);
      if (filters.agentId !== "all") params.set("agent_id", filters.agentId);
      if (filters.prospectStatus !== "all") params.set("prospect_status", filters.prospectStatus);
      if (filters.followUp !== "all") params.set("follow_up", filters.followUp);

      const resp = await fetch(`/api/v1/lead-intelligence/export?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!resp.ok) throw new Error("Export failed");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lead_intelligence_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Lead intelligence exported to CSV.");
    } catch (err) {
      toast.error("Failed to export CSV.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5 text-left animate-in fade-in-50 duration-200">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[var(--color-heading)] tracking-tight">
                Lead Intelligence
              </h1>
              <p className="text-xs text-[var(--color-muted)]">
                Organization-wide command center for interested prospects, callback requests, and AI conversation outcomes.
              </p>
            </div>
          </div>
        </div>

        {/* Status Indicators & Refresh */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] text-[var(--color-muted)]">
            <Radio className={`w-3 h-3 ${isWsConnected ? "text-emerald-500 animate-pulse" : "text-[var(--color-muted)]"}`} />
            <span>{isWsConnected ? "Live Telemetry Active" : "Polling Sync"}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />}
            className="cursor-pointer font-medium"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* TOP KPI SECTION (Always visible) */}
      <LeadKpiSection
        summary={summary}
        isLoading={isLoadingSummary}
        selectedOutcomeFilter={filters.outcome}
        onSelectOutcomeFilter={handleSelectOutcomeFilter}
      />

      {/* Navigation View Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pt-1">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("leads")}
            className={`py-2 px-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "leads"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>All Interested Leads ({leadsTotal})</span>
          </button>

          <button
            onClick={() => setActiveTab("callbacks")}
            className={`py-2 px-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "callbacks"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <PhoneForwarded className="w-3.5 h-3.5 text-purple-500" />
            <span>Callback Requests ({summary?.callback_requested || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`py-2 px-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "analytics"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Campaign Analytics & Trends</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ALL INTERESTED LEADS */}
      {activeTab === "leads" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <LeadFilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            campaigns={campaigns}
            agents={agents}
            onExportCsv={handleExportCsv}
            isExporting={isExporting}
          />

          {/* Main Lead Table */}
          <LeadTable
            leads={leads}
            total={leadsTotal}
            page={leadsPage}
            pageSize={leadsPageSize}
            totalPages={leadsTotalPages}
            isLoading={isLoadingLeads}
            sortBy={leadsSortBy}
            sortOrder={leadsSortOrder}
            onSortChange={(field) => {
              if (leadsSortBy === field) {
                setLeadsSortOrder(leadsSortOrder === "desc" ? "asc" : "desc");
              } else {
                setLeadsSortBy(field);
                setLeadsSortOrder("desc");
              }
            }}
            onPageChange={(p) => setLeadsPage(p)}
            onSelectLead={(lead) => {
              setSelectedProspectId(lead.prospect_id);
              setIsDrawerOpen(true);
            }}
            onResetFilters={handleResetFilters}
          />
        </div>
      )}

      {/* TAB 2: CALLBACK REQUESTS */}
      {activeTab === "callbacks" && (
        <div className="space-y-4">
          <CallbackRequestsView
            callbacks={callbacks}
            total={callbacksTotal}
            page={callbacksPage}
            pageSize={20}
            totalPages={callbacksTotalPages}
            isLoading={isLoadingCallbacks}
            onPageChange={(p) => setCallbacksPage(p)}
            onSelectProspect={(pid) => {
              setSelectedProspectId(pid);
              setIsDrawerOpen(true);
            }}
          />
        </div>
      )}

      {/* TAB 3: ANALYTICS, CHARTS & CAMPAIGN PERFORMANCE */}
      {activeTab === "analytics" && (
        <div className="space-y-5">
          {/* Main Lead Trends Chart */}
          <LeadTrendsChart
            trends={trends}
            isLoading={isLoadingTrends}
            activeMetric={trendMetric}
            onMetricChange={(m) => setTrendMetric(m)}
          />

          {/* Two-Column Analytics: Outcome Distribution & AI Agent Performance */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <LeadOutcomeDistribution
              data={distribution}
              isLoading={isLoadingSummary}
              selectedOutcomeFilter={filters.outcome}
              onSelectOutcomeFilter={handleSelectOutcomeFilter}
            />

            <AgentPerformanceSection
              agents={agents}
              isLoading={isLoadingSummary}
              selectedAgentId={filters.agentId}
              onSelectAgent={handleSelectAgent}
            />
          </div>

          {/* Leads by Campaign Performance Section */}
          <CampaignPerformanceSection
            campaigns={campaigns}
            isLoading={isLoadingSummary}
            selectedCampaignId={filters.campaignId}
            onSelectCampaign={handleSelectCampaign}
          />
        </div>
      )}

      {/* Lead Detail Drawer Modal */}
      <LeadDetailDrawer
        prospectId={selectedProspectId}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedProspectId(null);
        }}
        onLeadUpdated={() => {
          loadSummary();
          if (activeTab === "analytics") loadAnalyticsDetails();
          loadLeads();
          if (activeTab === "callbacks") loadCallbacks();
        }}
      />
    </div>
  );
}

export default LeadIntelligenceView;
