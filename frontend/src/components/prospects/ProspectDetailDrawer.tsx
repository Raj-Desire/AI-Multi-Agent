import React, { useState, useEffect } from "react";
import { Drawer } from "../ui/Drawer";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Prospect, ProspectStatus, CallRecord } from "../../types";
import { fetchApi, invalidateApiCache } from "../../api-client";
import { toast } from "sonner";
import {
  User,
  Phone,
  Mail,
  Building2,
  Briefcase,
  Globe,
  Tag,
  Clock,
  PhoneOutgoing,
  PhoneCall,
  Edit2,
  Trash2,
  ShieldAlert,
  Sparkles,
  MessageSquare,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  Plus,
  ArrowUpRight,
  Folder
} from "lucide-react";

interface ProspectDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  prospect: Prospect | null;
  onEdit: (prospect: Prospect) => void;
  onDelete: (prospect: Prospect) => void;
  onCall: (prospect: Prospect) => void;
  onProspectUpdated: (updated: Prospect) => void;
}

const STATUS_LIST: ProspectStatus[] = [
  "New",
  "Contacted",
  "Connected",
  "Interested",
  "Not Interested",
  "Callback Requested",
  "Qualified",
  "Converted",
  "Do Not Contact",
  "Invalid",
];

export function ProspectDetailDrawer({
  isOpen,
  onClose,
  prospect,
  onEdit,
  onDelete,
  onCall,
  onProspectUpdated,
}: ProspectDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "calls">("overview");
  const [calls, setCalls] = useState<any[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [newTagText, setNewTagText] = useState("");
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  useEffect(() => {
    if (isOpen && prospect) {
      loadCalls();
    }
  }, [isOpen, prospect]);

  const loadCalls = async () => {
    if (!prospect) return;
    try {
      setLoadingCalls(true);
      const res = await fetchApi<any[]>(`/prospects/${prospect.id}/calls`);
      setCalls(res || []);
    } catch (err: any) {
      console.error("Failed to load prospect calls:", err);
    } finally {
      setLoadingCalls(false);
    }
  };

  if (!prospect) return null;

  const isDNC = prospect.is_dnc || prospect.status === "Do Not Contact";

  const handleStatusChange = async (newStatus: ProspectStatus) => {
    try {
      setIsChangingStatus(true);
      const updated = await fetchApi<Prospect>(`/prospects/${prospect.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Status updated to "${newStatus}".`);
      invalidateApiCache("/prospects");
      onProspectUpdated(updated);
    } catch (err: any) {
      toast.error(err.message || "Failed to update status.");
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleAddTag = async () => {
    const clean = newTagText.trim();
    if (!clean) return;
    try {
      const updated = await fetchApi<Prospect>(`/prospects/${prospect.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag: clean }),
      });
      setNewTagText("");
      toast.success(`Tag "${clean}" added.`);
      invalidateApiCache("/prospects");
      onProspectUpdated(updated);
    } catch (err: any) {
      toast.error(err.message || "Failed to add tag.");
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    try {
      const updated = await fetchApi<Prospect>(`/prospects/${prospect.id}/tags/${encodeURIComponent(tagToRemove)}`, {
        method: "DELETE",
      });
      toast.success(`Tag "${tagToRemove}" removed.`);
      invalidateApiCache("/prospects");
      onProspectUpdated(updated);
    } catch (err: any) {
      toast.error(err.message || "Failed to remove tag.");
    }
  };

  const getStatusBadgeVariant = (st: string) => {
    switch (st) {
      case "Qualified":
      case "Converted":
        return "success";
      case "Interested":
      case "Connected":
        return "primary";
      case "Callback Requested":
        return "warning";
      case "Do Not Contact":
      case "Invalid":
        return "danger";
      default:
        return "neutral";
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={prospect.full_name}
      description={prospect.company ? `${prospect.job_title ? `${prospect.job_title} at ` : ""}${prospect.company}` : "Contact Profile"}
      size="lg"
    >
      <div className="space-y-4 text-xs text-left">
        {/* DNC Banner if active */}
        {isDNC && (
          <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Do Not Contact (DNC) Active</p>
              <p className="text-[11px] leading-relaxed mt-0.5">
                This contact is marked on your Do Not Contact list. Automated and manual AI voice calling is strictly blocked.
              </p>
            </div>
          </div>
        )}

        {/* Quick Action Toolbar */}
        <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--color-muted)]">Status:</span>
            <select
              value={prospect.status}
              onChange={(e) => handleStatusChange(e.target.value as ProspectStatus)}
              disabled={isChangingStatus}
              className="px-2.5 py-1 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-heading)]"
            >
              {STATUS_LIST.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant={isDNC ? "outline" : "primary"}
              size="sm"
              disabled={isDNC}
              onClick={() => onCall(prospect)}
              leftIcon={<PhoneOutgoing className="w-3.5 h-3.5" />}
            >
              {isDNC ? "Blocked (DNC)" : "Call Contact"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(prospect)}
              leftIcon={<Edit2 className="w-3.5 h-3.5" />}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => onDelete(prospect)}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`pb-2 px-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "overview"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-heading)]"
            }`}
          >
            Contact Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("calls")}
            className={`pb-2 px-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "calls"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-heading)]"
            }`}
          >
            <span>Call History &amp; Analytics</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[var(--color-surface-muted)] text-[var(--color-muted)] font-mono">
              {calls.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Contact & Business Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-2">
                <div className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  <span>Contact Details</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="text-[var(--color-muted)] block text-[10px]">Primary Phone</span>
                    <span className="font-mono font-medium text-[var(--color-heading)]">{prospect.phone_number}</span>
                  </div>
                  {prospect.alternate_phone && (
                    <div>
                      <span className="text-[var(--color-muted)] block text-[10px]">Alternate Phone</span>
                      <span className="font-mono text-[var(--color-heading)]">{prospect.alternate_phone}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[var(--color-muted)] block text-[10px]">Email Address</span>
                    <span className="text-[var(--color-heading)]">{prospect.email || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[10px]">Contact Group / List</span>
                    {prospect.group_name ? (
                      <span className="inline-flex items-center gap-1 font-medium text-[var(--color-primary)]">
                        <Folder className="w-3 h-3" />
                        <span>{prospect.group_name}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted)]">—</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[10px]">Assigned Owner</span>
                    <span className="text-[var(--color-heading)]">{prospect.assigned_owner || "Unassigned"}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-2">
                <div className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Business Info</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="text-[var(--color-muted)] block text-[10px]">Company</span>
                    <span className="font-medium text-[var(--color-heading)]">{prospect.company || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[10px]">Job Title</span>
                    <span className="text-[var(--color-heading)]">{prospect.job_title || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[10px]">Industry</span>
                    <span className="text-[var(--color-heading)]">{prospect.industry || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[10px]">Website</span>
                    {prospect.website ? (
                      <a
                        href={prospect.website.startsWith("http") ? prospect.website : `https://${prospect.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-primary)] hover:underline flex items-center gap-1"
                      >
                        <span>{prospect.website}</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tags Card */}
            <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>Contact Tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {prospect.tags && prospect.tags.length > 0 ? (
                  prospect.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-primary-light)] text-[var(--color-primary)] border border-[var(--color-primary)]/20"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="hover:text-[var(--color-danger)] cursor-pointer text-xs"
                      >
                        &times;
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-[var(--color-muted)] italic">No tags assigned.</span>
                )}
              </div>

              {/* Quick Tag Adder */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                <input
                  type="text"
                  placeholder="New tag..."
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-heading)]"
                />
                <Button variant="outline" size="sm" onClick={handleAddTag} leftIcon={<Plus className="w-3 h-3" />}>
                  Add
                </Button>
              </div>
            </div>

            {/* Custom Fields Card */}
            {prospect.custom_fields && Object.keys(prospect.custom_fields).length > 0 && (
              <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-2">
                <div className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Custom Attributes &amp; Campaign Parameters</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(prospect.custom_fields).map(([k, v]) => (
                    <div key={k} className="p-2 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
                      <span className="text-[10px] font-mono text-[var(--color-muted)] block">{k}</span>
                      <span className="font-semibold text-[var(--color-heading)] text-xs truncate block">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes Card */}
            <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-1.5">
              <div className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>Internal Notes</span>
              </div>
              <p className="text-xs text-[var(--color-heading)] leading-relaxed whitespace-pre-wrap">
                {prospect.notes || <span className="text-[var(--color-muted)] italic">No notes recorded.</span>}
              </p>
            </div>

            {/* Call Counters & Metadata */}
            <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-[var(--color-muted)] block">Total Calls</span>
                <span className="text-sm font-bold text-[var(--color-heading)]">{prospect.total_calls}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--color-muted)] block">Successful</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{prospect.successful_calls}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--color-muted)] block">Last Contacted</span>
                <span className="text-xs font-medium text-[var(--color-heading)]">
                  {prospect.last_contacted_at ? new Date(prospect.last_contacted_at).toLocaleDateString() : "Never"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Call Activity Timeline */}
        {activeTab === "calls" && (
          <div className="space-y-3">
            {loadingCalls ? (
              <div className="py-8 text-center text-[var(--color-muted)]">
                Loading call history...
              </div>
            ) : calls.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2">
                <PhoneCall className="w-8 h-8 mx-auto text-[var(--color-muted)] opacity-50" />
                <p className="font-semibold text-[var(--color-heading)]">No calls placed to this contact yet</p>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Initiate a call using any available AI voice agent to engage this prospect.
                </p>
                {!isDNC && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onCall(prospect)}
                    leftIcon={<PhoneOutgoing className="w-3.5 h-3.5" />}
                  >
                    Place First AI Call
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {calls.map((call) => (
                  <div
                    key={call.id}
                    className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-2.5"
                  >
                    {/* Call Header */}
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                      <div className="flex items-center gap-2">
                        <PhoneCall className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span className="font-semibold text-[var(--color-heading)] text-xs">
                          {call.agent_name || "AI Voice Call"}
                        </span>
                        <Badge variant={call.status === "completed" ? "success" : "neutral"}>
                          {call.status}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-[var(--color-muted)] font-mono">
                        {new Date(call.created_at).toLocaleString()}
                      </span>
                    </div>

                    {/* Analytics / Outcome Row */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-[var(--color-surface-muted)] text-[var(--color-muted)]">
                        Duration: <strong>{call.duration || 0}s</strong>
                      </span>
                      {call.outcome && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                          Outcome: {call.outcome}
                        </span>
                      )}
                      {call.lead_score !== undefined && call.lead_score !== null && (
                        <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium">
                          Lead Score: {call.lead_score}/100
                        </span>
                      )}
                      {call.sentiment && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          Sentiment: {call.sentiment}
                        </span>
                      )}
                    </div>

                    {/* Summary if available */}
                    {call.summary && (
                      <div className="p-2 rounded bg-[var(--color-surface-muted)] text-[11px] text-[var(--color-heading)] leading-relaxed">
                        <strong className="text-[var(--color-muted)] block text-[10px] uppercase">AI Summary:</strong>
                        {call.summary}
                      </div>
                    )}

                    {/* Key Insights */}
                    {call.key_insights && call.key_insights.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold uppercase text-[var(--color-muted)]">Key Insights:</span>
                        <ul className="list-disc list-inside text-[11px] text-[var(--color-muted)] space-y-0.5">
                          {call.key_insights.map((ins: string, idx: number) => (
                            <li key={idx}>{ins}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Transcript Preview */}
                    {call.transcript && call.transcript.length > 0 && (
                      <div className="pt-2 border-t border-[var(--color-border)]">
                        <span className="text-[10px] font-semibold uppercase text-[var(--color-muted)] mb-1 block">
                          Transcript turns ({call.transcript.length} turns):
                        </span>
                        <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 rounded bg-[var(--color-background)] border border-[var(--color-border)]">
                          {call.transcript.map((msg: any, idx: number) => (
                            <div
                              key={idx}
                              className={`p-1.5 rounded text-[11px] ${
                                msg.role === "assistant"
                                  ? "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border-l-2 border-[var(--color-primary)]"
                                  : "bg-[var(--color-primary-light)]/40 text-[var(--color-heading)] border-l-2 border-emerald-500"
                              }`}
                            >
                              <span className="font-semibold text-[10px] uppercase text-[var(--color-muted)] mr-1">
                                {msg.role === "assistant" ? (call.agent_name || "Agent") : "Prospect"}:
                              </span>
                              <span>{msg.content}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
