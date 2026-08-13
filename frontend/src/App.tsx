import React, { useState } from "react";
import { DashboardView } from "./components/DashboardView";
import { TwilioSettingsView } from "./components/TwilioSettingsView";
import { PhoneCall, Settings, ShieldCheck, Activity } from "lucide-react";

export function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "twilio">("dashboard");

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Banner */}
      <div className="bg-slate-900 text-slate-300 px-6 py-2 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600/30 text-blue-400 px-2 py-0.5 rounded text-[11px] font-semibold border border-blue-500/30">
            Multi-Tenant Isolation
          </span>
          <span>Organization Scope: <strong className="text-white font-mono">org_demo_001</strong></span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>AES-256 Encrypted</span>
        </div>
      </div>

      {/* Main Header / Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-lg text-slate-900 tracking-tight leading-none">
              Cloud Rep AI
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              Multi-Tenant AI Agent Platform
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <nav className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "dashboard"
                ? "bg-blue-50 text-blue-600 border border-blue-200"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Activity className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("twilio")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "twilio"
                ? "bg-blue-50 text-blue-600 border border-blue-200"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Settings className="w-4 h-4" />
            Twilio Settings
          </button>
        </nav>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {activeTab === "dashboard" ? (
          <DashboardView onNavigateSettings={() => setActiveTab("twilio")} />
        ) : (
          <TwilioSettingsView />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 text-xs text-slate-500 flex justify-between items-center">
        <div>&copy; 2026 Cloud Rep AI. All rights reserved.</div>
        <div className="font-mono text-[11px] text-slate-400">React + TypeScript SPA</div>
      </footer>
    </div>
  );
}
