import React, { useState, useEffect } from "react";
import { fetchApi } from "../api-client";
import { useAuth } from "../context/AuthContext";
import { CompanyBusinessProfile, BusinessServiceItem, CompanyFAQItem } from "../types";
import {
  Building2,
  MapPin,
  Clock,
  Mail,
  Phone,
  Globe,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Briefcase,
  Layers,
  Sparkles,
  Lock,
  ShieldCheck,
  Brain
} from "lucide-react";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Modal } from "./ui/Modal";
import { PageHeader } from "./ui/PageHeader";
import { LoadingState } from "./ui/LoadingState";
import { getAllWorldTimezones } from "../utils/timezones";
import { toast } from "sonner";

export function BusinessProfileView() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const allTimezones = React.useMemo(() => getAllWorldTimezones(), []);
  const [profile, setProfile] = useState<CompanyBusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"company" | "services" | "hours" | "faqs">("company");

  // Delete confirmation modal state
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{
    type: "faq" | "service";
    index: number;
    title: string;
  } | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // Determine editing privileges
  const canEdit = isAdmin || isSuperAdmin || (profile?.allow_user_edits ?? false);

  // New Service Modal state
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDesc, setNewServiceDesc] = useState("");

  // New FAQ state
  const [newFAQQuestion, setNewFAQQuestion] = useState("");
  const [newFAQAnswer, setNewFAQAnswer] = useState("");
  const [newFAQCategory, setNewFAQCategory] = useState("General");

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      const res = await fetchApi<CompanyBusinessProfile>("/business-profile");
      if (res) {
        setProfile(res);
      }
    } catch (err: any) {
      console.error("Failed to load business profile:", err);
      toast.error("Failed to load company profile.");
    } finally {
      setLoading(false);
    }
  }

  async function persistProfile(updated: CompanyBusinessProfile, successMsg?: string) {
    setProfile(updated);
    try {
      setSaving(true);
      const saved = await fetchApi<CompanyBusinessProfile>("/business-profile", {
        method: "POST",
        body: JSON.stringify(updated)
      });
      if (saved) {
        setProfile(saved);
        if (successMsg) {
          toast.success(successMsg);
        }
      }
    } catch (err: any) {
      console.error("Failed to save profile:", err);
      toast.error(err.message || "Failed to persist changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProfile() {
    if (!profile) return;
    try {
      setSaving(true);
      const saved = await fetchApi<CompanyBusinessProfile>("/business-profile", {
        method: "POST",
        body: JSON.stringify(profile)
      });
      if (saved) {
        setProfile(saved);
        toast.success("Business profile & Knowledge Base saved successfully!", {
          description: "All active voice agents will now use these updated company details during calls."
        });
      }
    } catch (err: any) {
      console.error("Failed to save profile:", err);
      toast.error(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const addService = async () => {
    if (!newServiceName.trim() || !profile) return;
    const newService: BusinessServiceItem = {
      name: newServiceName.trim(),
      description: newServiceDesc.trim(),
      enabled: true
    };
    const updated: CompanyBusinessProfile = {
      ...profile,
      services: [...(profile.services || []), newService]
    };
    setNewServiceName("");
    setNewServiceDesc("");
    await persistProfile(updated, `Service "${newService.name}" added and saved!`);
  };

  const addFAQ = async () => {
    if (!newFAQQuestion.trim() || !newFAQAnswer.trim() || !profile) return;
    const newFaq: CompanyFAQItem = {
      question: newFAQQuestion.trim(),
      answer: newFAQAnswer.trim(),
      category: newFAQCategory,
      enabled: true
    };
    const updated: CompanyBusinessProfile = {
      ...profile,
      faqs: [...(profile.faqs || []), newFaq]
    };
    setNewFAQQuestion("");
    setNewFAQAnswer("");
    await persistProfile(updated, "FAQ added and saved to Knowledge Base!");
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmItem || !profile) return;
    try {
      setIsDeletingItem(true);
      if (deleteConfirmItem.type === "faq") {
        const updatedFaqs = [...(profile.faqs || [])];
        updatedFaqs.splice(deleteConfirmItem.index, 1);
        const updatedProfile = { ...profile, faqs: updatedFaqs };
        await persistProfile(updatedProfile, `Deleted FAQ "${deleteConfirmItem.title}"`);
      } else if (deleteConfirmItem.type === "service") {
        const updatedServices = [...(profile.services || [])];
        updatedServices.splice(deleteConfirmItem.index, 1);
        const updatedProfile = { ...profile, services: updatedServices };
        await persistProfile(updatedProfile, `Deleted service "${deleteConfirmItem.title}"`);
      }
      setDeleteConfirmItem(null);
    } finally {
      setIsDeletingItem(false);
    }
  };

  if (loading) {
    return (
      <LoadingState
        message="Loading Company Knowledge Base..."
        subMessage="Fetching verified business profile & telephony facts"
        size="md"
      />
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-left pb-16">
      {/* Header */}
      <PageHeader
        title="Company Business Profile & Knowledge Base"
        description="Single central knowledge base for your entire organization. Configure services, office address, operating hours, and custom FAQs used across all voice agents."
        badge={
          <div className="flex items-center gap-1.5">
            <Badge variant="primary" className="gap-1.5 py-1 px-2.5">
              <Brain className="w-3.5 h-3.5 text-amber-300" />
              Live Voice Brain
            </Badge>
            {!canEdit && (
              <Badge variant="neutral" className="text-[10px] py-1 px-2 gap-1 flex items-center">
                <Lock className="w-3 h-3 text-[var(--color-muted)]" />
                Read-Only
              </Badge>
            )}
          </div>
        }
        actions={
          canEdit ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSaveProfile}
              disabled={saving}
              leftIcon={<Save className="w-4 h-4" />}
              className="cursor-pointer font-semibold shadow-xs"
            >
              {saving ? "Saving Changes..." : "Save Knowledge Base"}
            </Button>
          ) : undefined
        }
      />

      {/* Admin Permission Control Card */}
      {(isAdmin || isSuperAdmin) && (
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-[var(--color-surface)] to-[var(--color-surface-muted)]/50">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--color-primary)]" />
                User Access Control
              </span>
              <Badge variant={profile.allow_user_edits ? "success" : "neutral"} className="text-[10px] py-0 px-1.5 font-semibold">
                {profile.allow_user_edits ? "Users Can Edit" : "Users are Read-Only"}
              </Badge>
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              {profile.allow_user_edits
                ? "Standard team members in your organization are allowed to edit and save this knowledge base."
                : "Standard team members have Read-Only view of this knowledge base and cannot modify facts."}
            </p>
          </div>

          <label className="flex items-center gap-2.5 p-2 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] cursor-pointer hover:border-[var(--color-primary)] transition-colors shrink-0">
            <input
              type="checkbox"
              checked={profile.allow_user_edits ?? false}
              onChange={(e) => {
                const nextVal = e.target.checked;
                setProfile({
                  ...profile,
                  allow_user_edits: nextVal
                });
                if (nextVal) {
                  toast.success("User editing enabled", { description: "Organization team members can now modify company facts." });
                } else {
                  toast.info("User editing disabled", { description: "Organization team members now have read-only access." });
                }
              }}
              className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
            />
            <span className="text-xs font-semibold text-[var(--color-heading)]">
              Allow Users to Edit
            </span>
          </label>
        </div>
      )}

      {/* Read-Only Notice for Non-Admin when locked */}
      {!canEdit && (
        <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-xs text-[var(--color-muted)] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[var(--color-muted)] shrink-0" />
          <span>You have <strong>Read-Only</strong> access to the organization knowledge base. Only organization administrators can modify these shared company facts.</span>
        </div>
      )}

      {/* Nav Tabs */}
      <div className="flex border-b border-[var(--color-border)] gap-2">
        {[
          { id: "company" as const, label: "Company & Identity", icon: Building2 },
          { id: "services" as const, label: "Services & Products", icon: Briefcase, count: profile.services?.length || 0 },
          { id: "hours" as const, label: "Office Address & Hours", icon: MapPin },
          { id: "faqs" as const, label: "Company FAQs & Facts", icon: HelpCircle, count: profile.faqs?.length || 0 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                isActive
                  ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="px-1.5 py-0.2 bg-[var(--color-surface-muted)] rounded-full text-[10px] font-mono">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Company Identity */}
      {activeTab === "company" && (
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-4">
          <div className="border-b border-[var(--color-border)]/60 pb-3">
            <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
              Company Identity & Spoken Introduction
            </h3>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              The AI uses this introduction when callers ask what your company does.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Company Name <span className="text-[var(--color-danger)]">*</span>
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.company_name}
                onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                placeholder="e.g. Acme Technologies"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Tagline / Business Pitch
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.tagline || ""}
                onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
                placeholder="e.g. Real-Time Conversational AI & Telephony Solutions"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Company Spoken Introduction (1–2 Sentences)
            </label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={profile.company_introduction}
              onChange={(e) => setProfile({ ...profile, company_introduction: e.target.value })}
              placeholder="e.g., We specialize in autonomous voice AI agents and cloud telephony integrations that help businesses automate customer support and lead qualification."
              className={`w-full p-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] leading-relaxed font-medium ${
                !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
              }`}
            />
            <p className="text-[11px] text-[var(--color-muted)]">
              Tip: Keep this concise so the AI can explain the company naturally over the phone.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--color-border)]/60">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Support Email
              </label>
              <input
                type="email"
                disabled={!canEdit}
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="support@example.com"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Contact Phone
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+1 (555) 019-2834"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Official Website
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.website || ""}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                placeholder="https://example.com"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Services */}
      {activeTab === "services" && (
        <div className="space-y-4">
          {canEdit && (
            <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
                Add New Service / Product
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-1">
                  <input
                    type="text"
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    placeholder="Service Name (e.g. Inbound Voice AI)"
                    className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2 flex gap-2">
                  <input
                    type="text"
                    value={newServiceDesc}
                    onChange={(e) => setNewServiceDesc(e.target.value)}
                    placeholder="Short Description (e.g. 24/7 call answering and CRM dispatch)"
                    className="flex-1 h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={addService}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                    className="cursor-pointer h-9 px-4 shrink-0 text-xs"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(profile.services || []).map((service, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex items-start justify-between gap-3 group"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-heading)]">
                      {service.name}
                    </span>
                    <Badge variant="success" className="text-[9px] py-0 px-1">
                      Active
                    </Badge>
                  </div>
                  {service.description && (
                    <p className="text-[11px] text-[var(--color-muted)] leading-normal">
                      {service.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmItem({ type: "service", index: idx, title: service.name })}
                    className="text-[var(--color-muted)] hover:text-[var(--color-danger)] p-1 rounded transition-colors cursor-pointer"
                    title="Remove Service"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Office Address & Operating Hours */}
      {activeTab === "hours" && (
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-4">
          <div className="border-b border-[var(--color-border)]/60 pb-3">
            <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
              Physical Head Office Address
            </h3>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              The agent provides this location when callers inquire about meeting or visiting in person.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Full Office Address
            </label>
            <input
              type="text"
              disabled={!canEdit}
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              placeholder="e.g. 402, Innovation Tower, Tech Hub, Downtown 10001"
              className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium ${
                !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
              }`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">City</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.city}
                onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">State</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.state}
                onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">Country</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.country}
                onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>
          </div>

          <div className="border-t border-[var(--color-border)]/60 pt-4 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
                Operating / Business Hours
              </h3>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                The agent accurately quotes working hours for staff support, callback requests, and office visits.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">Working Days</label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={profile.operating_hours?.days || "Monday - Saturday"}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      operating_hours: { ...profile.operating_hours, days: e.target.value }
                    })
                  }
                  placeholder="Monday - Saturday"
                  className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                    !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">Hours (Open - Close)</label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={profile.operating_hours?.hours || "9:00 AM - 7:00 PM"}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      operating_hours: { ...profile.operating_hours, hours: e.target.value }
                    })
                  }
                  placeholder="9:00 AM - 7:00 PM"
                  className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                    !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                  }`}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-xs font-semibold text-[var(--color-heading)] flex items-center justify-between">
                  <span>Organization Country &amp; Primary Timezone</span>
                  <span className="text-[10px] text-[var(--color-primary)] font-normal">Controls AI Clock &amp; Scheduling</span>
                </label>
                <select
                  disabled={!canEdit}
                  value={profile.operating_hours?.timezone || "Asia/Kolkata"}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      operating_hours: { ...profile.operating_hours, timezone: e.target.value }
                    })
                  }
                  className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer ${
                    !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                  }`}
                >
                  <optgroup label="⭐ Primary Recommended">
                    <option value="Asia/Kolkata">India (IST, GMT+05:30) - Asia/Kolkata</option>
                    <option value="Europe/London">United Kingdom (GMT/BST, GMT+00:00) - Europe/London</option>
                    <option value="America/New_York">United States Eastern (New York, GMT-05:00) - America/New_York</option>
                    <option value="America/Chicago">United States Central (Chicago, GMT-06:00) - America/Chicago</option>
                    <option value="America/Los_Angeles">United States Pacific (Los Angeles, GMT-08:00) - America/Los_Angeles</option>
                    <option value="Asia/Dubai">UAE / Gulf (Dubai, GMT+04:00) - Asia/Dubai</option>
                    <option value="Asia/Singapore">Singapore / Malaysia (GMT+08:00) - Asia/Singapore</option>
                    <option value="Australia/Sydney">Australia Eastern (Sydney, GMT+10:00) - Australia/Sydney</option>
                  </optgroup>
                  
                  {Array.from(new Set(allTimezones.map((t) => t.group))).map((grp) => (
                    <optgroup key={grp} label={grp}>
                      {allTimezones
                        .filter((t) => t.group === grp)
                        .map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">Closed On</label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={profile.operating_hours?.closed_on || "Sunday"}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      operating_hours: { ...profile.operating_hours, closed_on: e.target.value }
                    })
                  }
                  placeholder="Sunday & Public Holidays"
                  className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                    !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Custom FAQs & Facts */}
      {activeTab === "faqs" && (
        <div className="space-y-4">
          {canEdit && (
            <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
                Add Common Caller Question & Verified Answer
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <input
                    type="text"
                    value={newFAQQuestion}
                    onChange={(e) => setNewFAQQuestion(e.target.value)}
                    placeholder="Question (e.g. How do I get a quote?)"
                    className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2 flex gap-2">
                  <input
                    type="text"
                    value={newFAQAnswer}
                    onChange={(e) => setNewFAQAnswer(e.target.value)}
                    placeholder="Spoken Answer (e.g. You can request a quote by emailing support@example.com)"
                    className="flex-1 h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={addFAQ}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                    className="cursor-pointer h-9 px-4 shrink-0 text-xs"
                  >
                    Add FAQ
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {(profile.faqs || []).map((faq, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex items-start justify-between gap-3 group"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      {faq.question}
                    </span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 font-normal">
                      {faq.category || "General"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] leading-relaxed pl-5">
                    {faq.answer}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmItem({ type: "faq", index: idx, title: faq.question })}
                    className="text-[var(--color-muted)] hover:text-[var(--color-danger)] p-1 rounded transition-colors cursor-pointer"
                    title="Remove FAQ"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmItem}
        onClose={() => !isDeletingItem && setDeleteConfirmItem(null)}
        title={`Delete ${deleteConfirmItem?.type === "faq" ? "FAQ Question" : "Service"}`}
        maxWidth="sm"
      >
        <div className="space-y-4 text-left">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-[var(--color-danger)]/10 text-[var(--color-danger)] shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-[var(--color-heading)] font-semibold">
                Are you sure you want to delete this {deleteConfirmItem?.type === "faq" ? "FAQ" : "service"}?
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1 font-mono break-words">
                "{deleteConfirmItem?.title}"
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-2">
                This item will be permanently removed from your verified Knowledge Base and will no longer be used during voice calls.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeletingItem}
              onClick={() => setDeleteConfirmItem(null)}
              className="cursor-pointer text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isDeletingItem}
              onClick={handleConfirmDelete}
              className="cursor-pointer text-xs h-8"
            >
              {isDeletingItem ? "Deleting..." : "Yes, Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
