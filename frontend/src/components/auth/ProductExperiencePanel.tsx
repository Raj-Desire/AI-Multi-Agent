import React from "react";
import { useTheme } from "../../context/ThemeContext";
import { LiveVoiceCallVisual } from "./LiveVoiceCallVisual";
import { PhoneCall, ShieldCheck, Zap, Bot } from "lucide-react";

export const ProductExperiencePanel: React.FC = () => {
  const { draftTheme } = useTheme();
  const orgName = draftTheme.identity.org_name || "Desire AI";

  return (
    <div className="relative w-full h-full bg-[#0b0f19] text-white flex flex-col justify-between p-6 sm:p-8 lg:p-10 xl:p-12 border-r border-slate-800/80 overflow-hidden select-none">
      {/* Background subtle radial ambient highlight */}
      <div
        style={{
          background: `radial-gradient(circle 500px at 0% 0%, var(--color-primary-light, rgba(79, 70, 229, 0.15)), transparent 70%)`,
        }}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Top Brand Bar */}
      <div className="relative z-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          {draftTheme.identity.logo_url ? (
            <img
              src={draftTheme.identity.logo_url}
              alt={orgName}
              className="w-7 h-7 rounded-lg object-contain bg-slate-900 border border-slate-800 p-0.5"
            />
          ) : (
            <div
              style={{ backgroundColor: "var(--color-primary, #4f46e5)" }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-md shadow-indigo-950/50"
            >
              <PhoneCall className="w-3.5 h-3.5" />
            </div>
          )}
          <span className="font-semibold text-sm tracking-tight text-white">{orgName}</span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900/80 border border-slate-800 text-[10.5px] font-medium text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Autonomous Voice SaaS</span>
        </div>
      </div>

      {/* Main Slogan & Product Value Proposition */}
      <div className="relative z-10 my-auto py-4 sm:py-6 space-y-5 max-w-xl">
        <div className="space-y-2.5">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span
              style={{ backgroundColor: "var(--color-primary, #4f46e5)" }}
              className="w-1.5 h-1.5 rounded-full inline-block"
            />
            AI-Powered Voice Communication
          </div>

          <h1 className="text-3xl sm:text-4xl xl:text-[2.65rem] font-semibold tracking-tight text-white leading-[1.1]">
            Turn every call into a conversation that converts.
          </h1>

          <p className="text-sm sm:text-base text-slate-300/85 font-normal leading-relaxed max-w-md">
            AI voice agents that connect, engage, qualify, and follow up with your customers automatically.
          </p>
        </div>

        {/* Live Call Visual Component */}
        <div>
          <LiveVoiceCallVisual />
        </div>
      </div>

      {/* Bottom Features Strip */}
      <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-4 text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-1.5 text-[11.5px]">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>&lt;200ms Latency</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px]">
            <Bot className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Twilio Integration</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11.5px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Multi-Tenant</span>
          </div>
        </div>

        <div className="text-[10.5px] text-slate-500">
          WebRTC Voice AI
        </div>
      </div>
    </div>
  );
};
