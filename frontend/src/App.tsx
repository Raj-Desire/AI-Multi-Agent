import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { LoginPage } from "./components/LoginPage";
import { AdminPanel } from "./components/AdminPanel";
import { SuperAdminPanel } from "./components/SuperAdminPanel";
import { DashboardView } from "./components/DashboardView";
import { TwilioSettingsView } from "./components/TwilioSettingsView";
import { ThemeStudioView } from "./components/ThemeStudioView";
import { VoiceAgentView } from "./components/VoiceAgentView";
import { Sidebar, NavTab } from "./components/Sidebar";
import {
  Menu,
  PhoneCall,
  Bot,
  Sliders,
  Palette,
  Users,
  ShieldAlert,
  Wifi,
} from "lucide-react";

function MainContent() {
  const { user, isLoading, isAdmin, isSuperAdmin } = useAuth();
  const { draftTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            style={{
              borderColor: "var(--color-primary)",
              borderTopColor: "transparent",
            }}
            className="w-7 h-7 border-2 rounded-full animate-spin"
          />
          <span className="text-xs font-medium text-[var(--color-muted)]">Loading session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Guard tab access based on role
  let currentTab = activeTab;
  if (currentTab === "superadmin" && !isSuperAdmin) {
    currentTab = "dashboard";
  } else if ((currentTab === "admin" || currentTab === "theme" || currentTab === "twilio") && !isAdmin) {
    currentTab = "dashboard";
  }

  const getPageTitle = () => {
    switch (currentTab) {
      case "dashboard":
        return {
          title: "Calling Console",
          sub: "WebRTC Direct Dialing & Live AI Voice Sessions",
          icon: PhoneCall,
        };
      case "voice_agent":
        return {
          title: "AI Voice Agent Studio",
          sub: "Deepgram Real-Time Voice Agent configuration & live telemetry",
          icon: Bot,
        };
      case "twilio":
        return {
          title: "Phone & Voice",
          sub: "Twilio credentials, active numbers & call routing",
          icon: Sliders,
        };
      case "theme":
        return {
          title: "Theme Studio",
          sub: "White-label design tokens and UI architecture styles",
          icon: Palette,
        };
      case "admin":
        return {
          title: "Team Administration",
          sub: "Manage workspace members, roles & credentials",
          icon: Users,
        };
      case "superadmin":
        return {
          title: "Master Console",
          sub: "Multi-tenant root governance and platform telemetries",
          icon: ShieldAlert,
        };
      default:
        return {
          title: "Calling Console",
          sub: "Voice Calling Platform",
          icon: PhoneCall,
        };
    }
  };

  const pageMeta = getPageTitle();
  const HeaderIcon = pageMeta.icon;

  return (
    <div className="min-h-screen flex bg-[var(--color-background)] text-[var(--color-text)] transition-colors">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          activeTab={currentTab}
          onTabChange={(tab) => setActiveTab(tab)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 md:hidden flex"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            className="w-64 h-full bg-[var(--color-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar
              activeTab={currentTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setMobileSidebarOpen(false);
              }}
              collapsed={false}
            />
          </div>
        </div>
      )}

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Minimal Sticky Top Bar */}
        <header className="bg-[var(--color-surface)]/80 backdrop-blur-md border-b border-[var(--color-border)] px-4 sm:px-6 h-14 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="p-1.5 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-heading)] md:hidden cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Breadcrumb Header */}
            <div className="flex items-center gap-2">
              <HeaderIcon className="w-4 h-4 text-[var(--color-muted)] hidden sm:block" />
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                <span className="font-medium text-[var(--color-heading)]">{pageMeta.title}</span>
                <span className="opacity-40 hidden sm:inline">&bull;</span>
                <span className="hidden sm:inline text-[11px]">{pageMeta.sub}</span>
              </div>
            </div>
          </div>

          {/* Right Status Indicators */}
          <div className="flex items-center gap-2.5">
            {/* Tenant Organization */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
              <span>Org: <strong className="text-[var(--color-heading)] font-medium">{user.org_name || draftTheme.identity.org_name || "Desire AI"}</strong></span>
            </div>

            {/* Live WebRTC indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium">
              <Wifi className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">WebRTC Live</span>
            </div>
          </div>
        </header>

        {/* Dynamic Main View */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 transition-all text-left">
          {currentTab === "dashboard" ? (
            <DashboardView onNavigateSettings={() => setActiveTab("twilio")} />
          ) : currentTab === "voice_agent" ? (
            <VoiceAgentView />
          ) : currentTab === "twilio" ? (
            <TwilioSettingsView />
          ) : currentTab === "theme" ? (
            <ThemeStudioView />
          ) : currentTab === "superadmin" ? (
            <SuperAdminPanel />
          ) : (
            <AdminPanel />
          )}
        </main>

        {/* Minimal Footer */}
        <footer className="bg-[var(--color-surface)]/60 border-t border-[var(--color-border)] px-4 sm:px-6 py-3 text-xs text-[var(--color-muted)] flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>
            &copy; 2026 {draftTheme.identity.org_name || (user.org_name || "Desire AI")}. All rights reserved.
          </div>
          <div className="flex items-center gap-2.5 text-[11px] opacity-75">
            <span>Multi-Tenant Architecture</span>
            <span>&bull;</span>
            <span>WebRTC Gateway v2.11</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <MainContent />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
