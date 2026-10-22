import React, { useState } from "react";
import { OrganizationThemeConfig } from "../../types";
import { getThemeCssVariables } from "../../utils/themeUtils";
import {
  PhoneCall,
  PhoneOutgoing,
  Bot,
  Megaphone,
  Users,
  Building2,
  Coins,
  ShieldCheck,
  Activity,
  CheckCircle2,
  Sparkles,
  User,
  ArrowRight,
  TrendingUp,
  Clock,
  Mic,
  Database,
  Search,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { StatusIndicator } from "./StatusIndicator";

type PreviewSection =
  | "overview"
  | "dialer"
  | "agents"
  | "campaigns"
  | "prospects"
  | "knowledge"
  | "credits"
  | "team";

export const ThemePreview: React.FC<{ theme: OrganizationThemeConfig }> = ({ theme }) => {
  const [activeSection, setActiveSection] = useState<PreviewSection>("overview");
  const inlineThemeStyles = getThemeCssVariables(theme);

  const navItems: { id: PreviewSection; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "dialer", label: "AI Dialer", icon: <PhoneCall className="w-3.5 h-3.5" /> },
    { id: "agents", label: "Voice Agents", icon: <Bot className="w-3.5 h-3.5" /> },
    { id: "campaigns", label: "Campaigns", icon: <Megaphone className="w-3.5 h-3.5" /> },
    { id: "prospects", label: "Prospects", icon: <Users className="w-3.5 h-3.5" /> },
    { id: "knowledge", label: "Knowledge", icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: "credits", label: "Credits & Billing", icon: <Coins className="w-3.5 h-3.5" /> },
    { id: "team", label: "Team & Admin", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      style={inlineThemeStyles as React.CSSProperties}
      data-ui-style={theme.appearance.ui_style || "default"}
      className="w-full rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] shadow-sm overflow-hidden text-[var(--color-text)] bg-[var(--color-surface)] transition-all text-left"
    >
      {/* Mock Browser Header Bar */}
      <div className="bg-[var(--color-surface-muted)] px-3.5 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
          </div>
          <span className="text-[11px] font-mono text-[var(--color-muted)] ml-2">
            https://app.voiceplatform.io/{activeSection}
          </span>
        </div>
        <StatusIndicator status="active" label="Live Theme Engine" />
      </div>

      {/* Mock Application Shell */}
      <div className="flex min-h-[500px] bg-[var(--color-background)]">
        {/* Mock Sidebar */}
        <aside className="w-52 bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] border-r border-[var(--color-border)] p-3.5 flex flex-col justify-between shrink-0 hidden sm:flex">
          <div className="space-y-4">
            {/* Mock Brand Header */}
            <div className="flex items-center gap-2">
              {theme.identity.logo_url ? (
                <img
                  src={theme.identity.logo_url}
                  alt="Logo"
                  className="w-6 h-6 rounded object-contain border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
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
                {theme.identity.org_name || "AI Voice Platform"}
              </div>
            </div>

            {/* Mock Nav Items */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    style={{
                      backgroundColor: isActive ? "var(--color-primary-light)" : "transparent",
                      color: isActive ? "var(--color-primary)" : "inherit",
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] text-xs font-medium transition-colors cursor-pointer ${
                      isActive ? "font-semibold" : "hover:bg-[var(--color-surface-muted)]"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
            <User className="w-3.5 h-3.5" />
            <span className="truncate">admin@example.com</span>
          </div>
        </aside>

        {/* Mock Main Content Area */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[540px]">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-heading)] capitalize">
                {activeSection === "overview"
                  ? "Calling Console"
                  : activeSection === "credits"
                  ? "Usage & Credit Meters"
                  : `${activeSection} Hub`}
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Active tenant: {theme.identity.org_name || "AI Voice Platform"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">
                Export
              </Button>
              <Button size="sm" variant="primary" leftIcon={<Plus className="w-3 h-3" />}>
                Action
              </Button>
            </div>
          </div>

          {/* 1. OVERVIEW / CONSOLE */}
          {activeSection === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium text-[var(--color-muted)]">
                      Total Call Volume
                    </CardTitle>
                    <Activity className="w-4 h-4 text-[var(--color-primary)]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold text-[var(--color-heading)]">12,480</div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-600 font-medium">
                      <TrendingUp className="w-3 h-3" />
                      <span>+14.2% from last week</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium text-[var(--color-muted)]">
                      Lead Conversion Rate
                    </CardTitle>
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold text-[var(--color-heading)]">34.8%</div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-[var(--color-muted)]">
                      <span>4,342 qualified callers</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium text-[var(--color-muted)]">
                      Avg Latency
                    </CardTitle>
                    <Clock className="w-4 h-4 text-[var(--color-primary)]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold text-[var(--color-heading)]">480ms</div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-[var(--color-muted)]">
                      <span>Spoken Voice Engine</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="p-4 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--color-heading)]">Live Telephony Stream</span>
                  <Badge variant="primary" size="sm">Operational</Badge>
                </div>
                <p className="text-xs text-[var(--color-muted)]">
                  All automated outbound dialers and incoming receptionists are responding according to active brand guidelines.
                </p>
              </div>
            </div>
          )}

          {/* 2. AI DIALER */}
          {activeSection === "dialer" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3">
                <div className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
                  Dialpad & Dispatcher
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="h-10 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-heading)] font-semibold text-sm hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <Button variant="primary" className="w-full" leftIcon={<PhoneOutgoing className="w-4 h-4" />}>
                  Start Automated Call
                </Button>
              </div>

              <div className="p-4 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[var(--color-heading)]">Active Call Monitor</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="p-3 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border)] space-y-1">
                    <div className="text-xs font-medium text-[var(--color-heading)]">+1 (555) 349-2819</div>
                    <div className="text-[10px] text-[var(--color-muted)]">Connected • 01:24 duration</div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] text-[var(--color-muted)]">Audio Waveform (Voice Activity)</div>
                  <div className="h-8 flex items-center justify-between gap-1 px-2 rounded bg-[var(--color-surface-muted)]">
                    {[40, 70, 90, 60, 30, 80, 100, 45, 65, 85, 30, 50, 75, 95, 40].map((h, i) => (
                      <span
                        key={i}
                        style={{ height: `${h}%`, backgroundColor: "var(--color-primary)" }}
                        className="w-1.5 rounded-full transition-all"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. VOICE AGENTS */}
          {activeSection === "agents" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold text-xs">
                        VA
                      </div>
                      <span className="text-xs font-bold text-[var(--color-heading)]">Outbound Sales Closer</span>
                    </div>
                    <Badge variant="success" size="sm">Active</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    Configured with conversational turn-taking, dynamic barge-in, and qualification questions.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs">Configure</Button>
                    <Button size="sm" variant="primary" className="text-xs">Test Voice</Button>
                  </div>
                </div>

                <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold text-xs">
                        RC
                      </div>
                      <span className="text-xs font-bold text-[var(--color-heading)]">Front Desk Receptionist</span>
                    </div>
                    <Badge variant="default" size="sm">Standby</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    Answers incoming calls, schedules meetings, and transfers warm inquiries to account reps.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs">Configure</Button>
                    <Button size="sm" variant="secondary" className="text-xs">Preview Prompt</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. CAMPAIGNS & LEADS */}
          {activeSection === "campaigns" && (
            <div className="space-y-4">
              <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[var(--color-heading)]">Active Campaigns</h3>
                  <Badge variant="primary" size="sm">3 Live</Badge>
                </div>
                <div className="space-y-2.5">
                  <div className="p-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-[var(--color-heading)]">Q4 Enterprise Outbound</div>
                      <div className="text-[10px] text-[var(--color-muted)]">1,240 / 2,500 contacts reached (49.6%)</div>
                    </div>
                    <div className="h-2 w-28 rounded-full bg-[var(--color-border)] overflow-hidden">
                      <div style={{ width: "49.6%", backgroundColor: "var(--color-primary)" }} className="h-full rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. PROSPECTS & CONTACTS */}
          {activeSection === "prospects" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--color-heading)]">Prospects Directory</span>
                <span className="text-[var(--color-muted)]">4,820 Total</span>
              </div>
              <div className="overflow-hidden border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] text-[10px] text-[var(--color-muted)]">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Phone</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                    <tr>
                      <td className="p-2 font-medium text-[var(--color-heading)]">Sarah Jenkins</td>
                      <td className="p-2 font-mono text-[11px]">+1 (555) 234-9812</td>
                      <td className="p-2"><span className="text-emerald-600 font-semibold text-[10px]">Qualified</span></td>
                    </tr>
                    <tr>
                      <td className="p-2 font-medium text-[var(--color-heading)]">David Miller</td>
                      <td className="p-2 font-mono text-[11px]">+1 (555) 781-4560</td>
                      <td className="p-2"><span className="text-[var(--color-primary)] font-semibold text-[10px]">Callback</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. KNOWLEDGE BASE */}
          {activeSection === "knowledge" && (
            <div className="space-y-3">
              <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-heading)]">Business Profile Summary</span>
                  <Badge variant="primary" size="sm">Synchronized</Badge>
                </div>
                <p className="text-xs text-[var(--color-text)]">
                  Primary business details, FAQs, and pricing tiers ingested for real-time speech assistant generation.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="px-2 py-1 rounded-md text-[10px] bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium">
                    18 Q&amp;A Pairs
                  </span>
                  <span className="px-2 py-1 rounded-md text-[10px] bg-[var(--color-surface-muted)] text-[var(--color-heading)] font-medium border border-[var(--color-border)]">
                    Pricing Sheet v2.pdf
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 7. USAGE & CREDITS */}
          {activeSection === "credits" && (
            <div className="space-y-3">
              <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-[var(--color-muted)]">Voice Credit Balance</span>
                    <div className="text-2xl font-bold text-[var(--color-heading)]">1,420 mins</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-full border border-[var(--color-primary-ring)] bg-[var(--color-primary-light)] text-[var(--color-primary)] font-bold text-xs flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" />
                    <span>Healthy</span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--color-surface-muted)] overflow-hidden">
                  <div style={{ width: "71%", backgroundColor: "var(--color-primary)" }} className="h-full rounded-full" />
                </div>
              </div>
            </div>
          )}

          {/* 8. TEAM & ADMIN */}
          {activeSection === "team" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-heading)]">
                <span>Team Members</span>
                <Button size="sm" variant="primary" className="text-xs">Invite Member</Button>
              </div>
              <div className="p-3 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold text-xs">
                    JD
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--color-heading)]">John Doe</div>
                    <div className="text-[10px] text-[var(--color-muted)]">john@example.com</div>
                  </div>
                </div>
                <Badge variant="outline" size="sm">Workspace Admin</Badge>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
