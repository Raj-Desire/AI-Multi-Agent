import React from "react";
import { useTheme } from "../../context/ThemeContext";
import {
  Phone,
  Users,
  BarChart3,
  ShieldCheck,
  Bot,
  Activity,
  PhoneCall,
  TrendingUp,
  PieChart
} from "lucide-react";

export const ProductExperiencePanel: React.FC = () => {
  const { draftTheme } = useTheme();
  const orgName = draftTheme.identity.org_name || "Desire AI";

  const featurePillars = [
    {
      title: "AI Voice Agents",
      description: "Human-like conversations that understand and engage.",
      icon: Bot,
      color: "text-blue-600 bg-blue-50/80 border-blue-100",
    },
    {
      title: "Multi-Agent Orchestration",
      description: "Run multiple agents in parallel and handle thousands of calls.",
      icon: Users,
      color: "text-indigo-600 bg-indigo-50/80 border-indigo-100",
    },
    {
      title: "Real-time Analytics",
      description: "Track performance, monitor calls and optimize outcomes.",
      icon: BarChart3,
      color: "text-sky-600 bg-sky-50/80 border-sky-100",
    },
    {
      title: "Secure & Scalable",
      description: "Enterprise-grade security with built-in reliability.",
      icon: ShieldCheck,
      color: "text-emerald-600 bg-emerald-50/80 border-emerald-100",
    },
  ];

  return (
    <div className="relative w-full h-full bg-[#f6f9fd] text-slate-900 flex flex-col justify-between p-6 sm:p-8 xl:p-10 overflow-hidden select-none">
      {/* Background Subtle Gradient Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/90 via-[#f5f8fc]/70 to-[#e4eef9]/80 pointer-events-none -z-10" />

      {/* 1. Top Brand Header */}
      <div className="relative z-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Activity className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm tracking-tight text-slate-900 uppercase">
              {orgName}
            </h2>
            <p className="text-[10.5px] font-medium text-slate-500 tracking-wide">
              Multi-Agent Voice Platform
            </p>
          </div>
        </div>
      </div>

      {/* 2. Middle Body: Two Column Grid (Left Features + Right 3D Visual with Floating Cards) */}
      <div className="relative z-10 my-auto py-2 grid grid-cols-1 xl:grid-cols-12 gap-5 items-center w-full">
        {/* Left Column: Headings & 4 Feature Badges (5.5 cols) */}
        <div className="xl:col-span-6 space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl xl:text-[2.2rem] font-extrabold tracking-tight text-slate-900 leading-[1.14]">
              Smarter Calls. <br />
              Stronger Connections. <br />
              <span className="text-[#2563eb]">Better Results.</span>
            </h1>
            <div className="w-10 h-1 bg-blue-600 rounded-full" />
            <p className="text-xs text-slate-600 font-normal leading-relaxed pt-1 max-w-sm">
              Build, manage and scale AI voice agents that converse, convert and create real impact.
            </p>
          </div>

          {/* Feature Highlights List */}
          <div className="space-y-2.5 pt-1">
            {featurePillars.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 group transition-all"
                >
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs ${feature.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 leading-snug">
                      {feature.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: 3D Robot & Dynamic Floating Telephony Cards (6.5 cols) */}
        <div className="hidden xl:flex xl:col-span-6 relative h-[360px] items-center justify-center">
          {/* Subtle cyan connection line circles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
            <div className="w-64 h-64 rounded-full border border-dashed border-blue-300 animate-spin-slow" />
          </div>

          {/* Center 3D AI Robot with Glowing Pedestal */}
          <div className="relative z-10 w-64 h-64 flex flex-col items-center justify-center">
            <img
              src="/robot-avatar.png"
              alt="AI Voice Agent Robot"
              className="w-56 h-56 object-contain drop-shadow-[0_25px_35px_rgba(37,99,235,0.28)] animate-pulse [animation-duration:3s]"
            />
            {/* 3D Circular Pedestal Stand */}
            <div className="w-40 h-7 rounded-[100%] bg-gradient-to-r from-blue-600 via-sky-400 to-blue-600 shadow-[0_12px_25px_rgba(37,99,235,0.45)] border border-blue-300/70 -mt-4 -z-10 flex items-center justify-center">
              <div className="w-24 h-3.5 rounded-[100%] bg-white/70 blur-[1px]" />
            </div>
          </div>

          {/* Floating Card 1: Active Calls (Top Center) */}
          <div className="absolute top-0 right-14 z-20 bg-white/95 backdrop-blur-md rounded-xl p-2.5 px-3 border border-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.06)] flex items-center gap-2.5 animate-bounce [animation-duration:4s]">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div className="text-left">
              <span className="text-[10px] font-medium text-slate-400 block">Active Calls</span>
              <span className="text-xs font-extrabold text-slate-900 leading-none">28</span>
              <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600 font-semibold ml-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            </div>
          </div>

          {/* Floating Card 2: AI Agents (Top Left) */}
          <div className="absolute top-10 left-0 z-20 bg-white/95 backdrop-blur-md rounded-xl p-2 px-3 border border-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.06)] flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <span className="text-[9.5px] font-medium text-slate-400 block">AI Agents</span>
              <span className="text-xs font-extrabold text-slate-900 leading-none">18</span>
              <span className="text-[9px] text-emerald-600 font-semibold ml-1">↑ 8.2%</span>
            </div>
          </div>

          {/* Floating Card 3: Recent Calls (Right Side List) */}
          <div className="absolute right-0 top-14 z-20 bg-white/95 backdrop-blur-md rounded-xl p-2.5 border border-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.07)] text-left w-40 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-800 pb-1 border-b border-slate-100">
              <span>Recent Calls</span>
            </div>
            <div className="space-y-1 text-[9.5px]">
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5 text-blue-500" /> +1 (415) 555-0123</span>
                <span className="text-slate-400 font-mono">02:15</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5 text-blue-500" /> +1 (212) 555-0189</span>
                <span className="text-slate-400 font-mono">01:42</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5 text-blue-500" /> +1 (310) 555-0112</span>
                <span className="text-slate-400 font-mono">00:58</span>
              </div>
            </div>
            <div className="pt-1 text-center border-t border-slate-100">
              <span className="text-[9px] text-blue-600 font-semibold cursor-pointer">View All Calls</span>
            </div>
          </div>

          {/* Floating Card 4: Conversations (Bottom Left) */}
          <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-md rounded-xl p-2 px-3 border border-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.06)] flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <span className="text-[9.5px] font-medium text-slate-400 block">Conversations</span>
              <span className="text-xs font-extrabold text-slate-900 leading-none">6,324</span>
              <span className="text-[9px] text-emerald-600 font-semibold ml-1">↑ 11.7%</span>
            </div>
          </div>

          {/* Floating Card 5: Conversion Rate (Bottom Right) */}
          <div className="absolute bottom-2 right-10 z-20 bg-white/95 backdrop-blur-md rounded-xl p-2 px-3 border border-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.06)] flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PieChart className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <span className="text-[9.5px] font-medium text-slate-400 block">Conversion Rate</span>
              <span className="text-xs font-extrabold text-slate-900 leading-none">24.6%</span>
              <span className="text-[9px] text-emerald-600 font-semibold ml-1">↑ 8.4%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Slogan Pill */}
      <div className="relative z-10 pt-3 border-t border-slate-200/80 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
          <PhoneCall className="w-4 h-4" />
        </div>
        <div className="text-left">
          <span className="text-xs font-bold text-blue-600 block leading-tight">
            Automate Calls. Build Relationships. Drive Results.
          </span>
          <span className="text-[11px] text-slate-500">
            The future of customer communication is here.
          </span>
        </div>
      </div>
    </div>
  );
};
