import React, { useState, useEffect } from "react";
import { fetchApi } from "../../api-client";
import {
  LeadDetailResponse,
  LeadActionRequest,
  ConversationTurnMessage
} from "../../types";
import {
  X,
  Sparkles,
  Flame,
  Phone,
  Building,
  Mail,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  ArrowRight,
  User,
  Bot,
  Copy,
  Check,
  Tag,
  Save,
  Megaphone,
  History,
  FileText,
  PhoneForwarded,
  MessageSquare,
  Search
} from "lucide-react";
import { Button } from "../ui/Button";
import { toast } from "sonner";

interface LeadDetailDrawerProps {
  prospectId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
  onQuickCall?: (phoneNumber: string) => void;
}

export function LeadDetailDrawer({
  prospectId,
  isOpen,
  onClose,
  onLeadUpdated,
  onQuickCall,
}: LeadDetailDrawerProps) {
  const [detail, setDetail] = useState<LeadDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copiedTranscript, setCopiedTranscript] = useState<boolean>(false);

  // Active sub-tab in drawer: "summary" | "transcript" | "history" | "actions"
  const [drawerTab, setDrawerTab] = useState<"summary" | "transcript" | "history" | "actions">("summary");

  // Follow-up Action Form State
  const [newStatus, setNewStatus] = useState<string>("");
  const [newNote, setNewNote] = useState<string>("");
  const [newCallbackDate, setNewCallbackDate] = useState<string>("");
  const [newTagInput, setNewTagInput] = useState<string>("");
  const [tagsList, setTagsList] = useState<string[]>([]);
  const [transcriptSearch, setTranscriptSearch] = useState<string>("");

  useEffect(() => {
    if (isOpen && prospectId) {
      loadLeadDetail(prospectId);
    } else {
      setDetail(null);
    }
  }, [isOpen, prospectId]);

  const loadLeadDetail = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetchApi<LeadDetailResponse>(`/lead-intelligence/leads/${id}`);
      if (res) {
        setDetail(res);
        setNewStatus(res.prospect?.status || "Interested");
        setTagsList(res.prospect?.tags || []);
        setNewCallbackDate(res.callback_datetime || "");
      }
    } catch (err) {
      toast.error("Failed to load lead intelligence details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveActions = async () => {
    if (!prospectId) return;
    setIsSaving(true);
    try {
      const payload: LeadActionRequest = {
        status: newStatus,
        note: newNote.trim() || undefined,
        callback_datetime: newCallbackDate.trim() || undefined,
        tags: tagsList,
      };

      await fetchApi(`/lead-intelligence/leads/${prospectId}/action`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast.success("Lead follow-up action saved successfully!");
      setNewNote("");
      if (onLeadUpdated) onLeadUpdated();
      loadLeadDetail(prospectId);
    } catch (err) {
      toast.error("Failed to update lead action.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyTranscript = () => {
    if (!detail?.transcript) return;
    const text = detail.transcript
      .map((t) => `${(t.role || "SPEAKER").toUpperCase()}: ${t.content || (t as any).text || ""}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    toast.success("Full transcript copied to clipboard.");
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const handleAddTag = () => {
    if (newTagInput.trim() && !tagsList.includes(newTagInput.trim())) {
      setTagsList([...tagsList, newTagInput.trim()]);
      setNewTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsList(tagsList.filter((t) => t !== tagToRemove));
  };

  if (!isOpen) return null;

  const filteredTranscript = (detail?.transcript || []).filter((turn) => {
    if (!transcriptSearch.trim()) return true;
    const query = transcriptSearch.toLowerCase();
    const content = (turn.content || (turn as any).text || "").toLowerCase();
    return content.includes(query);
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in-50">
      <div
        className="w-full max-w-2xl h-full bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-250 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header Bar */}
        <div className="p-4 sm:p-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-start justify-between gap-4 sticky top-0 z-10">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-heading)] truncate">
                {isLoading ? "Loading Lead..." : detail?.prospect?.full_name || "Lead Details"}
              </h2>
              {detail && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {detail.business_outcome}
                </span>
              )}
            </div>

            {detail && (
              <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] flex-wrap">
                {detail.prospect?.company && (
                  <span className="flex items-center gap-1 font-medium text-[var(--color-text)]">
                    <Building className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                    <span>{detail.prospect.company}</span>
                  </span>
                )}
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                  <span>{detail.prospect?.phone_number}</span>
                </span>
                {detail.campaign_name && (
                  <span className="flex items-center gap-1 text-[var(--color-primary)] font-medium">
                    <Megaphone className="w-3.5 h-3.5" />
                    <span>{detail.campaign_name}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {detail?.prospect?.phone_number && onQuickCall && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onQuickCall(detail.prospect.phone_number)}
                leftIcon={<Phone className="w-3.5 h-3.5 text-emerald-500" />}
                className="cursor-pointer"
              >
                Call
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-[var(--radius-main,0.375rem)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]/40 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex border-b border-[var(--color-border)] px-4 sm:px-5 bg-[var(--color-background)]/50 text-xs font-medium gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setDrawerTab("summary")}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              drawerTab === "summary"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Intelligence</span>
          </button>
          <button
            onClick={() => setDrawerTab("transcript")}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              drawerTab === "transcript"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Full Transcript ({detail?.transcript?.length || 0})</span>
          </button>
          <button
            onClick={() => setDrawerTab("history")}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              drawerTab === "history"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Call History ({detail?.call_history?.length || 0})</span>
          </button>
          <button
            onClick={() => setDrawerTab("actions")}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              drawerTab === "actions"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Follow-up Actions</span>
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin">
          {isLoading ? (
            <div className="space-y-4 py-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-[var(--color-border)]/40 rounded animate-pulse" />
              ))}
            </div>
          ) : !detail ? (
            <div className="text-center py-12 text-xs text-[var(--color-muted)]">
              Lead information could not be retrieved.
            </div>
          ) : (
            <>
              {/* TAB 1: SUMMARY & AI INTELLIGENCE */}
              {drawerTab === "summary" && (
                <div className="space-y-5 text-xs">
                  {/* "Why is this lead highlighted" Section */}
                  {detail.highlight_reasons && detail.highlight_reasons.length > 0 && (
                    <div className="p-3.5 rounded-[var(--radius-main,0.5rem)] bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--color-heading)]">
                        <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                        <span>Why this lead is highlighted</span>
                      </div>
                      <div className="space-y-1.5">
                        {detail.highlight_reasons.map((h, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-[var(--color-text)]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{h.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Call Summary Card */}
                  <div className="p-4 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                      <span className="font-bold text-xs text-[var(--color-heading)]">
                        AI Call Analysis
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                          Lead Viability Score:
                        </span>
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          {detail.lead_score}/100
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-[var(--color-text)] leading-relaxed italic bg-[var(--color-background)]/60 p-3 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]/50">
                      "{detail.summary || "Conversation completed. Customer expressed interest in features and services."}"
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
                      <div className="p-2 rounded bg-[var(--color-background)]/50 border border-[var(--color-border)]/40">
                        <div className="text-[10px] text-[var(--color-muted)]">Detected Intent</div>
                        <div className="font-semibold text-[var(--color-heading)] truncate mt-0.5">
                          {detail.intent || "Product Inquiry"}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-[var(--color-background)]/50 border border-[var(--color-border)]/40">
                        <div className="text-[10px] text-[var(--color-muted)]">Customer Sentiment</div>
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {detail.sentiment || "Positive"}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-[var(--color-background)]/50 border border-[var(--color-border)]/40">
                        <div className="text-[10px] text-[var(--color-muted)]">AI Voice Agent</div>
                        <div className="font-semibold text-[var(--color-heading)] truncate mt-0.5">
                          {detail.agent_name || "AI Voice Assistant"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Key Requirements */}
                  {detail.key_requirements && detail.key_requirements.length > 0 && (
                    <div className="p-4 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
                      <h4 className="font-bold text-xs text-[var(--color-heading)] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                        <span>Key Requirements Identified</span>
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-xs text-[var(--color-text)] pl-1">
                        {detail.key_requirements.map((req, i) => (
                          <li key={i}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Customer Questions */}
                  {detail.customer_questions && detail.customer_questions.length > 0 && (
                    <div className="p-4 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
                      <h4 className="font-bold text-xs text-[var(--color-heading)] flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-purple-500" />
                        <span>Questions Asked by Customer</span>
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-xs text-[var(--color-text)] pl-1">
                        {detail.customer_questions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Objections & Competitive Context */}
                  {detail.objections && detail.objections.length > 0 && (
                    <div className="p-4 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
                      <h4 className="font-bold text-xs text-[var(--color-heading)] flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-amber-500" />
                        <span>Objections / Competitive Discussion</span>
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-xs text-[var(--color-text)] pl-1">
                        {detail.objections.map((obj, i) => (
                          <li key={i}>{obj}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommended Next Action Card */}
                  <div className="p-4 rounded-[var(--radius-main,0.5rem)] bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-primary)]/5 border border-[var(--color-primary)]/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[var(--color-heading)] flex items-center gap-1.5">
                        <ArrowRight className="w-4 h-4 text-[var(--color-primary)]" />
                        <span>Recommended Next Action</span>
                      </span>
                      {detail.callback_datetime && (
                        <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                          {detail.callback_datetime}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-[var(--color-primary)]">
                      {detail.next_action || "Follow up with customer to confirm proposal."}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: FULL TRANSCRIPT */}
              {drawerTab === "transcript" && (
                <div className="space-y-3 text-xs">
                  {/* Transcript Toolbar */}
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                      <input
                        type="text"
                        placeholder="Search transcript..."
                        value={transcriptSearch}
                        onChange={(e) => setTranscriptSearch(e.target.value)}
                        className="w-full pl-8 pr-2 py-1 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded text-[var(--color-text)]"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyTranscript}
                      leftIcon={copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      className="cursor-pointer text-xs"
                    >
                      {copiedTranscript ? "Copied" : "Copy"}
                    </Button>
                  </div>

                  {/* Transcript Turns List */}
                  {filteredTranscript.length === 0 ? (
                    <div className="text-center py-10 text-xs text-[var(--color-muted)]">
                      No matching transcript turns.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredTranscript.map((turn, idx) => {
                        const isAgent = turn.role === "assistant" || (turn.role as string) === "agent";
                        const speakerLabel = isAgent ? (detail.agent_name || "AI Voice Agent") : (detail.prospect.full_name || "Customer");
                        const contentText = turn.content || (turn as any).text || "";

                        return (
                          <div
                            key={idx}
                            className={`p-3 rounded-[var(--radius-main,0.5rem)] border flex flex-col space-y-1 ${
                              isAgent
                                ? "bg-[var(--color-surface)] border-[var(--color-border)] ml-2"
                                : "bg-[var(--color-primary)]/5 border-[var(--color-primary)]/20 mr-2"
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)]">
                              <span className="font-bold flex items-center gap-1 text-[var(--color-heading)]">
                                {isAgent ? <Bot className="w-3 h-3 text-[var(--color-primary)]" /> : <User className="w-3 h-3 text-emerald-500" />}
                                <span>{speakerLabel}</span>
                              </span>
                              {turn.timestamp && (
                                <span className="font-mono">{turn.timestamp}</span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
                              {contentText}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CALL HISTORY */}
              {drawerTab === "history" && (
                <div className="space-y-3 text-xs">
                  <h4 className="font-bold text-xs text-[var(--color-heading)] pb-2 border-b border-[var(--color-border)]">
                    Past Interaction Timeline
                  </h4>

                  {detail.call_history.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[var(--color-muted)]">
                      No historical calls recorded.
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--color-border)]">
                      {detail.call_history.map((hist, idx) => (
                        <div key={idx} className="relative space-y-1">
                          {/* Dot marker */}
                          <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-[var(--color-primary)] ring-4 ring-[var(--color-surface)]" />

                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[var(--color-heading)]">
                              {hist.outcome}
                            </span>
                            <span className="text-[11px] text-[var(--color-muted)] font-mono">
                              {new Date(hist.created_at).toLocaleString()}
                            </span>
                          </div>

                          <div className="text-[11px] text-[var(--color-muted)]">
                            Talking time: {hist.duration}s &bull; Handled by {hist.agent_name || "AI Agent"}
                          </div>

                          {hist.summary && (
                            <p className="text-xs text-[var(--color-text)] bg-[var(--color-background)]/60 p-2.5 rounded border border-[var(--color-border)]/50">
                              {hist.summary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: ACTIONS & CRM UPDATES */}
              {drawerTab === "actions" && (
                <div className="space-y-4 text-xs">
                  {/* Status update */}
                  <div>
                    <label className="block font-semibold text-[var(--color-heading)] mb-1">
                      Lead CRM Status
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
                    >
                      <option value="New">New</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Interested">Interested</option>
                      <option value="Callback Requested">Callback Requested</option>
                      <option value="Not Interested">Not Interested</option>
                      <option value="Do Not Contact">Do Not Call (DNC)</option>
                    </select>
                  </div>

                  {/* Callback date */}
                  <div>
                    <label className="block font-semibold text-[var(--color-heading)] mb-1">
                      Scheduled Follow-up / Callback
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Tomorrow at 11:00 AM or 2026-09-05"
                      value={newCallbackDate}
                      onChange={(e) => setNewCallbackDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
                    />
                  </div>

                  {/* Notes update */}
                  <div>
                    <label className="block font-semibold text-[var(--color-heading)] mb-1">
                      Add Follow-up Note
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Add follow-up notes, sales updates, or team instructions..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block font-semibold text-[var(--color-heading)] mb-1">
                      Tags
                    </label>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Add tag..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        className="flex-1 px-3 py-1.5 text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-text)]"
                      />
                      <Button variant="outline" size="sm" onClick={handleAddTag} className="cursor-pointer">
                        Add
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {tagsList.map((t, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-border)] text-[var(--color-text)] font-medium"
                        >
                          <span>{t}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(t)}
                            className="hover:text-rose-500 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveActions}
                      disabled={isSaving}
                      leftIcon={<Save className="w-4 h-4" />}
                      className="w-full font-bold cursor-pointer"
                    >
                      {isSaving ? "Saving..." : "Save CRM Changes"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Sticky Footer */}
        <div className="p-3.5 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between text-xs text-[var(--color-muted)]">
          <div>
            Lead ID: <span className="font-mono">{prospectId}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
