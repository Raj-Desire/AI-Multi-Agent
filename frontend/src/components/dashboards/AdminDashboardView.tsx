import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  PhoneCall,
  DollarSign,
  TrendingUp,
  Bot,
  BrainCircuit,
  PhoneForwarded,
  ArrowRight,
  PieChart,
  RefreshCw,
  Megaphone,
  UserCheck,
  Search,
  Filter,
  PhoneOutgoing,
  Clock,
  ExternalLink
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { fetchApi, invalidateApiCache, LIVE } from "../../api-client";
import {
  LeadKPISummary,
  LeadOutcomeDistributionResponse,
  AgentConfig,
  Campaign,
  CallRecord
} from "../../types";

export const AdminDashboardView: React.FC<{
  onNavigateTab?: (tab: string) => void;
  onStartDialer?: (phoneNumber: string) => void;
}> = ({ onNavigateTab, onStartDialer }) => {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("all");
  const [summary, setSummary] = useState<LeadKPISummary | null>(null);
  const [distribution, setDistribution] = useState<LeadOutcomeDistributionResponse | null>(null);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignCalls, setCampaignCalls] = useState<CallRecord[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async (forceBypassCache: boolean = false) => {
    try {
      if (forceBypassCache) {
        invalidateApiCache("/lead-intelligence");
        invalidateApiCache("/agents");
        invalidateApiCache("/campaigns");
        invalidateApiCache("/calls");
      }
      setLoading(true);

      const requestOpts = forceBypassCache ? { cache: "reload" as RequestCache } : LIVE;

      // Fires with LIVE request options to ensure real-time telemetry from Cosmos DB
      const [summaryRes, distRes, agentsRes, campaignsRes, callsRes] = await Promise.all([
        fetchApi<any>(`/lead-intelligence/summary?date_range=${timeRange}`, requestOpts).catch(() => null),
        fetchApi<any>(`/lead-intelligence/distribution?date_range=${timeRange}`, requestOpts).catch(() => null),
        fetchApi<any>("/agents", requestOpts).catch(() => null),
        fetchApi<any>("/campaigns?page=1&page_size=50", requestOpts).catch(() => null),
        fetchApi<any>("/calls", requestOpts).catch(() => null),
      ]);

      const resolvedSummary = summaryRes?.data ?? summaryRes;
      if (resolvedSummary && typeof resolvedSummary === "object") setSummary(resolvedSummary);

      const resolvedDist = distRes?.data ?? distRes;
      if (resolvedDist && typeof resolvedDist === "object") setDistribution(resolvedDist);

      const resolvedAgents = Array.isArray(agentsRes) ? agentsRes : agentsRes?.data;
      if (Array.isArray(resolvedAgents)) setAgents(resolvedAgents);

      const resolvedCampaigns = Array.isArray(campaignsRes?.items)
        ? campaignsRes.items
        : Array.isArray(campaignsRes?.data?.items)
        ? campaignsRes.data.items
        : Array.isArray(campaignsRes)
        ? campaignsRes
        : [];
      if (resolvedCampaigns.length > 0) setCampaigns(resolvedCampaigns);

      const resolvedCalls = Array.isArray(callsRes)
        ? callsRes
        : Array.isArray(callsRes?.data)
        ? callsRes.data
        : [];
      setCampaignCalls(resolvedCalls);
    } catch (err) {
      console.error("Failed to load dashboard data from DB:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [timeRange]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(true);
  };

  const totalLeads = summary?.total_leads ?? 0;
  const interested = summary?.interested ?? 0;
  const callbacks = summary?.callback_requested ?? 0;
  const followUps = summary?.needs_follow_up ?? 0;
  const avgDuration = summary?.avg_call_duration_seconds ?? 0;

  // Active receptionist agent from DB
  const primaryAgent = agents.find((a) => a.status === "ACTIVE") || agents[0];

  // Filter campaign calls by selected campaign and search
  const filteredCalls = campaignCalls.filter((c) => {
    const matchesCampaign =
      selectedCampaignId === "all"
        ? true
        : selectedCampaignId === "unassigned"
        ? !c.campaign_id
        : c.campaign_id === selectedCampaignId;

    const matchesSearch =
      !searchQuery ||
      (c.to_number && c.to_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.from_number && c.from_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.intent && c.intent.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.summary && c.summary.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCampaign && matchesSearch;
  });

  const formatDuration = (secs: number) => {
    if (!secs || secs <= 0) return "0s";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  };

  // Helper map for campaign names
  const campaignNameMap = new Map<string, string>();
  campaigns.forEach((cmp) => campaignNameMap.set(cmp.id, cmp.name));

  return (
    <div className="space-y-4">
      {/* Time Range Filter Bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-xs h-8 gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs">
          <button
            onClick={() => setTimeRange("7d")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              timeRange === "7d" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeRange("30d")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              timeRange === "30d" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTimeRange("all")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              timeRange === "all" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Total Handled Calls</span>
              <PhoneCall className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? "..." : totalLeads.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">recorded</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Avg duration: {avgDuration > 0 ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` : "0s"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Interested / Converted</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? "..." : interested}
              </span>
              <span className="text-xs text-emerald-500 font-semibold">
                {totalLeads > 0 ? `${((interested / totalLeads) * 100).toFixed(1)}%` : "0%"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">High-intent caller positive outcomes</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Requested Callbacks</span>
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? "..." : callbacks}
              </span>
              <span className="text-xs text-muted-foreground">in database</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Scheduled directly from voice calls</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Needs Follow-up</span>
              <DollarSign className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? "..." : followUps}
              </span>
              <span className="text-xs text-amber-500 font-semibold">Triage</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Questions or quotes pending action</p>
          </CardContent>
        </Card>
      </div>

      {/* Middle Grid: Outcome Distribution & Fleet Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live Outcome Distribution */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PieChart className="w-4 h-4 text-primary" />
                Live Conversational Outcome Distribution
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary gap-1"
                onClick={() => onNavigateTab && onNavigateTab("lead_intelligence")}
              >
                Lead Intelligence <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {distribution && distribution.distribution && distribution.distribution.length > 0 ? (
              distribution.distribution.map((dist, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-foreground">{dist.outcome}</span>
                    <span className="font-semibold text-foreground">
                      {dist.count} calls ({dist.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, dist.percentage)}%`,
                        backgroundColor: dist.color_hint || "var(--color-primary)"
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-muted-foreground">
                {loading ? "Analyzing database call outcomes..." : "No calls analyzed in this timeframe"}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fleet & Knowledge Status from DB */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              AI Receptionist & Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {primaryAgent ? (
              <div className="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground">{primaryAgent.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Role: {primaryAgent.role || "Receptionist"} &bull; v{primaryAgent.version || 1}
                  </div>
                </div>
                <Badge variant={primaryAgent.status === "ACTIVE" ? "success" : "neutral"} size="sm">
                  {primaryAgent.status || "DRAFT"}
                </Badge>
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-border bg-muted/40 text-center text-xs text-muted-foreground">
                No voice agent configured yet
              </div>
            )}

            <div className="space-y-2 pt-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <BrainCircuit className="w-3.5 h-3.5 text-primary" />
                  Fleet Agents in DB
                </span>
                <span className="font-semibold text-foreground">{agents.length} configured</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-blue-500" />
                  Active Campaigns
                </span>
                <span className="font-semibold text-foreground">{campaigns.length} campaigns</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <PhoneForwarded className="w-3.5 h-3.5 text-amber-500" />
                  Total Live Calls Handled
                </span>
                <span className="font-semibold text-emerald-500">{totalLeads}</span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs mt-1"
              onClick={() => onNavigateTab && onNavigateTab("voice_agent")}
            >
              Configure Agent Persona
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* User Campaign Call History Section */}
      <Card className="border-border">
        <CardHeader className="py-3 px-4 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-primary" />
                User Campaign Call History
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time call logs across all user campaigns, duration, AI summaries, and caller intent.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Campaign Filter Dropdown */}
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="text-xs rounded-md border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              >
                <option value="all">All Campaigns ({campaignCalls.length} calls)</option>
                {campaigns.map((cmp) => (
                  <option key={cmp.id} value={cmp.id}>
                    {cmp.name}
                  </option>
                ))}
                <option value="unassigned">Direct / Inbound Calls</option>
              </select>

              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search phone or intent..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs pl-8 pr-2.5 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground w-48 sm:w-56"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase tracking-wider font-semibold bg-muted/30">
                  <th className="py-2.5 px-4">Contact / Phone</th>
                  <th className="py-2.5 px-4">Campaign</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Duration</th>
                  <th className="py-2.5 px-4">Detected Intent</th>
                  <th className="py-2.5 px-4">AI Summary</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCalls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      {loading ? "Loading database campaign call logs..." : "No campaign calls matching your filter"}
                    </td>
                  </tr>
                ) : (
                  filteredCalls.slice(0, 50).map((call) => {
                    const campaignName = call.campaign_id ? (campaignNameMap.get(call.campaign_id) || call.campaign_id) : "Direct Inbound";
                    const displayContact = call.to_number || call.from_number || "Caller";

                    return (
                      <tr key={call.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">
                          <div className="flex items-center gap-1.5">
                            <PhoneCall className="w-3 h-3 text-muted-foreground" />
                            <span>{displayContact}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{call.id}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={call.campaign_id ? "primary" : "outline"} size="sm">
                            {campaignName}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={call.status === "completed" ? "success" : call.status === "busy" ? "warning" : "neutral"}
                            size="sm"
                          >
                            {call.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {formatDuration(call.duration || 0)}
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">
                          {call.intent || "General"}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground max-w-xs truncate" title={call.summary || ""}>
                          {call.summary || (call.prompt ? `Prompt: ${call.prompt.slice(0, 60)}...` : "—")}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary gap-1"
                            onClick={() => onStartDialer && onStartDialer(call.to_number || call.from_number || "")}
                          >
                            <PhoneOutgoing className="w-3 h-3" />
                            Dial
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
