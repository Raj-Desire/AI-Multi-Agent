import React, { useState } from "react";
import { OrganizationThemeConfig } from "../../types";
import {
  PhoneCall,
  PhoneOutgoing,
  TrendingUp,
  Clock,
  User,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { StatusIndicator } from "./StatusIndicator";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./Table";

export const ThemePreview: React.FC<{ theme: OrganizationThemeConfig }> = ({ theme }) => {
  const [activeTab, setActiveTab] = useState<"overview" | "calls">("overview");

  return (
    <div className="w-full rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] shadow-sm overflow-hidden text-[var(--color-text)] bg-[var(--color-surface)] transition-all text-left">
      {/* Mock Browser Header Bar */}
      <div className="bg-[var(--color-surface-muted)] px-3.5 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
          </div>
          <span className="text-[11px] font-mono text-[var(--color-muted)] ml-2">
            https://app.desireai.com/preview
          </span>
        </div>
        <StatusIndicator status="active" label="Live Theme Engine" />
      </div>

      {/* Mock Application Frame */}
      <div className="flex min-h-[480px] bg-[var(--color-background)]">
        {/* Mock Sidebar */}
        <aside className="w-48 bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] border-r border-[var(--color-border)] p-3.5 flex flex-col justify-between shrink-0 hidden sm:flex">
          <div className="space-y-4">
            {/* Mock Brand */}
            <div className="flex items-center gap-2">
              {theme.identity.logo_url ? (
                <img
                  src={theme.identity.logo_url}
                  alt="Logo"
                  className="w-6 h-6 rounded object-contain"
                />
              ) : (
                <div
                  style={{ backgroundColor: "var(--color-primary)" }}
                  className="w-6 h-6 rounded flex items-center justify-center text-white shadow-xs"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                </div>
              )}
              <div className="font-semibold text-xs tracking-tight truncate text-[var(--color-heading)]">
                {theme.identity.org_name || "Desire AI"}
              </div>
            </div>

            {/* Mock Nav Items */}
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab("overview")}
                style={{
                  backgroundColor: activeTab === "overview" ? "var(--color-primary-light)" : "transparent",
                  color: activeTab === "overview" ? "var(--color-primary)" : "inherit",
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] text-xs font-medium transition-colors"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Console</span>
              </button>
              <button
                onClick={() => setActiveTab("calls")}
                style={{
                  backgroundColor: activeTab === "calls" ? "var(--color-primary-light)" : "transparent",
                  color: activeTab === "calls" ? "var(--color-primary)" : "inherit",
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] text-xs font-medium transition-colors"
              >
                <PhoneOutgoing className="w-3.5 h-3.5" />
                <span>Call Logs</span>
              </button>
            </nav>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
            <User className="w-3 h-3" />
            <span className="truncate">admin@desireai.com</span>
          </div>
        </aside>

        {/* Mock Main Content Area */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[520px]">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-heading)]">
                {activeTab === "overview" ? "Calling Console" : "Call Intelligence"}
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Active tenant: {theme.identity.org_name || "Desire AI"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">
                Export
              </Button>
              <Button size="sm" variant="primary" leftIcon={<PhoneOutgoing className="w-3 h-3" />}>
                Launch Call
              </Button>
            </div>
          </div>

          {/* Metric Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card hoverable>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--color-muted)] font-medium">
                    Total Calls
                  </div>
                  <div className="text-lg font-semibold text-[var(--color-heading)] mt-0.5 font-mono">1,248</div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-1">
                    <TrendingUp className="w-3 h-3" /> +18.4% this week
                  </div>
                </div>
                <div
                  style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary)" }}
                  className="w-8 h-8 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center"
                >
                  <Activity className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            <Card hoverable>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--color-muted)] font-medium">
                    Success Rate
                  </div>
                  <div className="text-lg font-semibold text-[var(--color-heading)] mt-0.5 font-mono">99.4%</div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-1">
                    <ShieldCheck className="w-3 h-3" /> WebRTC Live
                  </div>
                </div>
                <div className="w-8 h-8 rounded-[var(--radius-main,0.375rem)] bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            <Card hoverable>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--color-muted)] font-medium">
                    Avg Duration
                  </div>
                  <div className="text-lg font-semibold text-[var(--color-heading)] mt-0.5 font-mono">3m 42s</div>
                  <div className="flex items-center gap-1 text-[10px] text-[var(--color-muted)] font-medium mt-1">
                    <Clock className="w-3 h-3" /> Opus Codec
                  </div>
                </div>
                <div
                  style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary)" }}
                  className="w-8 h-8 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center"
                >
                  <Clock className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Interactive Form & Call Logs Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Quick Dispatch Card */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-2.5 px-3.5">
                <CardTitle className="text-xs">Quick Agent Dispatch</CardTitle>
              </CardHeader>
              <CardContent className="p-3.5 space-y-2.5">
                <div>
                  <label className="text-xs font-medium text-[var(--color-heading)] block mb-1">
                    Destination Phone Number
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="+1 (555) 382-9012"
                    className="w-full h-8 text-xs font-mono px-2.5 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] text-[var(--color-heading)]"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="primary" className="flex-1">
                    Start Call
                  </Button>
                  <Button size="sm" variant="outline">
                    Schedule
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Sample Table Card */}
            <Card className="lg:col-span-3">
              <CardHeader className="py-2.5 px-3.5 flex justify-between items-center">
                <CardTitle className="text-xs">Recent Session History</CardTitle>
                <Badge variant="success" size="sm">Live</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="py-2 text-xs">Recipient</TableHead>
                      <TableHead className="py-2 text-xs">Status</TableHead>
                      <TableHead className="py-2 text-xs">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="py-2 text-xs font-mono font-medium">
                        +1 (800) 452-1920
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusIndicator status="completed" label="Completed" />
                      </TableCell>
                      <TableCell className="py-2 text-xs font-mono">4m 12s</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 text-xs font-mono font-medium">
                        +1 (415) 890-3321
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusIndicator status="active" label="In Progress" pulse />
                      </TableCell>
                      <TableCell className="py-2 text-xs font-mono">1m 45s</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
