import React, { useState, useEffect, useRef } from "react";
import { fetchApi } from "../api-client";
import { useAuth } from "../context/AuthContext";
import { CompanyBusinessProfile, BusinessServiceItem, CompanyFAQItem, KnowledgeDocument, KnowledgeSearchResult } from "../types";
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
  Brain,
  FileText,
  UploadCloud,
  Search,
  Zap,
  Check,
  FileCode,
  FileCheck,
  RefreshCw
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
  const [activeTab, setActiveTab] = useState<"company" | "services" | "hours" | "faqs" | "documents">("company");

  // Delete confirmation modal state
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{
    type: "faq" | "service" | "document";
    index?: number;
    id?: string;
    title: string;
  } | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // Documents & RAG State
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [updatingDocId, setUpdatingDocId] = useState<string | null>(null);
  const [docCategory, setDocCategory] = useState("Product Manual");
  const [docDescription, setDocDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateFileInputRef = useRef<HTMLInputElement>(null);

  // Vector Search Sandbox State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [searchLatency, setSearchLatency] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

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
    loadDocuments();
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

  async function loadDocuments() {
    try {
      setLoadingDocs(true);
      const res = await fetchApi<KnowledgeDocument[]>("/knowledge/documents");
      if (res) {
        setDocuments(res);
      }
    } catch (err: any) {
      console.error("Failed to load knowledge documents:", err);
    } finally {
      setLoadingDocs(false);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", docCategory);
    if (docDescription.trim()) {
      formData.append("description", docDescription.trim());
    }

    try {
      setUploadingDoc(true);
      const res = await fetchApi<KnowledgeDocument>("/knowledge/upload", {
        method: "POST",
        body: formData
      });
      if (res) {
        toast.success(`"${res.title}" indexed successfully!`, {
          description: `Created ${res.total_chunks} vector chunks ready for AI spoken RAG.`
        });
        setDocDescription("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        await loadDocuments();
      }
    } catch (err: any) {
      console.error("Document upload failed:", err);
      toast.error(err.message || "Failed to parse and index document.");
    } finally {
      setUploadingDoc(false);
    }
  };

  const triggerReupload = (docId: string) => {
    setUpdatingDocId(docId);
    if (updateFileInputRef.current) {
      updateFileInputRef.current.value = "";
      updateFileInputRef.current.click();
    }
  };

  const handleReuploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !updatingDocId) return;

    const file = files[0];
    const docToUpdate = documents.find((d) => d.id === updatingDocId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", docToUpdate?.category || "General");
    if (docToUpdate?.description) {
      formData.append("description", docToUpdate.description);
    }

    try {
      setUploadingDoc(true);
      const res = await fetchApi<KnowledgeDocument>(`/knowledge/documents/${updatingDocId}`, {
        method: "PUT",
        body: formData
      });
      if (res) {
        toast.success(`"${res.title}" updated & re-indexed!`, {
          description: `All attached voice agents now use the latest ${res.total_chunks} chunks without losing their connection.`
        });
        await loadDocuments();
      }
    } catch (err: any) {
      console.error("Document update failed:", err);
      toast.error(err.message || "Failed to update and re-index document.");
    } finally {
      setUploadingDoc(false);
      setUpdatingDocId(null);
      if (updateFileInputRef.current) updateFileInputRef.current.value = "";
    }
  };

  const handleSearchSandbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setSearching(true);
      setHasSearched(true);
      const res = await fetchApi<{
        query: string;
        results: KnowledgeSearchResult[];
        latency_ms: number;
        total_results: number;
      }>("/knowledge/search", {
        method: "POST",
        body: JSON.stringify({
          query: searchQuery.trim(),
          category: searchCategory || undefined,
          top_k: 4,
          min_similarity: 0.25
        })
      });

      if (res) {
        setSearchResults(res.results || []);
        setSearchLatency(res.latency_ms);
      }
    } catch (err: any) {
      console.error("Search query failed:", err);
      toast.error("Vector search failed.");
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmItem) return;
    try {
      setIsDeletingItem(true);
      if (deleteConfirmItem.type === "document" && deleteConfirmItem.id) {
        await fetchApi(`/knowledge/documents/${deleteConfirmItem.id}`, {
          method: "DELETE"
        });
        toast.success("Document and vector embeddings deleted.");
        await loadDocuments();
      } else if (deleteConfirmItem.type === "faq" && profile && deleteConfirmItem.index !== undefined) {
        const updatedFaqs = [...(profile.faqs || [])];
        updatedFaqs.splice(deleteConfirmItem.index, 1);
        await persistProfile({ ...profile, faqs: updatedFaqs }, "FAQ removed from Knowledge Base.");
      } else if (deleteConfirmItem.type === "service" && profile && deleteConfirmItem.index !== undefined) {
        const updatedServices = [...(profile.services || [])];
        updatedServices.splice(deleteConfirmItem.index, 1);
        await persistProfile({ ...profile, services: updatedServices }, "Service removed from Knowledge Base.");
      }
      setDeleteConfirmItem(null);
    } catch (err: any) {
      console.error("Failed to delete item:", err);
      toast.error(err.message || "Failed to delete item.");
    } finally {
      setIsDeletingItem(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading organization knowledge base..." />;
  }

  if (!profile) {
    return (
      <div className="p-8 text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]">
        <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mx-auto mb-2" />
        <p className="text-sm text-[var(--color-heading)] font-semibold">Failed to load Business Knowledge</p>
        <p className="text-xs text-[var(--color-muted)] mt-1">Please try refreshing the page or check your connection.</p>
        <Button onClick={loadProfile} variant="outline" size="sm" className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Knowledge Base & Business Profile"
        description="Manage verified business facts, services, hours, FAQs, and vector-embedded documents (RAG) for your voice agents."
        badge={
          <div className="flex items-center gap-1.5">
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
      <div className="flex border-b border-[var(--color-border)] gap-2 overflow-x-auto pb-0.5">
        {[
          { id: "company" as const, label: "Company & Identity", icon: Building2 },
          { id: "documents" as const, label: "Documents & Vector RAG", icon: FileText, count: documents.length },
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
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer shrink-0 ${
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
              <label className="block text-xs font-semibold text-[var(--color-heading)]">Company Legal Name</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.company_name || ""}
                onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                placeholder="Acme Global Inc."
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">Company Tagline</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.tagline || ""}
                onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
                placeholder="Enterprise AI Voice & Telephony Solutions"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--color-heading)]">Company Overview & Elevator Pitch</label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={profile.company_introduction || ""}
              onChange={(e) => setProfile({ ...profile, company_introduction: e.target.value })}
              placeholder="We help modern enterprises automate outbound outreach and inbound customer support calls with natural voice AI."
              className={`w-full p-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
              }`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">Main Contact Phone</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.phone || ""}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+1 800 555 0199"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">Support / Inquiries Email</label>
              <input
                type="email"
                disabled={!canEdit}
                value={profile.email || ""}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="contact@example.com"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">Official Website</label>
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

      {/* Tab: Documents & Vector RAG */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          {/* Upload Box */}
          {canEdit && (
            <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider flex items-center gap-1.5">
                    <UploadCloud className="w-4 h-4 text-[var(--color-primary)]" />
                    Index Knowledge Document (PDF, DOCX, TXT)
                  </h3>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    Uploaded documents are parsed, chunked, and vector-embedded into Azure Cosmos DB for instant voice agent retrieval.
                  </p>
                </div>
                <Badge variant="primary" className="text-[10px] py-0.5 px-2 font-mono">
                  Cosmos DB Vector Engine
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-[var(--color-heading)]">Category</label>
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value="Product Manual">Product Manual</option>
                    <option value="Pricing & Plans">Pricing & Plans</option>
                    <option value="Company Policies">Company Policies</option>
                    <option value="Real Estate Listings">Real Estate Listings</option>
                    <option value="Medical & Care Guidelines">Medical & Care Guidelines</option>
                    <option value="FAQ & Script Guide">FAQ & Script Guide</option>
                    <option value="General Knowledge">General Knowledge</option>
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[var(--color-heading)]">Description / Notes (Optional)</label>
                  <input
                    type="text"
                    value={docDescription}
                    onChange={(e) => setDocDescription(e.target.value)}
                    placeholder="Brief description of what this document covers..."
                    className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] bg-[var(--color-surface-muted)]/50 p-6 rounded-[var(--radius-main,0.375rem)] text-center cursor-pointer transition-colors group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full text-[var(--color-primary)] group-hover:scale-110 transition-transform">
                    {uploadingDoc ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <FileCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-heading)]">
                      {uploadingDoc ? "Parsing & Generating Vector Embeddings..." : "Click to select a file or drag & drop"}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                      Supports PDF, Microsoft Word (.docx), and Plain Text (.txt) up to 25MB
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Document Library Table */}
          <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                Indexed Document Library ({documents.length})
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={loadDocuments}
                leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loadingDocs ? "animate-spin" : ""}`} />}
                className="text-xs h-7"
              >
                Refresh
              </Button>
            </div>

            {documents.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]">
                <FileCode className="w-8 h-8 text-[var(--color-muted)] mx-auto mb-2 opacity-50" />
                <p className="text-xs font-semibold text-[var(--color-heading)]">No Knowledge Documents Indexed</p>
                <p className="text-[11px] text-[var(--color-muted)] mt-1">
                  Upload PDF or DOCX brochures, pricing guides, or manuals above to enable high-accuracy voice search.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {documents.map((doc) => (
                  <div key={doc.id} className="py-3.5 flex items-center justify-between gap-4 group">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--color-heading)] truncate">
                          {doc.title}
                        </span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono uppercase">
                          {doc.file_type}
                        </Badge>
                        <Badge variant="neutral" className="text-[9px] py-0 px-1.5">
                          {doc.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted)]">
                        <span>{doc.total_chunks} vector chunks</span>
                        <span>•</span>
                        <span>{Math.round(doc.file_size_bytes / 1024)} KB</span>
                        <span>•</span>
                        <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                        {doc.description && (
                          <>
                            <span>•</span>
                            <span className="italic truncate max-w-[280px]">"{doc.description}"</span>
                          </>
                        )}
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => triggerReupload(doc.id)}
                          className="px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded transition-colors cursor-pointer flex items-center gap-1"
                          title="Re-upload and update document in-place"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Update</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmItem({ type: "document", id: doc.id, title: doc.title })}
                          className="text-[var(--color-muted)] hover:text-[var(--color-danger)] p-1.5 rounded transition-colors cursor-pointer"
                          title="Delete Document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Hidden Input for in-place re-upload */}
            <input
              type="file"
              ref={updateFileInputRef}
              onChange={handleReuploadFile}
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
            />
          </div>

          {/* Interactive Vector Search Sandbox */}
          <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Vector Retrieval Sandbox (RAG Test)
                </h3>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  Test semantic queries against your Azure Cosmos DB vector index to verify exact retrieval latency and matching accuracy.
                </p>
              </div>
              {searchLatency !== null && (
                <Badge variant="success" className="text-[10px] py-0.5 px-2 font-mono">
                  {searchLatency} ms latency
                </Badge>
              )}
            </div>

            <form onSubmit={handleSearchSandbox} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--color-muted)] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ask any question (e.g. What is the pricing policy for enterprise plans?)"
                  className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={searching || !searchQuery.trim()}
                leftIcon={<Search className="w-3.5 h-3.5" />}
                className="cursor-pointer h-9 px-4 text-xs shrink-0"
              >
                {searching ? "Searching..." : "Test Vector Search"}
              </Button>
            </form>

            {hasSearched && (
              <div className="space-y-2.5 pt-2">
                {searchResults.length === 0 ? (
                  <div className="p-4 bg-[var(--color-surface-muted)] rounded text-center text-xs text-[var(--color-muted)]">
                    No matching passages found above the similarity threshold.
                  </div>
                ) : (
                  searchResults.map((res, i) => (
                    <div
                      key={res.chunk_id || i}
                      className="p-3.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--color-heading)]">
                            {res.document_title} (Chunk #{res.chunk_index + 1})
                          </span>
                          <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                            {res.category}
                          </Badge>
                        </div>
                        <Badge
                          variant={res.similarity_score > 0.65 ? "success" : "primary"}
                          className="text-[10px] font-mono"
                        >
                          {(res.similarity_score * 100).toFixed(1)}% Match
                        </Badge>
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)] leading-relaxed whitespace-pre-wrap">
                        {res.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Services & Products */}
      {activeTab === "services" && (
        <div className="space-y-4">
          {canEdit && (
            <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
                Add New Offered Service or Product
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
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
                    placeholder="Description (e.g. 24/7 autonomous receptionist call answering)"
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
                    Add Service
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(profile.services || []).map((srv, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex items-start justify-between gap-3 group"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      {srv.name}
                    </span>
                    {srv.pricing && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                        {srv.pricing}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] leading-relaxed pl-5">
                    {srv.description}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmItem({ type: "service", index: idx, title: srv.name })}
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

      {/* Tab 3: Hours & Office Location */}
      {activeTab === "hours" && (
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-4">
          <div className="border-b border-[var(--color-border)]/60 pb-3">
            <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
              Physical Office Location & Operational Hours
            </h3>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              The AI references these details when scheduling appointments or providing location directions to callers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">Street Address</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.address || ""}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="100 Tech Park Way, Suite 400"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">City</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.city || ""}
                onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                placeholder="San Francisco"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">State / Country</label>
              <input
                type="text"
                disabled={!canEdit}
                value={profile.country || ""}
                onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                placeholder="California, USA"
                className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                  !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                }`}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)]/60 space-y-3">
            <h4 className="text-xs font-bold text-[var(--color-heading)] uppercase">Operating Hours Schedule</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">Operating Days</label>
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
                  placeholder="Monday - Friday"
                  className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                    !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">Working Hours</label>
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
                  placeholder="9:00 AM - 6:00 PM"
                  className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                    !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">Timezone</label>
                <select
                  disabled={!canEdit}
                  value={profile.operating_hours?.timezone || "Asia/Kolkata (IST)"}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      operating_hours: { ...profile.operating_hours, timezone: e.target.value }
                    })
                  }
                  className={`w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] ${
                    !canEdit ? "opacity-75 cursor-not-allowed bg-[var(--color-surface-muted)]/60" : ""
                  }`}
                >
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
        title={`Delete ${deleteConfirmItem?.type === "document" ? "Knowledge Document" : deleteConfirmItem?.type === "faq" ? "FAQ Question" : "Service"}`}
        maxWidth="sm"
      >
        <div className="space-y-4 text-left">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-[var(--color-danger)]/10 text-[var(--color-danger)] shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-[var(--color-heading)] font-semibold">
                Are you sure you want to delete this {deleteConfirmItem?.type === "document" ? "document" : deleteConfirmItem?.type === "faq" ? "FAQ" : "service"}?
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1 font-mono break-words">
                "{deleteConfirmItem?.title}"
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-2">
                This item and its vector embeddings will be permanently purged from your Cosmos DB Knowledge Base.
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
