import React from "react";
import { Bot, User } from "lucide-react";

export interface TranscriptTurn {
  role?: string;
  content?: string;
  text?: string;
  timestamp?: string;
  created_at?: string;
}

interface TranscriptChatProps {
  turns: TranscriptTurn[];
  agentName?: string;
  customerName?: string;
  className?: string;
}

function isAgentRole(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "assistant" || r === "agent" || r === "ai";
}

function formatTooltipTime(ts?: string) {
  if (!ts) return undefined;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}

/**
 * Chat-style transcript: agent on the left, customer on the right.
 * Speaker names are shown once in a legend (not on every message) and timestamps
 * are available only as a hover tooltip, so the conversation itself stays easy to read.
 */
export function TranscriptChat({ turns, agentName, customerName, className = "" }: TranscriptChatProps) {
  const messages = (turns || [])
    .map((t) => ({
      isAgent: isAgentRole(t.role),
      text: (t.content || t.text || "").trim(),
      time: t.timestamp || t.created_at,
    }))
    .filter((m) => m.text);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)] px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-[var(--color-surface-muted)] border border-[var(--color-border)] flex items-center justify-center">
            <Bot className="w-3 h-3 text-[var(--color-primary)]" />
          </span>
          <span className="font-medium text-[var(--color-heading)]">{agentName || "AI Agent"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-[var(--color-heading)]">{customerName || "Customer"}</span>
          <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <User className="w-3 h-3 text-emerald-600" />
          </span>
        </span>
      </div>

      <div className="space-y-1.5">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const startsGroup = !prev || prev.isAgent !== m.isAgent;
          return (
            <div
              key={i}
              className={`flex ${m.isAgent ? "justify-start" : "justify-end"} ${startsGroup && i > 0 ? "pt-2" : ""}`}
            >
              <div
                title={formatTooltipTime(m.time)}
                className={`max-w-[82%] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words shadow-xs ${
                  m.isAgent
                    ? "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border border-[var(--color-border)] rounded-2xl rounded-tl-sm"
                    : "bg-[var(--color-primary)] text-white rounded-2xl rounded-tr-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
