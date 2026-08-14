import React, { useState } from "react";
import { OrganizationThemeConfig } from "../../types";
import {
  PhoneCall,
  Activity,
  Settings,
  ShieldCheck,
  PhoneOutgoing,
  CheckCircle2,
  TrendingUp,
  Clock,
  User,
  Users,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./Table";

export const ThemePreview: React.FC<{ theme: OrganizationThemeConfig }> = ({ theme }) => {
  const [activeTab, setActiveTab] = useState<"overview" | "calls">("overview");

  return (
    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden text-slate-900 dark:text-slate-100 transition-all">
      {/* Mock Browser Header Bar */}
      <div className="bg-slate-100 dark:bg-slate-900 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
          </div>
          <span className="text-[11px] font-mono text-slate-500 ml-2">
            https://app.desireai.com/preview
          </span>
        </div>
        <Badge variant="primary" size="sm">
          Live Interactive Theme Preview
        </Badge>
      </div>

      {/* Mock Application Frame */}
      <div className="flex min-h-[520px] bg-slate-50 dark:bg-slate-950">
        {/* Mock Sidebar */}
        <aside className="w-48 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between shrink-0 hidden sm:flex">
          <div className="space-y-4">
            {/* Mock Brand */}
            <div className="flex items-center gap-2.5">
              {theme.identity.logo_url ? (
                <img
                  src={theme.identity.logo_url}
                  alt="Logo"
                  className="w-7 h-7 rounded-lg object-contain"
                />
              ) : (
                <div
                  style={{ backgroundColor: theme.colors.primary }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-xs"
                >
                  <PhoneCall className="w-4 h-4" />
                </div>
              )}
              <div className="font-bold text-xs tracking-tight truncate">
                {theme.identity.org_name || "Desire AI"}
              </div>
            </div>

            {/* Mock Nav Items */}
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab("overview")}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "overview"
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={() => setActiveTab("calls")}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "calls"
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <PhoneOutgoing className="w-3.5 h-3.5" />
                <span>Call Logs</span>
              </button>
              <div className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 cursor-not-allowed">
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </div>
            </nav>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[11px] text-slate-500">
            <User className="w-3.5 h-3.5" />
            <span className="truncate">admin@desireai.com</span>
          </div>
        </aside>

        {/* Mock Main Content Area */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[580px]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {activeTab === "overview" ? "Voice Agent Dashboard" : "Outbound Call Intelligence"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time multi-agent activity under {theme.identity.org_name}
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
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Total Calls
                  </div>
                  <div className="text-xl font-bold mt-0.5">1,248</div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold mt-1">
                    <TrendingUp className="w-3 h-3" /> +18.4% this week
                  </div>
                </div>
                <div
                  style={{ backgroundColor: `${theme.colors.primary}15`, color: theme.colors.primary }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                >
                  <Activity className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card hoverable>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Success Rate
                  </div>
                  <div className="text-xl font-bold mt-0.5">99.4%</div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold mt-1">
                    <CheckCircle2 className="w-3 h-3" /> WebRTC Connected
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card hoverable>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Avg Duration
                  </div>
                  <div className="text-xl font-bold mt-0.5">3m 42s</div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold mt-1">
                    <Clock className="w-3 h-3" /> Real-time Opus Codec
                  </div>
                </div>
                <div
                  style={{ backgroundColor: `${theme.colors.secondary}15`, color: theme.colors.secondary }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                >
                  <Clock className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Interactive Form & Call Logs Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Quick Dispatch Card */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs">Quick Agent Dispatch</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Destination Phone Number
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value="+1 (555) 382-9012"
                      className="w-full ui-input text-xs px-3 py-2 border rounded-lg bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    AI Conversation Goal
                  </label>
                  <textarea
                    readOnly
                    rows={2}
                    value="Qualify inbound customer lead and confirm enterprise SaaS demo schedule."
                    className="w-full ui-input text-xs p-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 resize-none"
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
              <CardHeader className="py-3 px-4 flex justify-between items-center">
                <CardTitle className="text-xs">Recent Session History</CardTitle>
                <Badge variant="success" size="sm" dot>
                  Live Stream
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="py-2 text-[10px]">Recipient</TableHead>
                      <TableHead className="py-2 text-[10px]">Status</TableHead>
                      <TableHead className="py-2 text-[10px]">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="py-2.5 text-xs font-mono font-medium">
                        +1 (800) 452-1920
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="success" size="sm">
                          Completed
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs">4m 12s</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2.5 text-xs font-mono font-medium">
                        +1 (415) 890-3321
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="primary" size="sm" dot>
                          In Progress
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs">1m 45s</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2.5 text-xs font-mono font-medium">
                        +1 (312) 555-0199
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="neutral" size="sm">
                          Queued
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs">0s</TableCell>
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
