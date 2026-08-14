import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { LoginPage } from "./components/LoginPage";
import { AdminPanel } from "./components/AdminPanel";
import { DashboardView } from "./components/DashboardView";
import { TwilioSettingsView } from "./components/TwilioSettingsView";
import { ThemeStudioView } from "./components/ThemeStudioView";
import {
  PhoneCall,
  Settings,
  Activity,
  ShieldCheck,
  LogOut,
  User,
  Palette,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";

function MainContent() {
  const { user, isLoading, isAdmin, logout } = useAuth();
  const { draftTheme, userPreferences, setUserPreferences } = useTheme();
  const [activeTab, setActiveTab] = useState<"dashboard" | "twilio" | "theme" | "admin">("dashboard");

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

  // Ensure non-admin users cannot access admin or theme tabs
  const currentTab =
    (activeTab === "admin" || activeTab === "theme") && !isAdmin ? "dashboard" : activeTab;

  const toggleColorMode = () => {
    const modes: ("system" | "light" | "dark")[] = ["light", "dark", "system"];
    const currentIdx = modes.indexOf(userPreferences.color_mode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    setUserPreferences({ color_mode: nextMode });
  };

  const showNavLogo = draftTheme.identity.show_nav_logo !== false;
  const showNavTitle = draftTheme.identity.show_nav_title !== false;

  return (
    <div className="min-h-screen flex flex-col theme-bg theme-text transition-colors">
      {/* Main Header / Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap justify-between items-center shadow-xs sticky top-0 z-40">
        {/* Organization Branding (Logo & Title) */}
        <div className="flex items-center gap-3">
          {showNavLogo && (
            draftTheme.identity.logo_url ? (
              <img
                src={draftTheme.identity.logo_url}
                alt="Org Logo"
                className="w-10 h-10 rounded-xl object-contain border border-slate-200 shadow-xs bg-white p-0.5"
              />
            ) : (
              <div
                style={{ backgroundColor: draftTheme.colors.primary }}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
              >
                <PhoneCall className="w-5 h-5" />
              </div>
            )
          )}

          {showNavTitle && (
            <div>
              <div
                style={{ color: draftTheme.colors.primary }}
                className="font-black text-lg tracking-tight leading-none"
              >
                {draftTheme.identity.org_name || "Desire AI"}
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1">
                AI Voice Agent Platform
              </div>
            </div>
          )}
        </div>

        {/* Center Navigation Tabs */}
        <nav className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
          <button
            onClick={() => setActiveTab("dashboard")}
            style={{
              backgroundColor: currentTab === "dashboard" ? `${draftTheme.colors.primary}18` : "transparent",
              color: currentTab === "dashboard" ? draftTheme.colors.primary : "#475569",
              borderColor: currentTab === "dashboard" ? `${draftTheme.colors.primary}40` : "transparent",
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              currentTab === "dashboard" ? "shadow-2xs" : "hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab("twilio")}
            style={{
              backgroundColor: currentTab === "twilio" ? `${draftTheme.colors.primary}18` : "transparent",
              color: currentTab === "twilio" ? draftTheme.colors.primary : "#475569",
              borderColor: currentTab === "twilio" ? `${draftTheme.colors.primary}40` : "transparent",
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              currentTab === "twilio" ? "shadow-2xs" : "hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Twilio Settings
          </button>

          {/* Admin Theme Studio Tab */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab("theme")}
              style={{
                backgroundColor: currentTab === "theme" ? `${draftTheme.colors.primary}18` : "transparent",
                color: currentTab === "theme" ? draftTheme.colors.primary : "#475569",
                borderColor: currentTab === "theme" ? `${draftTheme.colors.primary}40` : "transparent",
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                currentTab === "theme" ? "shadow-2xs" : "hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              Theme Studio
            </button>
          )}

          {/* Admin User Management Tab */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab("admin")}
              style={{
                backgroundColor: currentTab === "admin" ? `${draftTheme.colors.primary}18` : "transparent",
                color: currentTab === "admin" ? draftTheme.colors.primary : "#475569",
                borderColor: currentTab === "admin" ? `${draftTheme.colors.primary}40` : "transparent",
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                currentTab === "admin" ? "shadow-2xs" : "hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              User Admin
            </button>
          )}
        </nav>

        {/* Right User Profile, Personal Theme Mode & Logout */}
        <div className="flex items-center gap-2.5">
          {/* Light / Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleColorMode}
            title={`Mode: ${userPreferences.color_mode} (Click to switch)`}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer bg-white"
          >
            {userPreferences.color_mode === "light" ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : userPreferences.color_mode === "dark" ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Laptop className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* User Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-800">{user.username}</span>
            <span
              style={{
                backgroundColor: `${draftTheme.colors.primary}18`,
                color: draftTheme.colors.primary,
                borderColor: `${draftTheme.colors.primary}30`,
              }}
              className="px-2 py-0.5 rounded-md font-bold uppercase text-[10px] border"
            >
              {user.role}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            leftIcon={<LogOut className="w-3.5 h-3.5" />}
          >
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8 transition-all">
        {currentTab === "dashboard" ? (
          <DashboardView onNavigateSettings={() => setActiveTab("twilio")} />
        ) : currentTab === "twilio" ? (
          <TwilioSettingsView />
        ) : currentTab === "theme" ? (
          <ThemeStudioView />
        ) : (
          <AdminPanel />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 sm:px-12 py-4 text-xs text-slate-500 flex justify-between items-center">
        <div>&copy; 2026 {draftTheme.identity.org_name || "Desire AI"} SaaS Platform. All rights reserved.</div>
        <div className="font-mono text-[11px] opacity-70">Multi-Tenant Azure Cosmos DB</div>
      </footer>
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
