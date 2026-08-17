import React, { useEffect, useState } from "react";
import { PhoneCall, UserCheck, Sparkles, Mic } from "lucide-react";

export const LiveVoiceCallVisual: React.FC = () => {
  const [seconds, setSeconds] = useState(42);

  // Subtle call timer tick
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => (prev >= 59 ? 10 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = `00:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="w-full max-w-md rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/90 shadow-2xl p-4 sm:p-5 text-left space-y-3.5 relative overflow-hidden group">
      {/* Subtle top brand glow line */}
      <div
        style={{ background: "linear-gradient(90deg, transparent, var(--color-primary, #4f46e5), transparent)" }}
        className="absolute top-0 left-0 right-0 h-[1.5px] opacity-70"
      />

      {/* Header: Agent info and live timer badge */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div
            style={{ backgroundColor: "var(--color-primary, #4f46e5)" }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-md shadow-slate-950 shrink-0"
          >
            <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-1.5 leading-none">
              <span>AI Inbound Sales Agent</span>
              <Sparkles className="w-3 h-3 text-amber-400" />
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span className="text-emerald-400 font-medium">Live Voice Session</span>
              <span className="text-slate-600">&bull;</span>
              <span>Twilio WebRTC</span>
            </div>
          </div>
        </div>

        {/* Live Call Duration */}
        <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono font-medium text-slate-300">
          {formattedTime}
        </div>
      </div>

      {/* Audio Waveform Oscilloscope */}
      <div className="bg-slate-900/60 rounded-xl px-3 py-2 border border-slate-800/60 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <Mic className="w-3.5 h-3.5 text-emerald-400" />
          <span>HD Audio Active</span>
        </div>
        <div className="flex items-center gap-[2.5px] h-4">
          {[40, 75, 90, 50, 30, 85, 100, 60, 45, 95, 70, 35, 80, 60, 90, 40].map((height, i) => (
            <span
              key={i}
              style={{
                height: `${height}%`,
                backgroundColor: i % 2 === 0 ? "var(--color-primary, #4f46e5)" : "#38bdf8",
                animation: `pulse 1.2s ease-in-out infinite ${i * 0.08}s`,
              }}
              className="w-[2px] rounded-full transition-all duration-300"
            />
          ))}
        </div>
      </div>

      {/* Real-time Conversation Dialogue Snippet */}
      <div className="space-y-2 text-[11.5px]">
        {/* Customer utterance */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5 text-slate-300 space-y-0.5">
          <div className="text-[9.5px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Customer &bull; +1 (415) 890-2190</span>
            <span className="text-[9px] text-slate-500">00:18</span>
          </div>
          <p className="leading-snug">
            &ldquo;We need an automated voice agent to handle inbound qualification and book demos directly to our calendar.&rdquo;
          </p>
        </div>

        {/* AI Agent utterance */}
        <div className="bg-slate-900/90 border border-slate-700/60 rounded-xl p-2.5 text-white space-y-0.5 relative">
          <div className="flex items-center justify-between text-[9.5px] font-medium text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1 text-slate-200">
              <span
                style={{ backgroundColor: "var(--color-primary, #4f46e5)" }}
                className="w-1.5 h-1.5 rounded-full inline-block"
              />
              Desire AI Agent
            </span>
            <span className="text-[9px] text-slate-500">00:24</span>
          </div>
          <p className="text-slate-200 leading-snug">
            &ldquo;Desire AI connects to your Twilio number, qualifies intent in sub-200ms latency, and books meetings automatically.&rdquo;
          </p>
        </div>
      </div>

      {/* Telemetry & Quality Bar */}
      <div className="pt-0.5 flex items-center justify-between text-[10.5px] text-slate-400 border-t border-slate-800/70">
        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
          <UserCheck className="w-3.5 h-3.5" />
          <span>Intent Qualified &bull; 98% Confidence</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500 text-[10px]">
          <span>Opus HD</span>
          <span>&bull;</span>
          <span>118ms RTT</span>
        </div>
      </div>
    </div>
  );
};
