import React from "react";
import { AgentLeadStat } from "../../types";
import { Bot, Flame } from "lucide-react";

interface AgentPerformanceSectionProps {
  agents: AgentLeadStat[];
  isLoading: boolean;
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
}

export function AgentPerformanceSection({
  agents,
  isLoading,
  selectedAgentId,
  onSelectAgent,
}: AgentPerformanceSectionProps) {
  if (isLoading) {
    return (
      <div className="p-4 sm:p-5 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse space-y-3">
        <div className="h-5 bg-[var(--color-border)]/60 rounded w-1/4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--color-border)]/30 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="p-4 sm:p-5 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs space-y-3 flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[var(--color-primary)]" />
            <h3 className="text-sm font-bold text-[var(--color-heading)]">
              Leads by AI Voice Agent
            </h3>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Voice persona effectiveness and conversion attribution
          </p>
        </div>

        {selectedAgentId && selectedAgentId !== "all" && (
          <button
            onClick={() => onSelectAgent("all")}
            className="text-xs text-[var(--color-primary)] hover:underline font-medium cursor-pointer"
          >
            Show All Agents
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {agents.map((agent) => {
          const isSelected = selectedAgentId === agent.agent_id;

          return (
            <div
              key={agent.agent_id}
              onClick={() => onSelectAgent(agent.agent_id)}
              className={`p-3.5 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex flex-col justify-between hover:shadow-xs ${
                isSelected
                  ? "bg-[var(--color-surface)] ring-2 ring-[var(--color-primary)] border-transparent"
                  : "bg-[var(--color-background)]/50 border-[var(--color-border)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]"
              }`}
            >
              {/* Agent Title & Calls Badge */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <span
                    className="font-bold text-xs text-[var(--color-heading)] truncate"
                    title={agent.agent_name}
                  >
                    {agent.agent_name}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-border)]/60 text-[var(--color-muted)] font-mono shrink-0 whitespace-nowrap">
                  {agent.total_calls} {agent.total_calls === 1 ? "Call" : "Calls"}
                </span>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-[var(--color-border)]/60 text-center">
                <div>
                  <div className="text-[10px] text-[var(--color-muted)]">Interested</div>
                  <div className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    {agent.interested_leads}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--color-muted)]">Callbacks</div>
                  <div className="font-mono font-bold text-xs text-purple-600 dark:text-purple-400">
                    {agent.callback_leads}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--color-muted)]">Avg Score</div>
                  <div className="font-mono font-bold text-xs text-[var(--color-heading)] flex items-center justify-center gap-0.5">
                    <Flame className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>{agent.avg_lead_score}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
