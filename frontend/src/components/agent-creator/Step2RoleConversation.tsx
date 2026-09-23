import React, { useState, useEffect, useRef } from "react";
import {
  Check,
  Brain,
  Sparkles,
  BookOpen,
  HelpCircle,
  Layers,
  Plus,
  Loader2,
  Briefcase,
  CheckCircle2,
  Tag,
  DollarSign,
  Building2,
  UserCheck,
  Calendar,
  ShieldAlert,
  PhoneForwarded,
  FileText,
  Send,
  Info,
  PackageCheck,
  AlertCircle,
  Lightbulb,
  Copy,
  X
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import { BusinessHoursPicker } from "./BusinessHoursPicker";
import { AVAILABLE_CAPABILITIES } from "./constants";
import { AgentConfig, BusinessServiceItem, AgentServiceItem, KnowledgeDocument } from "../../types";
import { fetchApi } from "../../api-client";
import { toast } from "sonner";

interface Step2RoleConversationProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
  selectedPurposeId: string;
  showValidationErrors?: boolean;
}

const OBJECTIVE_EXAMPLES = [
  {
    title: "Sales & Lead Qualification",
    category: "Inbound / Outbound Sales",
    description: "Ideal for screening prospects and booking appointments.",
    text: "Qualify inbound buyer leads, answer common solution FAQs, and schedule a 15-minute discovery consultation with our sales team."
  },
  {
    title: "Customer Support & Inquiry Routing",
    category: "Support & Care",
    description: "Ideal for order inquiries, account assistance, and helpdesk triage.",
    text: "Assist callers with order tracking and account questions, provide step-by-step troubleshooting, and escalate complex issues to human support."
  },
  {
    title: "Appointment Booking & Reminders",
    category: "Operations & Scheduling",
    description: "Ideal for clinics, salons, repairs, and consultation reminders.",
    text: "Verify caller information, check available calendar slots, confirm appointment bookings or reschedules, and send SMS confirmations."
  }
];

const CAPABILITY_ICONS: Record<string, React.ElementType> = {
  "Answer FAQs": HelpCircle,
  "Collect customer information": UserCheck,
  "Qualify leads": Sparkles,
  "Book appointments": Calendar,
  "Confirm appointments": CheckCircle2,
  "Handle objections": ShieldAlert,
  "Provide product information": Layers,
  "Transfer to a human": PhoneForwarded,
  "Create a support request": FileText,
  "Send SMS follow-up": Send
};

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  "Answer FAQs": "Respond to common customer questions and FAQs.",
  "Collect customer information": "Gather caller details during the conversation.",
  "Qualify leads": "Screen prospects against key qualifying criteria.",
  "Book appointments": "Schedule meetings, visits, or service bookings.",
  "Confirm appointments": "Verify upcoming appointment dates and attendance.",
  "Handle objections": "Address hesitations with concise, value-focused points.",
  "Provide product information": "Explain product features, packages, and pricing.",
  "Transfer to a human": "Escalate the call to a live team member when needed.",
  "Create a support request": "Log helpdesk tickets or CRM follow-ups.",
  "Send SMS follow-up": "Dispatch summary text messages or links after calls."
};

export function Step2RoleConversation({
  agentData,
  setAgentData,
  selectedPurposeId,
  showValidationErrors = false
}: Step2RoleConversationProps) {
  const currentCaps = agentData.skills || [];

  const isObjectiveInvalid = showValidationErrors && (!agentData.objective || !agentData.objective.trim());

  // Sample Objectives Popover State
  const [showSamplePopover, setShowSamplePopover] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const samplePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (samplePopoverRef.current && !samplePopoverRef.current.contains(event.target as Node)) {
        setShowSamplePopover(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCopyExample = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Objective copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleUseExample = (text: string) => {
    setAgentData((prev) => ({ ...prev, objective: text }));
    toast.success("Sample objective applied");
    setShowSamplePopover(false);
  };

  const [isAddingService, setIsAddingService] = useState(false);

  // Custom Skills State
  const [isAddingCustomSkill, setIsAddingCustomSkill] = useState(false);
  const [newCustomSkillName, setNewCustomSkillName] = useState("");
  const [newCustomSkillDesc, setNewCustomSkillDesc] = useState("");

  // Built-in capability IDs set for reference
  const builtinCapIds = new Set(AVAILABLE_CAPABILITIES.map((c) => c.id));
  const customSkillsList = currentCaps.filter((c) => !builtinCapIds.has(c));

  const handleAddCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCustomSkillName.trim();
    if (!trimmedName) return;

    if (currentCaps.includes(trimmedName)) {
      toast.error("This skill is already enabled");
      return;
    }

    const updated = [...currentCaps, trimmedName];
    setAgentData((prev) => ({
      ...prev,
      skills: updated,
      // If a description was provided, also note it in custom_knowledge for prompt alignment
      custom_knowledge: newCustomSkillDesc.trim()
        ? (prev.custom_knowledge ? `${prev.custom_knowledge}\n- [Skill: ${trimmedName}] ${newCustomSkillDesc.trim()}` : `- [Skill: ${trimmedName}] ${newCustomSkillDesc.trim()}`)
        : prev.custom_knowledge
    }));

    toast.success(`Custom skill "${trimmedName}" added`);
    setNewCustomSkillName("");
    setNewCustomSkillDesc("");
    setIsAddingCustomSkill(false);
  };

  const handleRemoveCustomSkill = (skillToRemove: string) => {
    setAgentData((prev) => ({
      ...prev,
      skills: (prev.skills || []).filter((s) => s !== skillToRemove)
    }));
    toast.success(`Removed "${skillToRemove}"`);
  };

  // Documents Library & Scoped RAG State
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    fetchKnowledgeDocuments();
  }, []);

  const fetchKnowledgeDocuments = async () => {
    try {
      setLoadingDocs(true);
      const docs = await fetchApi<KnowledgeDocument[]>("/knowledge/documents");
      if (Array.isArray(docs)) {
        setDocuments(docs);
      }
    } catch (err) {
      console.warn("Could not fetch knowledge documents for step 2:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleKnowledgeModeChange = (mode: 'auto' | 'specific' | 'disabled') => {
    setAgentData((prev) => ({
      ...prev,
      knowledge_mode: mode,
      // If switching to disabled, also set include_business_knowledge appropriately
      include_business_knowledge: mode !== 'disabled'
    }));
  };

  const toggleDocumentSelection = (docId: string) => {
    const current = agentData.attached_document_ids || [];
    const updated = current.includes(docId)
      ? current.filter((id) => id !== docId)
      : [...current, docId];
    setAgentData((prev) => ({
      ...prev,
      knowledge_mode: 'specific',
      attached_document_ids: updated
    }));
  };

  const selectAllDocuments = () => {
    setAgentData((prev) => ({
      ...prev,
      knowledge_mode: 'specific',
      attached_document_ids: documents.map((d) => d.id)
    }));
  };

  const deselectAllDocuments = () => {
    setAgentData((prev) => ({
      ...prev,
      knowledge_mode: 'specific',
      attached_document_ids: []
    }));
  };

  const toggleCapability = (capId: string) => {
    const updated = currentCaps.includes(capId)
      ? currentCaps.filter((c) => c !== capId)
      : [...currentCaps, capId];
    setAgentData((prev) => ({ ...prev, skills: updated }));
  };

  return (
    <div className="space-y-6 text-left">
      {/* 1. Page Section Header */}
      <div className="border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4" />
          </div>
          <h2 className="text-sm sm:text-base font-bold text-[var(--color-heading)] tracking-tight">
            Role &amp; Business Knowledge
          </h2>
          <InfoTooltip
            content="Define what this agent is responsible for, what actions it can take, and what company knowledge it can access during calls."
            position="top"
          />
        </div>
      </div>

      {/* Business Details: what this agent represents; used in greetings ({{company_name}}) and answers */}
      <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-bold text-[var(--color-heading)]">Business Details</label>
          <InfoTooltip
            content="Optional. The business this agent speaks for. The name is used in greetings ({{company_name}}); phone, email, website and address are given to callers who ask."
            position="top"
          />
        </div>
        <div className="space-y-2">
          {/* Row 1: Business Name, Phone, Email (3 columns) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-muted)]">Business Name</span>
              <input
                type="text"
                value={(agentData as any).company_name || ""}
                onChange={(e) => setAgentData((prev) => ({ ...prev, company_name: e.target.value || undefined } as any))}
                placeholder="e.g., Apex Dental & Wellness Clinic"
                className="w-full h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-muted)]">Phone</span>
              <input
                type="tel"
                value={(agentData as any).company_phone || ""}
                onChange={(e) => setAgentData((prev) => ({ ...prev, company_phone: e.target.value || undefined } as any))}
                placeholder="e.g., +1 512 555 0199"
                className="w-full h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-muted)]">Email</span>
              <input
                type="email"
                value={(agentData as any).company_email || ""}
                onChange={(e) => setAgentData((prev) => ({ ...prev, company_email: e.target.value || undefined } as any))}
                placeholder="e.g., hello@apexdental.com"
                className="w-full h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all"
              />
            </div>
          </div>

          {/* Row 2: Website & Address (2 columns) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-muted)]">Website</span>
              <input
                type="text"
                value={(agentData as any).company_website || ""}
                onChange={(e) => setAgentData((prev) => ({ ...prev, company_website: e.target.value || undefined } as any))}
                placeholder="e.g., apexdental.com"
                className="w-full h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-muted)]">Address</span>
              <input
                type="text"
                value={(agentData as any).office_address || ""}
                onChange={(e) => setAgentData((prev) => ({ ...prev, office_address: e.target.value || undefined } as any))}
                placeholder="e.g., 450 Medical Center Blvd, Suite 300, Austin, TX 78701"
                className="w-full h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Agent Business Hours & Timezone — this agent's own schedule */}
      {!(agentData as any).is_orchestrator && (
        <BusinessHoursPicker
          value={(agentData as any).operating_hours}
          onChange={(operating_hours) => setAgentData((prev) => ({ ...prev, operating_hours } as any))}
        />
      )}

      {/* 2. Primary Agent Objective Form Block */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-2.5 relative z-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap relative" ref={samplePopoverRef}>
            <label className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1">
              <span>Primary Agent Objective</span>
              <span className="text-[var(--color-danger)] font-bold text-sm leading-none">*</span>
            </label>
            <InfoTooltip
              content="In 1–2 sentences, define the single most important goal and outcome of every phone call."
              position="top"
            />

            {/* Sample Objectives Interactive Trigger */}
            <button
              type="button"
              onClick={() => setShowSamplePopover(!showSamplePopover)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary-light)]/20 hover:bg-[var(--color-primary-light)]/35 border border-[var(--color-primary)]/25 px-2 py-0.5 rounded-full transition-all cursor-pointer shadow-2xs select-none ml-1"
              title="Click to view 3 actionable sample objectives and copy them"
            >
              <Lightbulb className="w-3 h-3 text-[var(--color-primary)]" />
              <span>Sample Examples</span>
            </button>

            {/* Floating Sample Objectives Interactive Popover */}
            {showSamplePopover && (
              <div className="absolute left-0 top-full mt-2 w-[320px] sm:w-[480px] p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xl z-50 animate-fade-in text-xs space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between pb-2 border-b border-[var(--color-border)]">
                  <div>
                    <h4 className="font-bold text-xs text-[var(--color-heading)] flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Sample Objectives &amp; Writing Guidance</span>
                    </h4>
                    <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                      State the primary goal, actions the agent takes, and the targeted call outcome.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSamplePopover(false)}
                    className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 3 Interactive Cards */}
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-0.5 scrollbar-thin">
                  {OBJECTIVE_EXAMPLES.map((ex, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[var(--color-surface-muted)]/70 hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[11px] text-[var(--color-heading)] flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[9px] flex items-center justify-center font-bold">
                            {idx + 1}
                          </span>
                          <span>{ex.title}</span>
                        </span>
                        <span className="text-[9px] font-medium text-[var(--color-muted)] bg-[var(--color-surface)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                          {ex.category}
                        </span>
                      </div>

                      <p className="text-[11px] text-[var(--color-heading)] bg-[var(--color-surface)] p-2 rounded border border-[var(--color-border)]/80 leading-relaxed font-mono select-all">
                        "{ex.text}"
                      </p>

                      <div className="flex items-center justify-end gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleCopyExample(ex.text, idx)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-heading)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] px-2 py-1 rounded transition-colors cursor-pointer"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUseExample(ex.text)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 px-2.5 py-1 rounded shadow-2xs transition-opacity cursor-pointer"
                        >
                          <span>Use Example</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="text-[10px] text-[var(--color-muted)] font-medium">
            {(agentData.objective || "").length} characters
          </span>
        </div>

        <textarea
          rows={3}
          value={agentData.objective || ""}
          onChange={(e) => setAgentData({ ...agentData, objective: e.target.value })}
          placeholder="e.g. Qualify inbound buyer leads, answer company FAQs, and schedule consultation calls with our sales team."
          className={`w-full p-3 text-xs bg-[var(--color-surface)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] placeholder:text-[var(--color-muted)]/70 focus:outline-none transition-all resize-none leading-relaxed ${
            isObjectiveInvalid
              ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30 bg-[var(--color-primary-light)]/15 animate-shake"
              : "border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-primary)]/15 focus:border-[var(--color-primary)]/60"
          }`}
        />
        {isObjectiveInvalid && (
          <p className="text-[10px] font-medium text-[var(--color-primary)] flex items-center gap-1 mt-1">
            <Info className="w-3 h-3 text-[var(--color-primary)] shrink-0" />
            <span>Please define the primary objective before proceeding.</span>
          </p>
        )}
      </div>

      {/* 3. Conversational Capabilities & Skills */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider flex items-center gap-1.5">
              <span>Conversational Capabilities &amp; Skills</span>
              <InfoTooltip
                content="Enable pre-configured telephony capabilities or define custom conversational skills tailored to your exact business workflow."
                position="top"
              />
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral" size="sm" className="text-[10px] font-semibold">
              {currentCaps.length} Active {customSkillsList.length > 0 ? `(${customSkillsList.length} custom)` : ""}
            </Badge>
            {!isAddingCustomSkill && (
              <button
                type="button"
                onClick={() => setIsAddingCustomSkill(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[var(--color-surface)] text-[var(--color-primary)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] hover:border-[var(--color-primary)]/60 hover:bg-[var(--color-primary-light)]/20 transition-all shadow-2xs"
              >
                <Plus className="w-3 h-3" />
                <span>Add Custom Skill</span>
              </button>
            )}
          </div>
        </div>

        {/* Inline Add Custom Skill Form */}
        {isAddingCustomSkill && (
          <form
            onSubmit={handleAddCustomSkill}
            className="p-3.5 bg-[var(--color-surface-muted)]/70 border border-[var(--color-primary)]/40 rounded-xl space-y-3 animate-fade-in shadow-2xs"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[var(--color-heading)]">Add Custom Agent Skill</h4>
                  <p className="text-[11px] text-[var(--color-muted)]">Define what this custom capability allows the agent to handle during calls.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCustomSkill(false);
                  setNewCustomSkillName("");
                  setNewCustomSkillDesc("");
                }}
                className="text-[var(--color-muted)] hover:text-[var(--color-heading)] p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-[var(--color-heading)]">
                  Skill Title <span className="text-[var(--color-danger)]">*</span>
                </label>
                <input
                  type="text"
                  value={newCustomSkillName}
                  onChange={(e) => setNewCustomSkillName(e.target.value)}
                  placeholder="e.g. Check Order Status, Verify KYC, Offer Special Discount"
                  className="w-full h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-[var(--color-heading)]">
                  Execution Instruction <span className="text-[10px] text-[var(--color-muted)] font-normal">(Optional guidance)</span>
                </label>
                <input
                  type="text"
                  value={newCustomSkillDesc}
                  onChange={(e) => setNewCustomSkillDesc(e.target.value)}
                  placeholder="e.g. Ask for 6-digit order ID and look up delivery ETA"
                  className="w-full h-8 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsAddingCustomSkill(false);
                  setNewCustomSkillName("");
                  setNewCustomSkillDesc("");
                }}
                className="px-3 py-1 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newCustomSkillName.trim()}
                className="px-3.5 py-1 text-xs font-semibold bg-[var(--color-primary)] text-white rounded-[var(--radius-main,0.375rem)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors shadow-2xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Skill</span>
              </button>
            </div>
          </form>
        )}

        {/* Capabilities Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {/* 1. Standard Built-in Capabilities */}
          {AVAILABLE_CAPABILITIES.map((cap) => {
            const isEnabled = currentCaps.includes(cap.id);
            const IconComp = CAPABILITY_ICONS[cap.id] || Sparkles;
            const description = CAPABILITY_DESCRIPTIONS[cap.id] || cap.description;

            return (
              <div
                key={cap.id}
                onClick={() => toggleCapability(cap.id)}
                className={`p-3 rounded-[var(--radius-main,0.5rem)] border transition-all cursor-pointer flex flex-col justify-between gap-2.5 select-none text-left relative ${
                  isEnabled
                    ? "bg-[var(--color-primary)]/[0.04] border-[var(--color-primary)] shadow-2xs ring-1 ring-[var(--color-primary)]/30"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] hover:bg-[var(--color-surface-muted)]/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center shrink-0 transition-colors ${
                        isEnabled
                          ? "bg-[var(--color-primary)] text-white shadow-2xs"
                          : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)]"
                      }`}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="text-xs font-semibold text-[var(--color-heading)] leading-snug truncate">
                      {cap.label}
                    </h4>
                  </div>

                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                      isEnabled
                        ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                        : "border-[var(--color-border-strong,var(--color-border))] bg-[var(--color-surface)]"
                    }`}
                  >
                    {isEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>

                <p className="text-[11px] text-[var(--color-muted)] leading-relaxed line-clamp-2">
                  {description}
                </p>
              </div>
            );
          })}

          {/* 2. Custom User-Defined Capabilities */}
          {customSkillsList.map((skillName) => {
            const isEnabled = currentCaps.includes(skillName);

            return (
              <div
                key={`custom-${skillName}`}
                onClick={() => toggleCapability(skillName)}
                className={`p-3 rounded-[var(--radius-main,0.5rem)] border transition-all cursor-pointer flex flex-col justify-between gap-2.5 select-none text-left relative ${
                  isEnabled
                    ? "bg-gradient-to-br from-[var(--color-primary)]/[0.06] to-transparent border-[var(--color-primary)] shadow-2xs ring-1 ring-[var(--color-primary)]/30"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] hover:bg-[var(--color-surface-muted)]/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-[var(--radius-main,0.375rem)] flex items-center justify-center shrink-0 transition-colors ${
                        isEnabled
                          ? "bg-[var(--color-primary)] text-white shadow-2xs"
                          : "bg-[var(--color-surface-muted)] text-[var(--color-primary)] border border-[var(--color-border)]"
                      }`}
                    >
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-semibold text-[var(--color-heading)] leading-snug truncate">
                          {skillName}
                        </h4>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] uppercase tracking-wider">
                          Custom
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      title="Delete custom skill"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCustomSkill(skillName);
                      }}
                      className="text-[var(--color-muted)] hover:text-[var(--color-danger)] p-0.5 rounded transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isEnabled
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                          : "border-[var(--color-border-strong,var(--color-border))] bg-[var(--color-surface)]"
                      }`}
                    >
                      {isEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-[var(--color-muted)] leading-relaxed line-clamp-2">
                  Custom conversational capability added specifically for this agent.
                </p>
              </div>
            );
          })}
        </div>
      </div>


      {/* 4. Agent Services & Knowledge (per agent; there is no organization-wide profile) */}
      <div className="pt-2">
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-4">
          <div className="flex items-start sm:items-center gap-2.5 pb-3 border-b border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                <span>Knowledge Base Documents</span>
                <InfoTooltip
                  content="Attach specific documents from your Knowledge Base that this agent can search and reference during phone calls."
                  position="top"
                />
              </h3>
              <p className="text-[11px] text-[var(--color-muted)]">
                Attach documents from your Knowledge Base for domain-specific grounding during live calls.
              </p>
            </div>
          </div>
          {/* Attached Knowledge Documents (Scoped RAG) */}
            <div className="p-3.5 bg-[var(--color-surface-muted)]/50 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                      <span>Attached Knowledge Documents (Vector RAG)</span>
                      <InfoTooltip
                        content="Select specific uploaded documents (e.g. Hotel Menu, Clinic FAQs, Real Estate Brochure) to isolate the agent's knowledge search and prevent cross-brand confusion."
                        position="top"
                      />
                    </h4>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Control which document files this agent queries during live conversations.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-[var(--color-surface)] p-1 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => handleKnowledgeModeChange("auto")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-[var(--radius-main,0.25rem)] transition-all cursor-pointer ${
                      (agentData.knowledge_mode || "auto") === "auto"
                        ? "bg-[var(--color-primary)] text-white shadow-2xs font-semibold"
                        : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                    }`}
                  >
                    Auto (All Docs)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKnowledgeModeChange("specific")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-[var(--radius-main,0.25rem)] transition-all cursor-pointer ${
                      agentData.knowledge_mode === "specific"
                        ? "bg-[var(--color-primary)] text-white shadow-2xs font-semibold"
                        : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                    }`}
                  >
                    Specific Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKnowledgeModeChange("disabled")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-[var(--radius-main,0.25rem)] transition-all cursor-pointer ${
                      agentData.knowledge_mode === "disabled"
                        ? "bg-[var(--color-danger)] text-white shadow-2xs font-semibold"
                        : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                    }`}
                  >
                    Disabled
                  </button>
                </div>
              </div>

              {/* Mode Description Banner */}
              {agentData.knowledge_mode === "disabled" ? (
                <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
                    <span>
                      <strong className="text-[var(--color-heading)]">Disabled Mode:</strong> This agent will not query any indexed documents or global company knowledge.
                    </span>
                  </div>
                </div>
              ) : (agentData.knowledge_mode || "auto") === "auto" ? (
                <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                    <span>
                      <strong className="text-[var(--color-heading)]">Auto Mode:</strong> The agent automatically searches across all indexed documents ({documents.length} available) in your organization.
                    </span>
                  </div>
                  <Badge variant="neutral" size="sm" className="text-[10px]">
                    {documents.length} Docs Indexed
                  </Badge>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--color-muted)]">
                      Select the specific documents to attach to this agent:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllDocuments}
                        className="text-[10px] font-medium text-[var(--color-primary)] hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-[10px] text-[var(--color-muted)]">•</span>
                      <button
                        type="button"
                        onClick={deselectAllDocuments}
                        className="text-[10px] font-medium text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:underline cursor-pointer"
                      >
                        Clear Selection
                      </button>
                      <Badge variant="neutral" size="sm" className="text-[10px] ml-1">
                        {(agentData.attached_document_ids || []).length} of {documents.length} Selected
                      </Badge>
                    </div>
                  </div>

                  {loadingDocs ? (
                    <div className="p-6 text-center">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)] mx-auto" />
                      <span className="text-xs text-[var(--color-muted)] mt-2 block">Loading document library...</span>
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="p-4 bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-center space-y-1">
                      <FileText className="w-5 h-5 text-[var(--color-muted)] mx-auto opacity-50" />
                      <p className="text-xs font-medium text-[var(--color-heading)]">No indexed documents found</p>
                      <p className="text-[11px] text-[var(--color-muted)]">
                        Upload PDFs, manuals, or rate cards in <strong className="text-[var(--color-heading)]">Knowledge Base</strong> to attach them here.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {documents.map((doc) => {
                        const isAttached = (agentData.attached_document_ids || []).includes(doc.id);
                        return (
                          <div
                            key={doc.id}
                            onClick={() => toggleDocumentSelection(doc.id)}
                            className={`p-2.5 px-3 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                              isAttached
                                ? "bg-[var(--color-surface)] border-[var(--color-primary)] shadow-2xs ring-1 ring-[var(--color-primary)]/40 font-semibold"
                                : "bg-[var(--color-surface)] border-[var(--color-border)] opacity-75 hover:opacity-100 hover:border-[var(--color-border-strong,var(--color-border))]"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                  isAttached
                                    ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                                    : "border-[var(--color-border-strong,var(--color-border))] bg-[var(--color-surface-muted)]"
                                }`}
                              >
                                {isAttached && <Check className="w-3 h-3 stroke-[2.5]" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <h5 className="text-xs font-bold text-[var(--color-heading)] truncate">
                                    {doc.title || doc.filename}
                                  </h5>
                                  <span className="text-[9px] uppercase px-1 py-0.2 bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)] rounded shrink-0">
                                    {doc.file_type}
                                  </span>
                                </div>
                                <p className="text-[10px] text-[var(--color-muted)] truncate">
                                  {doc.category || "General"} • {doc.total_chunks} chunks
                                </p>
                              </div>
                            </div>

                            <Badge variant={isAttached ? "primary" : "neutral"} size="sm" className="text-[9px] shrink-0">
                              {isAttached ? "Attached" : "Excluded"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
        </div>
      </div>

      {/* 5. Additional Instructions & Custom Knowledge */}
      <div className="pt-2">
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Additional Instructions &amp; Custom Knowledge</span>
                  <InfoTooltip
                    content="Provide specific domain rules, FAQs, guidelines, or custom context unique to this voice agent."
                    position="top"
                  />
                </h3>
              </div>
            </div>
            <Badge variant="neutral" size="sm" className="text-[10px]">
              Optional
            </Badge>
          </div>

          <div className="space-y-1.5 pt-1">
            <textarea
              rows={3}
              value={agentData.custom_knowledge || ""}
              onChange={(e) => setAgentData({ ...agentData, custom_knowledge: e.target.value })}
              placeholder="Example: First-time customers receive a 20% consultation discount. In-person appointments require 24 hours notice."
              className="w-full p-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] placeholder:text-[var(--color-muted)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] leading-relaxed transition-all resize-none"
            />
            <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)]">
              <span>This knowledge is exclusively injected for this specific agent.</span>
              <span>{(agentData.custom_knowledge || "").length} characters</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
