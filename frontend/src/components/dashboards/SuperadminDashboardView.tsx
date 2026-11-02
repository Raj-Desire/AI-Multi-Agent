import React, { useState, useEffect } from "react";
import {
  Server,
  Zap,
  TrendingUp,
  PhoneCall,
  Activity,
  Coins,
  ArrowUpRight,
  RefreshCw,
  Building2
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { fetchApi, invalidateApiCache } from "../../api-client";

interface SuperadminUsageTelemetry {
  summary: {
    total_organizations: number;
    total_calls: number;
    total_duration_minutes: number;
    total_tokens: number;
    total_infrastructure_cost: number;
    suggested_client_revenue: number;
    projected_gross_profit: number;
    gross_margin_percentage: number;
    cost_by_service?: {
      telephony: number;
      stt: number;
      llm: number;
      tts: number;
    };
  };
  organizations: Array<{
    organization_id: string;
    org_name: string;
    is_active: boolean;
    total_calls: number;
    completed_calls: number;
    failed_calls: number;
    duration_seconds: number;
    billed_minutes: number;
    total_tokens: number;
    total_cost: number;
    suggested_billed: number;
    margin: number;
    user_count?: number;
    admin_count?: number;
    total_members?: number;
    total_campaigns?: number;
    total_agents?: number;
    created_at?: string;
  }>;
}

export const SuperadminDashboardView: React.FC<{ onNavigateTenant?: (orgId: string) => void }> = ({ onNavigateTenant }) => {
  const [telemetry, setTelemetry] = useState<SuperadminUsageTelemetry | null>(null);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "—";
    }
  };
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async (forceBypassCache: boolean = false) => {
    try {
      if (forceBypassCache) {
        invalidateApiCache("/superadmin/usage-cost-breakdown");
      }
      setLoading(true);
      // Reads from fast client in-memory cache with 60s TTL; deduplicates in-flight calls
      const data = await fetchApi<SuperadminUsageTelemetry>(
        "/superadmin/usage-cost-breakdown?time_range=all",
        forceBypassCache ? { cache: "reload" } : undefined
      );
      setTelemetry(data);
    } catch (err) {
      console.error("Failed to load superadmin usage breakdown from database:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(true);
  };

  const summary = telemetry?.summary;
  const orgs = telemetry?.organizations || [];

  return (
    <div className="space-y-4">
      {/* KPI Cards (Clean numbers straight from Database Telemetry) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Total Platform Calls</span>
              <PhoneCall className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? "..." : (summary?.total_calls ?? 0).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">in database</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {summary?.total_duration_minutes ? `${summary.total_duration_minutes.toFixed(1)} billed mins` : "Real-time records"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Platform Gross Margin</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? "..." : `${(summary?.gross_margin_percentage ?? 0).toFixed(1)}%`}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {summary ? `Net profit: $${summary.projected_gross_profit.toFixed(2)}` : "Across all tenants"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Active Organizations</span>
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? "..." : (summary?.total_organizations ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground">registered</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Multi-tenant accounts in DB</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Billed Revenue / COGS</span>
              <Coins className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? "..." : `$${(summary?.suggested_client_revenue ?? 0).toFixed(2)}`}
              </span>
              <span className="text-xs text-muted-foreground">
                (${summary ? summary.total_infrastructure_cost.toFixed(2) : "0"} COGS)
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Tokens: {summary?.total_tokens?.toLocaleString() ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Middle Grid: Live Cost by Subsystem from DB */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                Infrastructure Cost Allocation by Subsystem
              </span>
              <span className="text-xs font-normal text-muted-foreground">Database Aggregation</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-foreground">Telephony Carrier Routing</span>
                <span className="font-semibold text-foreground">
                  ${summary?.cost_by_service?.telephony?.toFixed(4) ?? "0.0000"}
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full"
                  style={{
                    width: summary && summary.total_infrastructure_cost > 0
                      ? `${Math.min(100, ((summary.cost_by_service?.telephony || 0) / summary.total_infrastructure_cost) * 100)}%`
                      : "0%"
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-foreground">Speech-to-Text Transcription</span>
                <span className="font-semibold text-foreground">
                  ${summary?.cost_by_service?.stt?.toFixed(4) ?? "0.0000"}
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{
                    width: summary && summary.total_infrastructure_cost > 0
                      ? `${Math.min(100, ((summary.cost_by_service?.stt || 0) / summary.total_infrastructure_cost) * 100)}%`
                      : "0%"
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-foreground">Spoken Voice Synthesis (TTS)</span>
                <span className="font-semibold text-foreground">
                  ${summary?.cost_by_service?.tts?.toFixed(4) ?? "0.0000"}
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full"
                  style={{
                    width: summary && summary.total_infrastructure_cost > 0
                      ? `${Math.min(100, ((summary.cost_by_service?.tts || 0) / summary.total_infrastructure_cost) * 100)}%`
                      : "0%"
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-foreground">LLM Conversational Tokens</span>
                <span className="font-semibold text-foreground">
                  ${summary?.cost_by_service?.llm?.toFixed(4) ?? "0.0000"}
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full"
                  style={{
                    width: summary && summary.total_infrastructure_cost > 0
                      ? `${Math.min(100, ((summary.cost_by_service?.llm || 0) / summary.total_infrastructure_cost) * 100)}%`
                      : "0%"
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Sentinel Card */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              Engine & Token Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="p-3 rounded-md bg-muted/40 border border-border text-xs space-y-1">
              <div className="font-semibold text-foreground flex items-center justify-between">
                <span>Total Tokens Processed</span>
                <span className="text-primary font-mono">{summary?.total_tokens?.toLocaleString() ?? 0}</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Calculated across input and output conversational sessions.
              </p>
            </div>

            <div className="p-3 rounded-md bg-muted/40 border border-border text-xs space-y-1">
              <div className="font-semibold text-foreground flex items-center justify-between">
                <span>Carrier State</span>
                <span className="text-emerald-500 font-medium">Ready</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                SIP Gateway connected and active.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Real Tenants Table from Database */}
      <Card className="border-border">
        <CardHeader className="py-3 px-4 border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Tenant Portfolio (Live Database Records)</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="text-xs h-7 px-2.5 gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase tracking-wider font-semibold bg-muted/30">
                  <th className="py-2.5 px-4">Organization</th>
                  <th className="py-2.5 px-4">Created Date</th>
                  <th className="py-2.5 px-4">Campaigns Run</th>
                  <th className="py-2.5 px-4">Agents Created</th>
                  <th className="py-2.5 px-4">Users Created</th>
                  <th className="py-2.5 px-4">Completed Calls</th>
                  <th className="py-2.5 px-4">Total Call Minutes</th>
                  <th className="py-2.5 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orgs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      {loading ? "Loading database records..." : "No organizations found in database"}
                    </td>
                  </tr>
                ) : (
                  orgs.map((o) => (
                    <tr key={o.organization_id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-foreground">
                        <div>{o.org_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{o.organization_id}</div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                        {formatDate(o.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="primary" size="sm">
                          {(o.total_campaigns ?? 0)} campaigns
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" size="sm">
                          {(o.total_agents ?? 0)} agents
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{(o.total_members ?? o.user_count ?? 0)} members</span>
                          <span className="text-[10px] text-muted-foreground">({o.user_count ?? 0} users)</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {o.completed_calls} calls
                      </td>
                      <td className="py-3 px-4 font-mono text-foreground font-medium">
                        {o.billed_minutes ?? Math.ceil(o.duration_seconds / 60)} mins
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onNavigateTenant && onNavigateTenant(o.organization_id)}
                          className="h-7 px-2 text-xs text-primary"
                        >
                          Inspect <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
