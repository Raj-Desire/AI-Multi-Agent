import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { LoginPage } from "./components/LoginPage";
import { AdminPanel } from "./components/AdminPanel";
import { SuperAdminPanel } from "./components/SuperAdminPanel";
import { DashboardView } from "./components/DashboardView";
import { TwilioSettingsView } from "./components/TwilioSettingsView";
import { ThemeStudioView } from "./components/ThemeStudioView";
import { Sidebar, NavTab } from "./components/Sidebar";
import {
  Menu,
  PhoneCall,
  Activity,
  Settings,
  Palette,
  ShieldCheck,
  Crown,
  Bell,
  Sparkles,
  Wifi,
} from "lucide-react";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";

function MainContent() {
  const { user, isLoading, isAdmin, isSuperAdmin } = useAuth();
  const { draftTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen theme-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            style={{
              borderColor: draftTheme.colors.primary,
              borderTopColor: "transparent",
            }}
            className="w-8 h-8 border-3 rounded-full animate-spin"
          />
          <span className="text-sm font-medium theme-muted">Loading session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Ensure role permissions are strictly guarded for tab access
  let currentTab = activeTab;
  if (currentTab === "superadmin" && !isSuperAdmin) {
    currentTab = "dashboard";
  } else if ((currentTab === "admin" || currentTab === "theme") && !isAdmin) {
    currentTab = "dashboard";
  }

  const getPageTitle = () => {
    switch (currentTab) {
      case "dashboard":
        return {
          title: "Calling Console",
          sub: "WebRTC Direct Dialing & Live Call Session History",
          icon: Activity,
        };
      case "twilio":
        return {
          title: "Twilio Voice Configuration",
          sub: "Programmable Voice softphone keys, Caller IDs & Inbound Routing",
          icon: Settings,
        };
      case "theme":
        return {
          title: "Theme Studio & Design Tokens",
          sub: "White-label customization across 8 architecture UI styles",
          icon: Palette,
        };
      case "admin":
        return {
          title: "Organization User Administration",
          sub: "Manage organization team members, roles & permissions",
          icon: ShieldCheck,
        };
      case "superadmin":
        return {
          title: "Super Admin Master Console",
          sub: "Multi-tenant tenant root governance & system telemetries",
          icon: Crown,
        };
      default:
        return {
          title: "Dashboard",
          sub: "AI Voice Agent Platform",
          icon: Activity,
        };
    }
  };

  const pageMeta = getPageTitle();
  const HeaderIcon = pageMeta.icon;

  return (
    <div className="min-h-screen flex theme-bg theme-text transition-colors">
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
            className="w-72 h-full"
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

      {/* Main Column Workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Minimal Utility Navbar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-2xs">
          <div className="flex items-center gap-3">
            {/* Mobile Sidebar Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 md:hidden cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Current Section Breadcrumb / Title Indicator */}
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  backgroundColor: `${draftTheme.colors.primary}15`,
                  color: draftTheme.colors.primary,
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hidden sm:flex"
              >
                <HeaderIcon className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-extrabold text-heading tracking-tight leading-none">
                  {pageMeta.title}
                </h1>
                <p className="text-[11px] text-sub font-medium hidden sm:block mt-0.5">
                  {pageMeta.sub}
                </p>
              </div>
            </div>
          </div>

          {/* Right Status Indicators */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Active Tenant Badge */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-sub font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Org: <strong className="text-heading font-semibold">{user.org_name || draftTheme.identity.org_name || "Desire AI"}</strong></span>
            </div>

            {/* WebRTC Live System Status */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
              <Wifi className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span className="hidden sm:inline">WebRTC Live</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 transition-all">
          {currentTab === "dashboard" ? (
            <DashboardView onNavigateSettings={() => setActiveTab("twilio")} />
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

        {/* Global Clean Footer */}
        <footer className="bg-white/80 border-t border-slate-200/80 px-6 sm:px-8 py-3.5 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>
            &copy; 2026 {draftTheme.identity.org_name || (user.org_name || "Desire AI")} SaaS Platform. All rights reserved.
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] opacity-70">
            <span>Multi-Tenant Azure Cosmos DB</span>
            <span>&bull;</span>
            <span>WebRTC Voice Gateway v2.11</span>
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
