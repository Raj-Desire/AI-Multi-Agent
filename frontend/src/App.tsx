import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./components/LoginPage";
import { AdminPanel } from "./components/AdminPanel";
import { DashboardView } from "./components/DashboardView";
import { TwilioSettingsView } from "./components/TwilioSettingsView";
import { PhoneCall, Settings, Activity, ShieldCheck, LogOut, User } from "lucide-react";

function MainContent() {
  const { user, isLoading, isAdmin, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"dashboard" | "twilio" | "admin">("dashboard");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-slate-500">Loading session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Ensure non-admin users cannot access admin tab
  const currentTab = activeTab === "admin" && !isAdmin ? "dashboard" : activeTab;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans">
      {/* Main Header / Navigation */}
      <header className="bg-white border-b border-slate-200/80 px-6 py-3.5 flex flex-wrap justify-between items-center shadow-xs">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-lg text-slate-900 tracking-tight leading-none">
              Desire AI
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              AI Voice Agent Platform
            </div>
          </div>
        </div>

        {/* Center Tabs Navigation */}
        <nav className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              currentTab === "dashboard"
                ? "bg-indigo-50 text-indigo-600 border border-indigo-200/80 shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Activity className="w-4 h-4" />
            Dashboard
          </button>
          
          <button
            onClick={() => setActiveTab("twilio")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              currentTab === "twilio"
                ? "bg-indigo-50 text-indigo-600 border border-indigo-200/80 shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Settings className="w-4 h-4" />
            Twilio Settings
          </button>

          {/* Admin User Management Tab (Admin Only) */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                currentTab === "admin"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-indigo-600 hover:bg-indigo-50 border border-indigo-200"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              User Creation & Admin
            </button>
          )}
        </nav>

        {/* Right User Profile & Logout */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-xs">
            <User className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-900">{user.username}</span>
            <span className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] ${
              isAdmin ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-700"
            }`}>
              {user.role}
            </span>
          </div>

          <button
            onClick={logout}
            title="Logout"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs font-semibold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {currentTab === "dashboard" ? (
          <DashboardView onNavigateSettings={() => setActiveTab("twilio")} />
        ) : currentTab === "twilio" ? (
          <TwilioSettingsView />
        ) : (
          <AdminPanel />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 text-xs text-slate-500 flex justify-between items-center">
        <div>&copy; 2026 Desire AI SaaS Platform. All rights reserved.</div>
        <div className="font-mono text-[11px] text-slate-400">Azure Cosmos DB NoSQL</div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
