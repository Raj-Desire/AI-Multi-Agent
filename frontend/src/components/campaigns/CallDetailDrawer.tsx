import React, { useState, useEffect, useMemo, useRef } from "react";
import { fetchApi } from "../../api-client";
import { CallRecord, ConversationTurnMessage } from "../../types";
import { Drawer } from "../ui/Drawer";
import { Button } from "../ui/Button";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  User,
  Bot,
  Calendar,
  Sparkles,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  Activity,
  Zap,
  Building2,
  Mail,
  Copy,
  Check,
  RotateCcw,
  Volume2,
  FileText
} from "lucide-react";
import { toast } from "sonner";

interface CallDetailDrawerProps {
  callId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onRefreshParent?: () => void;
}

export function CallDetailDrawer({
  callId,
  isOpen,
  onClose,
  onRefreshParent
}: CallDetailDrawerProps) {
  const [call, setCall] = useState<CallRecord | null>(null);
  const [prospect, setProspect] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Transcript Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"transcript" | "summary" | "analytics" | "prospect">("transcript");
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);

  const transcriptBoxRef = useRef<HTMLDivElement | null>(null);

  // Load call details
  useEffect(() => {
    if (!isOpen || !callId) {
      setCall(null);
      setProspect(null);
      setError(null);
      setSearchQuery("");
      return;
    }

    let isMounted = true;
    async function loadCallDetails() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchApi<CallRecord>(`/calls/${callId}`);
        if (!isMounted) return;
        setCall(data);

        // Fetch prospect if prospect_id is present
        if (data.prospect_id) {
          try {
            const pData = await fetchApi<any>(`/prospects/${data.prospect_id}`);
            if (isMounted) setProspect(pData);
          } catch {
            // Non-blocking
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load call details.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadCallDetails();
    return () => {
      isMounted = false;
    };
  }, [callId, isOpen]);

  // Highlight search matches
  const highlightMatches = (text: string, query: string) => {
    if (!query.trim() || !text) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-300 dark:bg-amber-600 text-black dark:text-white px-0.5 rounded font-bold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Filtered transcript messages
  const filteredTranscript = useMemo(() => {
    if (!call?.transcript) return [];
    if (!searchQuery.trim()) return call.transcript;
    const q = searchQuery.toLowerCase();
    return call.transcript.filter((t) => {
      const content = (t.content || (t as any).text || "").toLowerCase();
      const role = (t.role || "").toLowerCase();
      return content.includes(q) || role.includes(q);
    });
  }, [call?.transcript, searchQuery]);

  const copyTurnText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTurnId(key);
    toast.success("Turn copied to clipboard");
    setTimeout(() => setCopiedTurnId(null), 2000);
  };

  const getOutcomeBadge = (outcome?: string, transcript?: any[], duration?: number) => {
    const hasCustomerSpoken = (transcript || []).some(
      (t: any) => (t.role === "user" || t.role === "customer") && (t.content || t.text || "").trim().length > 0
    );
    const hasConversation = hasCustomerSpoken || (duration && duration > 0);

    let effectiveOutcome = outcome || (hasConversation ? "Interested" : "Completed");
    let raw = effectiveOutcome.trim().toLowerCase().replace(/[-_]/g, " ");

    if (hasConversation && (raw.includes("no answer") || raw.includes("not answer") || raw.includes("unanswered") || !raw)) {
      effectiveOutcome = "Asked Details";
      raw = "asked details";
    }

    if (raw.includes("converted") || raw.includes("meeting") || raw.includes("highly") || raw.includes("qualified") || raw.includes("interested") || raw.includes("warm")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          Interested
        </span>
      );
    }
    if (raw.includes("callback")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
          <RotateCcw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          Callback Requested
        </span>
      );
    }
    if (raw.includes("info") || raw.includes("asked")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800">
          <TrendingUp className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          Asked Details
        </span>
      );
    }
    if (raw.includes("follow")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
          <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          Follow-up
        </span>
      );
    }
    if (raw.includes("dnc") || raw.includes("do not")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          Do Not Call
        </span>
      );
    }
    if (raw.includes("not")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          Not Interested
        </span>
      );
    }
    if (raw.includes("answer") || raw.includes("unanswered")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          No Answer
        </span>
      );
    }
    if (raw.includes("voicemail") || raw.includes("busy")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          {raw.includes("voicemail") ? "Voicemail" : "Busy"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
        <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
        {outcome ? outcome.replace(/_/g, " ") : "Completed"}
      </span>
    );
  };

  const getStatusBadge = (status?: string) => {
    const st = (status || "initiated").toLowerCase();
    if (st === "completed" || st === "answered") {
      return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">Connected</span>;
    }
    if (st === "in-progress" || st === "calling") {
      return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800 animate-pulse">In Progress</span>;
    }
    if (st === "no-answer" || st === "unanswered") {
      return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">No Answer</span>;
    }
    if (st === "busy" || st === "voicemail") {
      return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Voicemail / Busy</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 capitalize">{status || "Initiated"}</span>;
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Call Intelligence & Transcript" size="lg">
      <div className="flex flex-col h-full space-y-4">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3 text-[var(--color-muted)]">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Loading call intelligence records...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h4 className="text-sm font-bold text-[var(--color-heading)]">Failed to load call</h4>
            <p className="text-xs text-[var(--color-muted)]">{error}</p>
            <Button variant="outline" size="sm" onClick={() => {}}>
              Retry
            </Button>
          </div>
        ) : call ? (
          <>
            {/* Sticky Header Card */}
            <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--color-heading)]">
                      {prospect?.full_name || call.to_number}
                    </h3>
                    {getStatusBadge(call.status)}
                  </div>
                  <p className="text-xs font-mono text-[var(--color-muted)] mt-0.5">
                    {call.to_number} {prospect?.company ? `• ${prospect.company}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getOutcomeBadge(call.business_outcome || call.outcome, call.transcript, call.duration)}
                </div>
              </div>

              {/* Metadata chips */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                <div className="flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>Agent: <strong className="text-[var(--color-heading)]">{call.agent_name || call.agent_id || "Voice Agent"}</strong></span>
                </div>
                <span className="opacity-30">•</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Duration: <strong className="text-[var(--color-heading)]">{call.duration}s</strong></span>
                </div>
                <span className="opacity-30">•</span>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span>{new Date(call.created_at).toLocaleString()}</span>
                </div>
                {call.lead_score !== undefined && call.lead_score !== null && (
                  <>
                    <span className="opacity-30">•</span>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Lead Score: <strong className="text-indigo-600 font-bold">{call.lead_score}/100</strong></span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Sub-Tabs */}
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("transcript")}
                className={`px-3 py-1.5 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === "transcript"
                    ? "bg-[var(--color-primary)] text-white shadow-2xs"
                    : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>Transcript ({call.transcript?.length || 0} turns)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`px-3 py-1.5 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === "summary"
                    ? "bg-[var(--color-primary)] text-white shadow-2xs"
                    : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>AI Summary & Actions</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("analytics")}
                className={`px-3 py-1.5 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === "analytics"
                    ? "bg-[var(--color-primary)] text-white shadow-2xs"
                    : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                }`}
              >
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>Telemetry & Latency</span>
              </button>

              {prospect && (
                <button
                  type="button"
                  onClick={() => setActiveTab("prospect")}
                  className={`px-3 py-1.5 font-semibold rounded-md transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    activeTab === "prospect"
                      ? "bg-[var(--color-primary)] text-white shadow-2xs"
                      : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                  }`}
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>Prospect Context</span>
                </button>
              )}
            </div>

            {/* TAB 1: TRANSCRIPT */}
            {activeTab === "transcript" && (
              <div className="flex flex-col flex-1 space-y-3 min-h-[350px]">
                {/* Search in Transcript */}
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--color-muted)]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search spoken keywords or phrases in transcript..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-hidden focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                  {searchQuery && (
                    <span className="text-xs text-[var(--color-muted)] shrink-0">
                      {filteredTranscript.length} matching {filteredTranscript.length === 1 ? "turn" : "turns"}
                    </span>
                  )}
                </div>

                {/* Processing state */}
                {call.analytics_status === "processing" && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center gap-2 text-xs text-blue-800 dark:text-blue-300">
                    <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>Post-call AI summary and outcome analytics are currently processing...</span>
                  </div>
                )}

                {/* Conversation Turns List */}
                <div
                  ref={transcriptBoxRef}
                  className="flex-1 overflow-y-auto space-y-3 p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-xl max-h-[480px]"
                >
                  {filteredTranscript.length === 0 ? (
                    <div className="py-16 text-center text-xs text-[var(--color-muted)] space-y-1">
                      <HelpCircle className="w-6 h-6 mx-auto text-[var(--color-muted)]/50" />
                      <p>
                        {searchQuery
                          ? `No conversation turns matched "${searchQuery}".`
                          : "No spoken transcript recorded for this call."}
                      </p>
                    </div>
                  ) : (
                    filteredTranscript.map((turn: any, idx: number) => {
                      const isAgent = turn.role === "assistant" || turn.role === "agent";
                      const text = turn.content || turn.text || "";
                      const key = `turn-${idx}`;
                      const timestamp = turn.timestamp || turn.created_at;
                      const timeStr = timestamp
                        ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                        : null;

                      return (
                        <div
                          key={key}
                          className={`flex flex-col group ${isAgent ? "items-start pr-8" : "items-end pl-8"}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 text-[11px] text-[var(--color-muted)]">
                            {isAgent ? (
                              <>
                                <Bot className="w-3 h-3 text-[var(--color-primary)]" />
                                <span className="font-semibold text-[var(--color-heading)]">AI Agent</span>
                              </>
                            ) : (
                              <>
                                <span className="font-semibold text-[var(--color-heading)]">Customer</span>
                                <User className="w-3 h-3 text-emerald-500" />
                              </>
                            )}
                            {timeStr && <span className="opacity-60 text-[10px]">{timeStr}</span>}
                            {turn.latency_ms && (
                              <span className="text-[10px] text-[var(--color-muted)] font-mono">
                                ({Math.round(turn.latency_ms)}ms)
                              </span>
                            )}
                          </div>

                          <div
                            className={`p-3 rounded-xl text-xs relative leading-relaxed shadow-2xs ${
                              isAgent
                                ? "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] rounded-tl-none"
                                : "bg-[var(--color-primary)] text-white rounded-tr-none"
                            }`}
                          >
                            <p>{highlightMatches(text, searchQuery)}</p>

                            <button
                              type="button"
                              onClick={() => copyTurnText(text, key)}
                              className={`absolute right-2 bottom-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                                isAgent
                                  ? "bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                                  : "bg-white/20 text-white hover:bg-white/30"
                              }`}
                              title="Copy turn text"
                            >
                              {copiedTurnId === key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: AI SUMMARY & ACTIONS */}
            {activeTab === "summary" && (
              <div className="space-y-4 overflow-y-auto max-h-[500px] pr-1 text-xs">
                {/* Executive Summary Card */}
                <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[var(--color-heading)] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                      Executive Conversation Summary
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)]">
                      {call.intent || "Inquiry"}
                    </span>
                  </div>
                  <p className="text-[var(--color-text)] leading-relaxed text-xs">
                    {call.summary || "No meaningful dialogue was detected or call disconnected before conversation."}
                  </p>
                </div>

                {/* Key Requirements & Questions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg space-y-2">
                    <span className="font-semibold text-[var(--color-heading)] block flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Key Requirements Identified
                    </span>
                    {call.key_requirements && call.key_requirements.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-[var(--color-muted)]">
                        {call.key_requirements.map((req, i) => (
                          <li key={i}>{req}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[var(--color-muted)] italic">None explicitly identified</p>
                    )}
                  </div>

                  <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg space-y-2">
                    <span className="font-semibold text-[var(--color-heading)] block flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                      Customer Questions Asked
                    </span>
                    {call.customer_questions && call.customer_questions.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-[var(--color-muted)]">
                        {call.customer_questions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[var(--color-muted)] italic">No specific questions asked</p>
                    )}
                  </div>
                </div>

                {/* Objections & Important Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg space-y-2">
                    <span className="font-semibold text-[var(--color-heading)] block flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      Objections Raised
                    </span>
                    {call.objections && call.objections.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-[var(--color-muted)]">
                        {call.objections.map((obj, i) => (
                          <li key={i}>{obj}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[var(--color-muted)] italic">No objections raised</p>
                    )}
                  </div>

                  <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg space-y-2">
                    <span className="font-semibold text-[var(--color-heading)] block flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                      Callback / Follow-up Details
                    </span>
                    {call.callback_datetime ? (
                      <div className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] font-semibold text-indigo-600 dark:text-indigo-400">
                        {call.callback_datetime}
                      </div>
                    ) : (
                      <p className="text-[var(--color-muted)] italic">No explicit callback date specified</p>
                    )}
                  </div>
                </div>

                {/* Next Action Recommendation */}
                <div className="p-3.5 bg-[var(--color-primary-subtle,rgba(59,130,246,0.08))] border border-[var(--color-primary)]/30 rounded-xl flex items-start gap-3">
                  <ArrowRight className="w-4 h-4 text-[var(--color-primary)] mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-[var(--color-heading)] block">Recommended Next Action</span>
                    <p className="text-[var(--color-text)] mt-0.5">
                      {call.next_action || "Follow up with prospect at appropriate interval."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TELEMETRY & LATENCY */}
            {activeTab === "analytics" && (
              <div className="space-y-4 overflow-y-auto max-h-[500px] text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <span className="text-[11px] text-[var(--color-muted)]">Sentiment</span>
                    <p className="text-base font-bold text-[var(--color-heading)] mt-1">{call.sentiment || "Neutral"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <span className="text-[11px] text-[var(--color-muted)]">Interest Tier</span>
                    <p className="text-base font-bold text-[var(--color-heading)] mt-1">{call.interest_level || "Cold"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <span className="text-[11px] text-[var(--color-muted)]">Lead Score</span>
                    <p className="text-base font-bold text-indigo-600 mt-1">{call.lead_score || 0}/100</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <span className="text-[11px] text-[var(--color-muted)]">Call Status</span>
                    <p className="text-base font-bold text-emerald-600 mt-1 capitalize">{call.status}</p>
                  </div>
                </div>

                {call.latency_metrics && (
                  <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3">
                    <h4 className="font-bold text-[var(--color-heading)] flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      Live Audio & Model Latency Metrics
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded bg-[var(--color-surface-muted)]">
                        <span className="text-[10px] text-[var(--color-muted)] block">STT Latency</span>
                        <strong className="font-mono text-[var(--color-heading)]">
                          {Math.round(call.latency_metrics.stt_latency_ms || 0)} ms
                        </strong>
                      </div>
                      <div className="p-2 rounded bg-[var(--color-surface-muted)]">
                        <span className="text-[10px] text-[var(--color-muted)] block">LLM Think Latency</span>
                        <strong className="font-mono text-[var(--color-heading)]">
                          {Math.round(call.latency_metrics.llm_latency_ms || 0)} ms
                        </strong>
                      </div>
                      <div className="p-2 rounded bg-[var(--color-surface-muted)]">
                        <span className="text-[10px] text-[var(--color-muted)] block">TTS Synthesis</span>
                        <strong className="font-mono text-[var(--color-heading)]">
                          {Math.round(call.latency_metrics.tts_latency_ms || 0)} ms
                        </strong>
                      </div>
                      <div className="p-2 rounded bg-[var(--color-surface-muted)]">
                        <span className="text-[10px] text-[var(--color-muted)] block">Total Turn Latency</span>
                        <strong className="font-mono text-emerald-600">
                          {Math.round(call.latency_metrics.total_turn_latency_ms || 0)} ms
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: PROSPECT CONTEXT */}
            {activeTab === "prospect" && prospect && (
              <div className="space-y-4 overflow-y-auto max-h-[500px] text-xs">
                <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold flex items-center justify-center text-sm">
                      {prospect.full_name?.charAt(0) || "P"}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[var(--color-heading)]">{prospect.full_name}</h4>
                      <p className="text-[var(--color-muted)]">{prospect.job_title || "Contact"} {prospect.company ? `at ${prospect.company}` : ""}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--color-border)] text-xs">
                    <div>
                      <span className="text-[var(--color-muted)] block">Phone</span>
                      <strong className="font-mono text-[var(--color-heading)]">{prospect.phone_number}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--color-muted)] block">Email</span>
                      <span className="text-[var(--color-heading)]">{prospect.email || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[var(--color-muted)] block">CRM Status</span>
                      <strong className="text-[var(--color-heading)]">{prospect.status}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--color-muted)] block">Total Calls</span>
                      <strong className="text-[var(--color-heading)]">{prospect.total_calls || 1}</strong>
                    </div>
                  </div>

                  {prospect.notes && (
                    <div className="pt-2 border-t border-[var(--color-border)]">
                      <span className="text-[var(--color-muted)] block font-semibold mb-1">CRM Notes:</span>
                      <p className="p-2.5 rounded bg-[var(--color-surface-muted)] text-[var(--color-text)] leading-relaxed">
                        {prospect.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
