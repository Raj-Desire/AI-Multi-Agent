import React, { useState, useEffect, useRef } from "react";
import { fetchApi } from "../api-client";
import { useAuth } from "../context/AuthContext";
import { KnowledgeDocument, KnowledgeSearchResult } from "../types";
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
import { toast } from "sonner";


/**
 * Knowledge Base: organization documents indexed for vector RAG. Business details,
 * services, hours and FAQs are configured per agent in the agent creator, so there is
 * no organization-wide business profile any more.
 */
export function BusinessProfileView() {
  const { isAdmin, isSuperAdmin } = useAuth();

  // Delete confirmation modal state
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{
    type: "document";
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

  const canEdit = isAdmin || isSuperAdmin;

  useEffect(() => {
    loadDocuments();
  }, []);

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
    if (!deleteConfirmItem?.id) return;
    try {
      setIsDeletingItem(true);
      await fetchApi(`/knowledge/documents/${deleteConfirmItem.id}`, {
        method: "DELETE"
      });
      toast.success("Document and vector embeddings deleted.");
      await loadDocuments();
      setDeleteConfirmItem(null);
    } catch (err: any) {
      console.error("Failed to delete document:", err);
      toast.error(err.message || "Failed to delete document.");
    } finally {
      setIsDeletingItem(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base"
        description="Upload documents your voice agents can search during calls (vector RAG). Attach them to an agent in the agent creator; business details, services and hours are set per agent."
        badge={
          !canEdit ? (
            <Badge variant="neutral" className="text-[10px] py-1 px-2 gap-1 flex items-center">
              <Lock className="w-3 h-3 text-[var(--color-muted)]" />
              Read-Only
            </Badge>
          ) : undefined
        }
      />

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

      <Modal
        isOpen={!!deleteConfirmItem}
        onClose={() => !isDeletingItem && setDeleteConfirmItem(null)}
        title="Delete Knowledge Document"
        maxWidth="sm"
      >
        <div className="space-y-4 text-left">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-[var(--color-danger)]/10 text-[var(--color-danger)] shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-[var(--color-heading)] font-semibold">
                Are you sure you want to delete this document?
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
