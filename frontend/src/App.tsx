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
import { AIAgentDialerView } from "./components/AIAgentDialerView";
import { AgentManagementView } from "./components/AgentManagementView";
import { BusinessProfileView } from "./components/BusinessProfileView";
import { Sidebar, NavTab } from "./components/Sidebar";
import { LoadingState } from "./components/ui/LoadingState";
import { Toaster } from "sonner";
import {
  Menu,
  PhoneCall,
  PhoneOutgoing,
  Bot,
  Sliders,
  Palette,
  Users,
  ShieldAlert,
  Building2
} from "lucide-react";

function MainContent() {
  const { user, isLoading, isAdmin, isSuperAdmin } = useAuth();
  const { draftTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [activeDialerAgentId, setActiveDialerAgentId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <LoadingState
        fullPage
        message="Loading workspace session..."
        subMessage="Applying organization identity and credentials"
        size="md"
      />
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
          sub: "Standard WebRTC Direct Dialing & Call History",
          icon: PhoneCall,
        };
      case "ai_dialer":
        return {
          title: "AI Voice Agent Dialer",
          sub: "Conversational AI voice dispatching & live telemetry",
          icon: PhoneOutgoing,
        };
      case "voice_agent":
        return {
          title: "AI Voice Agents",
          sub: "Deepgram & LLM voice agent configurations, prompts & library",
          icon: Bot,
        };
      case "business_profile":
        return {
          title: "Company Knowledge Base",
          sub: "Business identity, services, office address & working hours for AI calls",
          icon: Building2,
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
          title: "Admin Control",
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
          </div>
        </header>

        {/* Dynamic Main View - Full Width & Fully Responsive */}
        <main className="flex-1 w-full max-w-full px-3 sm:px-5 lg:px-7 py-4 sm:py-6 transition-all text-left">
          {currentTab === "dashboard" ? (
            <DashboardView onNavigateSettings={() => setActiveTab("twilio")} />
          ) : currentTab === "ai_dialer" ? (
            <AIAgentDialerView
              initialAgentId={activeDialerAgentId}
              onNavigateSettings={() => setActiveTab("twilio")}
              onNavigateAgents={() => setActiveTab("voice_agent")}
            />
          ) : currentTab === "voice_agent" ? (
            <AgentManagementView
              onNavigateToDialer={(agentId) => {
                setActiveDialerAgentId(agentId);
                setActiveTab("ai_dialer");
              }}
            />
          ) : currentTab === "business_profile" ? (
            <BusinessProfileView />
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
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
            className: "text-xs font-sans shadow-lg border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]"
          }}
        />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
