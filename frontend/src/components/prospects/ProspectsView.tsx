import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { DataTable, Column } from "../ui/DataTable";
import { Modal } from "../ui/Modal";
import { Prospect, ProspectStatus, ProspectSource, ProspectPaginationResponse } from "../../types";
import { fetchApi, invalidateApiCache } from "../../api-client";
import { ProspectEditorModal } from "./ProspectEditorModal";
import { ProspectImportModal } from "./ProspectImportModal";
import { ProspectCallModal } from "./ProspectCallModal";
import { ProspectDetailDrawer } from "./ProspectDetailDrawer";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  UploadCloud,
  Download,
  Search,
  Filter,
  RefreshCw,
  PhoneOutgoing,
  Edit2,
  Trash2,
  ShieldAlert,
  Tag,
  CheckSquare,
  Square,
  Sparkles,
  PhoneCall,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Check,
  AlertTriangle,
  Folder,
  AlertCircle,
  FolderPlus,
  CheckCircle2
} from "lucide-react";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "New", label: "New" },
  { value: "Contacted", label: "Contacted" },
  { value: "Connected", label: "Connected" },
  { value: "Interested", label: "Interested" },
  { value: "Callback Requested", label: "Callback Requested" },
  { value: "Not Interested", label: "Not Interested" },
  { value: "Do Not Contact", label: "Do Not Contact (DNC)" },
];

export function ProspectsView() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Selection for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<ProspectStatus>("Interested");
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagText, setBulkTagText] = useState("");
  const [bulkTagAction, setBulkTagAction] = useState<"add" | "remove">("add");
  const [showBulkGroupModal, setShowBulkGroupModal] = useState(false);
  const [bulkTargetGroup, setBulkTargetGroup] = useState("");
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Delete Contact Group Modal States
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState("");
  const [groupDeleteAction, setGroupDeleteAction] = useState<"unassign" | "move" | "delete_contacts">("unassign");
  const [groupMoveTarget, setGroupMoveTarget] = useState("");
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  // Modal / Drawer Active States
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);

  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callingProspect, setCallingProspect] = useState<Prospect | null>(null);

  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [viewingProspect, setViewingProspect] = useState<Prospect | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingProspect, setDeletingProspect] = useState<Prospect | null>(null);

  // Loading States for Action Modals & Operations
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkUpdatingStatus, setIsBulkUpdatingStatus] = useState(false);
  const [isBulkUpdatingTags, setIsBulkUpdatingTags] = useState(false);
  const [isBulkUpdatingGroup, setIsBulkUpdatingGroup] = useState(false);

  useEffect(() => {
    fetchDistinctGroups();
  }, []);

  useEffect(() => {
    loadProspects();
  }, [page, pageSize, selectedStatus, selectedGroup, selectedSource, sortBy, sortOrder]);

  const fetchDistinctGroups = async () => {
    try {
      const res = await fetchApi<{ groups: string[] }>("/prospects/groups");
      if (res && res.groups && res.groups.length > 0) {
        setAvailableGroups((prev) => Array.from(new Set([...prev, ...res.groups])).sort());
      }
    } catch {}
  };

  const loadProspects = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.append("search", searchTerm.trim());
      if (selectedStatus !== "all") params.append("status", selectedStatus);
      if (selectedGroup !== "all") params.append("group_name", selectedGroup);
      if (selectedSource !== "all") params.append("source", selectedSource);
      params.append("page", String(page));
      params.append("page_size", String(pageSize));
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);

      const res = await fetchApi<ProspectPaginationResponse>(`/prospects?${params.toString()}`);
      setProspects(res.items || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.total_pages || 1);

      // Extract distinct groups from loaded items immediately
      const itemGroups: string[] = [];
      (res.items || []).forEach((p) => {
        if (p.group_name && p.group_name.trim()) itemGroups.push(p.group_name.trim());
        (p.tags || []).forEach((t) => {
          if (t && String(t).trim()) itemGroups.push(String(t).trim());
        });
      });
      if (itemGroups.length > 0) {
        setAvailableGroups((prev) => Array.from(new Set([...prev, ...itemGroups])).sort());
      }

      // Refresh groups list in background
      fetchDistinctGroups();
    } catch (err: any) {
      toast.error(err.message || "Failed to load prospects.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProspects();
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === prospects.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(prospects.map((p) => p.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Bulk Operations
  const handleExecuteBulkStatus = async () => {
    try {
      setIsBulkUpdatingStatus(true);
      const res = await fetchApi<{ updated_count: number }>("/prospects/bulk/status", {
        method: "POST",
        body: JSON.stringify({
          prospect_ids: selectedIds,
          status: bulkTargetStatus,
        }),
      });
      toast.success(`Updated status for ${res.updated_count} contacts.`);
      setShowBulkStatusModal(false);
      setSelectedIds([]);
      invalidateApiCache("/prospects");
      loadProspects();
    } catch (err: any) {
      toast.error(err.message || "Bulk status update failed.");
    } finally {
      setIsBulkUpdatingStatus(false);
    }
  };

  const handleExecuteBulkTags = async () => {
    const tagList = bulkTagText.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length === 0) {
      toast.error("Please enter at least one tag.");
      return;
    }
    try {
      setIsBulkUpdatingTags(true);
      const res = await fetchApi<{ updated_count: number }>("/prospects/bulk/tags", {
        method: "POST",
        body: JSON.stringify({
          prospect_ids: selectedIds,
          tags: tagList,
          action: bulkTagAction,
        }),
      });
      toast.success(`Updated tags for ${res.updated_count} contacts.`);
      setShowBulkTagModal(false);
      setBulkTagText("");
      setSelectedIds([]);
      invalidateApiCache("/prospects");
      loadProspects();
    } catch (err: any) {
      toast.error(err.message || "Bulk tag update failed.");
    } finally {
      setIsBulkUpdatingTags(false);
    }
  };

  const handleExecuteBulkGroup = async () => {
    try {
      setIsBulkUpdatingGroup(true);
      const res = await fetchApi<{ updated_count: number; group_name?: string }>("/prospects/bulk/group", {
        method: "POST",
        body: JSON.stringify({
          prospect_ids: selectedIds,
          group_name: bulkTargetGroup.trim() || undefined,
        }),
      });
      toast.success(`Updated group for ${res.updated_count} contacts.`);
      setShowBulkGroupModal(false);
      setBulkTargetGroup("");
      setSelectedIds([]);
      invalidateApiCache("/prospects");
      loadProspects();
      fetchDistinctGroups();
    } catch (err: any) {
      toast.error(err.message || "Bulk group update failed.");
    } finally {
      setIsBulkUpdatingGroup(false);
    }
  };

  const handleExecuteBulkDelete = async () => {
    try {
      setIsBulkDeleting(true);
      const res = await fetchApi<{ deleted_count: number }>("/prospects/bulk/delete", {
        method: "POST",
        body: JSON.stringify({
          prospect_ids: selectedIds,
        }),
      });
      toast.success(`Deleted ${res.deleted_count} contacts.`);
      setShowBulkDeleteModal(false);
      setSelectedIds([]);
      invalidateApiCache("/prospects");
      loadProspects();
    } catch (err: any) {
      toast.error(err.message || "Bulk delete failed.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleExecuteDeleteGroup = async () => {
    if (!groupToDelete) return;
    try {
      setIsDeletingGroup(true);
      const res = await fetchApi<{
        deleted_group: string;
        action: string;
        target_group?: string;
        affected_contacts: number;
      }>(`/prospects/groups/delete?group_name=${encodeURIComponent(groupToDelete)}`, {
        method: "POST",
        body: JSON.stringify({
          action: groupDeleteAction,
          target_group_name: groupDeleteAction === "move" ? groupMoveTarget.trim() || undefined : undefined,
        }),
      });

      if (groupDeleteAction === "unassign") {
        toast.success(`Removed group "${groupToDelete}". Preserved ${res.affected_contacts} contacts in your list.`);
      } else if (groupDeleteAction === "move") {
        toast.success(`Moved ${res.affected_contacts} contacts to "${groupMoveTarget}".`);
      } else {
        toast.success(`Deleted group "${groupToDelete}" and removed ${res.affected_contacts} contacts.`);
      }

      setShowDeleteGroupModal(false);
      if (selectedGroup === groupToDelete) {
        setSelectedGroup("all");
      }
      setGroupToDelete("");
      setGroupMoveTarget("");
      setGroupDeleteAction("unassign");
      invalidateApiCache("/prospects");
      loadProspects();
      fetchDistinctGroups();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete contact group.");
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleDeleteSingle = async () => {
    if (!deletingProspect) return;
    try {
      setIsDeletingSingle(true);
      await fetchApi(`/prospects/${deletingProspect.id}`, { method: "DELETE" });
      toast.success(`Contact "${deletingProspect.full_name}" deleted.`);
      setDeleteModalOpen(false);
      setDeletingProspect(null);
      if (viewingProspect?.id === deletingProspect.id) {
        setDetailDrawerOpen(false);
        setViewingProspect(null);
      }
      invalidateApiCache("/prospects");
      loadProspects();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete contact.");
    } finally {
      setIsDeletingSingle(false);
    }
  };

  const handleExportCSV = () => {
    if (prospects.length === 0) {
      toast.error("No contacts to export.");
      return;
    }
    const headers = [
      "ID",
      "Full Name",
      "First Name",
      "Last Name",
      "Phone",
      "Normalized Phone",
      "Email",
      "Company",
      "Job Title",
      "Industry",
      "Website",
      "Status",
      "Source",
      "Tags",
      "Total Calls",
      "Last Contacted",
      "Notes",
    ];
    const rows = [headers.join(",")];

    for (const p of prospects) {
      const r = [
        p.id,
        `"${(p.full_name || "").replace(/"/g, '""')}"`,
        `"${(p.first_name || "").replace(/"/g, '""')}"`,
        `"${(p.last_name || "").replace(/"/g, '""')}"`,
        `"${(p.phone_number || "").replace(/"/g, '""')}"`,
        `"${(p.normalized_phone || "").replace(/"/g, '""')}"`,
        `"${(p.email || "").replace(/"/g, '""')}"`,
        `"${(p.company || "").replace(/"/g, '""')}"`,
        `"${(p.job_title || "").replace(/"/g, '""')}"`,
        `"${(p.industry || "").replace(/"/g, '""')}"`,
        `"${(p.website || "").replace(/"/g, '""')}"`,
        `"${p.status}"`,
        `"${p.source}"`,
        `"${(p.tags || []).join(";")}"`,
        p.total_calls || 0,
        p.last_contacted_at || "",
        `"${(p.notes || "").replace(/"/g, '""')}"`,
      ];
      rows.push(r.join(","));
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "Qualified":
      case "Converted":
      case "Interested":
        return <Badge variant="success">Interested</Badge>;
      case "Connected":
        return <Badge variant="primary">{st}</Badge>;
      case "Not Interested":
        return <Badge variant="neutral">Not Interested</Badge>;
      case "Callback Requested":
        return <Badge variant="warning">{st}</Badge>;
      case "Do Not Contact":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3 h-3" />
            <span>DNC</span>
          </span>
        );
      case "Invalid":
        return <Badge variant="danger">{st}</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const columns: Column<Prospect>[] = useMemo(
    () => [
      {
        key: "select",
        header: (
          <input
            type="checkbox"
            checked={prospects.length > 0 && selectedIds.length === prospects.length}
            onChange={handleToggleSelectAll}
            className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
          />
        ),
        render: (row: Prospect) => (
          <input
            type="checkbox"
            checked={selectedIds.includes(row.id)}
            onChange={() => handleToggleSelectOne(row.id)}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
          />
        ),
        className: "w-8 text-center",
      },
      {
        key: "contact",
        header: "Full Name",
        render: (row: Prospect) => (
          <div
            onClick={() => {
              setViewingProspect(row);
              setDetailDrawerOpen(true);
            }}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold flex items-center justify-center text-xs uppercase shrink-0">
              {row.full_name ? row.full_name.charAt(0) : "C"}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--color-heading)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                {row.full_name || `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Unnamed Contact"}
              </div>
              {row.company && (
                <div className="text-[11px] text-[var(--color-muted)] truncate">
                  {row.company}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        key: "phone",
        header: "Phone Number",
        render: (row: Prospect) => (
          <div className="font-mono text-xs text-[var(--color-heading)]">
            {row.phone_number}
          </div>
        ),
      },
      {
        key: "email",
        header: "Email",
        render: (row: Prospect) => (
          <div className="text-xs text-[var(--color-muted)] truncate max-w-44">
            {row.email || "—"}
          </div>
        ),
      },
      {
        key: "tags",
        header: "Contact Group",
        render: (row: Prospect) => {
          const displayGroup = row.group_name || (row.tags && row.tags.length > 0 ? row.tags[0] : null);
          return displayGroup ? (
            <div className="flex items-center gap-1.5 max-w-48 truncate group/grp">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--color-surface-muted)] text-[var(--color-heading)] font-medium border border-[var(--color-border)] truncate">
                <Folder className="w-3 h-3 text-[var(--color-primary)] shrink-0" />
                <span className="truncate">{displayGroup}</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupToDelete(displayGroup);
                  setGroupDeleteAction("unassign");
                  setGroupMoveTarget("");
                  setShowDeleteGroupModal(true);
                }}
                title={`Delete or reassign group "${displayGroup}"`}
                className="opacity-0 group-hover/grp:opacity-100 p-0.5 text-[var(--color-muted)] hover:text-rose-600 transition-opacity rounded cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-[var(--color-muted)] opacity-50">—</span>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        render: (row: Prospect) => getStatusBadge(row.status),
      },
      {
        key: "calls",
        header: "Calls",
        render: (row: Prospect) => (
          <div className="text-center">
            <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-medium bg-[var(--color-surface-muted)] text-[var(--color-heading)]">
              {row.total_calls}
            </span>
          </div>
        ),
        className: "text-center w-16",
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: Prospect) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              disabled={row.is_dnc || row.status === "Do Not Contact"}
              onClick={() => {
                setCallingProspect(row);
                setCallModalOpen(true);
              }}
              title={row.is_dnc ? "Do Not Contact active" : "Call with AI Voice Agent"}
              className="cursor-pointer"
            >
              <PhoneOutgoing className="w-3 h-3 text-[var(--color-primary)]" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingProspect(row);
                setEditorModalOpen(true);
              }}
              title="Edit contact"
              className="cursor-pointer"
            >
              <Edit2 className="w-3 h-3 text-[var(--color-muted)]" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeletingProspect(row);
                setDeleteModalOpen(true);
              }}
              title="Delete contact"
              className="cursor-pointer text-[var(--color-muted)] hover:text-rose-500"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ),
        className: "text-right w-24",
      },
    ],
    [prospects, selectedIds]
  );

  return (
    <div className="space-y-4 text-left">
      {/* Header Bar */}
      <PageHeader
        title="Prospect &amp; Contact Management"
        // description="Unified contact registry, custom attributes, Do-Not-Contact compliance, and AI calling integration."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportModalOpen(true)}
              leftIcon={<UploadCloud className="w-3.5 h-3.5" />}
            >
              Import
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingProspect(null);
                setEditorModalOpen(true);
              }}
              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            >
              Add Contact
            </Button>
          </div>
        }
      />

      {/* Search, Filter & Bulk Actions Bar */}
      <div className="space-y-2">
        <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)] flex flex-col md:flex-row items-center justify-between gap-3 shadow-2xs">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full md:w-auto flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[var(--color-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by name, phone, email, company, notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-heading)] focus:outline-hidden focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {/* Contact Group / List Filter */}
            <div className="flex items-center gap-1.5">
              <select
                value={selectedGroup}
                onChange={(e) => {
                  setSelectedGroup(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-heading)] font-medium"
              >
                <option value="all">All Contact Groups</option>
                {availableGroups.map((grp) => (
                  <option key={grp} value={grp}>
                    {grp}
                  </option>
                ))}
              </select>

              {selectedGroup !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGroupToDelete(selectedGroup);
                    setGroupDeleteAction("unassign");
                    setGroupMoveTarget("");
                    setShowDeleteGroupModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900 h-[30px] px-2"
                  title={`Delete or reassign group "${selectedGroup}"`}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Delete Group</span>
                </Button>
              )}
            </div>

            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-heading)]"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={selectedSource}
              onChange={(e) => {
                setSelectedSource(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-heading)]"
            >
              <option value="all">All Sources</option>
              <option value="Manual">Manual</option>
              <option value="CSV Import">CSV Import</option>
              <option value="API">API</option>
              <option value="Campaign">Campaign</option>
              <option value="Inbound Call">Inbound Call</option>
            </select>

            <Button
              variant="ghost"
              size="sm"
              onClick={loadProspects}
              title="Refresh contacts"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Sticky Bulk Selection Bar */}
        {selectedIds.length > 0 && (
          <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary-light)] border border-[var(--color-primary)]/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--color-primary)]">
                {selectedIds.length} contact{selectedIds.length > 1 ? "s" : ""} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-[11px] text-[var(--color-muted)] hover:underline cursor-pointer"
              >
                Clear selection
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkGroupModal(true)}
                leftIcon={<Folder className="w-3 h-3 text-[var(--color-primary)]" />}
              >
                Assign Group
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkStatusModal(true)}
              >
                Change Status
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkTagModal(true)}
              >
                Manage Tags
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowBulkDeleteModal(true)}
                leftIcon={<Trash2 className="w-3 h-3" />}
              >
                Delete ({selectedIds.length})
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Main Data Table */}
      <DataTable
        columns={columns}
        data={prospects}
        isLoading={loading}
        emptyTitle="No contacts found"
        emptyDescription="Import contacts via CSV or click 'Add Contact' to create your first contact."
      />

      {/* Pagination Footer */}
      <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] flex items-center justify-between text-xs text-[var(--color-muted)]">
        <div>
          Showing <strong>{prospects.length}</strong> of <strong>{totalCount}</strong> contacts
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            leftIcon={<ChevronLeft className="w-3 h-3" />}
          >
            Previous
          </Button>
          <span className="px-2 text-xs font-semibold text-[var(--color-heading)]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            rightIcon={<ChevronRight className="w-3 h-3" />}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Modals & Drawers */}
      <ProspectEditorModal
        isOpen={editorModalOpen}
        onClose={() => {
          setEditorModalOpen(false);
          setEditingProspect(null);
        }}
        prospect={editingProspect}
        availableGroups={availableGroups}
        onSaved={() => loadProspects()}
      />

      <ProspectImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportComplete={() => loadProspects()}
      />

      <ProspectCallModal
        isOpen={callModalOpen}
        onClose={() => {
          setCallModalOpen(false);
          setCallingProspect(null);
        }}
        prospect={callingProspect}
        onCallInitiated={() => loadProspects()}
      />

      <ProspectDetailDrawer
        isOpen={detailDrawerOpen}
        onClose={() => {
          setDetailDrawerOpen(false);
          setViewingProspect(null);
        }}
        prospect={viewingProspect}
        onEdit={(p) => {
          setEditingProspect(p);
          setEditorModalOpen(true);
        }}
        onDelete={(p) => {
          setDeletingProspect(p);
          setDeleteModalOpen(true);
        }}
        onCall={(p) => {
          setCallingProspect(p);
          setCallModalOpen(true);
        }}
        onProspectUpdated={(updated) => {
          setViewingProspect(updated);
          loadProspects();
        }}
      />

      {/* Single Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (isDeletingSingle) return;
          setDeleteModalOpen(false);
          setDeletingProspect(null);
        }}
        title="Delete Contact Confirmation"
        maxWidth="sm"
      >
        <div className="space-y-3 text-xs text-left">
          <p className="text-[var(--color-muted)] leading-relaxed">
            Are you sure you want to permanently delete{" "}
            <strong className="text-[var(--color-heading)]">{deletingProspect?.full_name}</strong>? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" disabled={isDeletingSingle} onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" isLoading={isDeletingSingle} disabled={isDeletingSingle} onClick={handleDeleteSingle}>
              Delete Contact
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Status Modal */}
      <Modal
        isOpen={showBulkStatusModal}
        onClose={() => {
          if (isBulkUpdatingStatus) return;
          setShowBulkStatusModal(false);
        }}
        title="Bulk Update Status"
        maxWidth="sm"
      >
        <div className="space-y-3 text-xs text-left">
          <p className="text-[var(--color-muted)]">
            Update the lifecycle status for <strong>{selectedIds.length}</strong> selected contacts:
          </p>
          <select
            value={bulkTargetStatus}
            onChange={(e) => setBulkTargetStatus(e.target.value as ProspectStatus)}
            className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)]"
          >
            {STATUS_FILTERS.filter((s) => s.value !== "all").map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" disabled={isBulkUpdatingStatus} onClick={() => setShowBulkStatusModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={isBulkUpdatingStatus} disabled={isBulkUpdatingStatus} onClick={handleExecuteBulkStatus}>
              Apply Status
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Tag Modal */}
      <Modal
        isOpen={showBulkTagModal}
        onClose={() => {
          if (isBulkUpdatingTags) return;
          setShowBulkTagModal(false);
        }}
        title="Bulk Manage Tags"
        maxWidth="sm"
      >
        <div className="space-y-3 text-xs text-left">
          <p className="text-[var(--color-muted)]">
            Add or remove tags for <strong>{selectedIds.length}</strong> selected contacts:
          </p>
          <div className="flex items-center gap-2">
            <select
              value={bulkTagAction}
              onChange={(e) => setBulkTagAction(e.target.value as "add" | "remove")}
              className="px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs"
            >
              <option value="add">Add Tags</option>
              <option value="remove">Remove Tags</option>
            </select>
            <input
              type="text"
              placeholder="e.g. campaign_q3, priority"
              value={bulkTagText}
              onChange={(e) => setBulkTagText(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" disabled={isBulkUpdatingTags} onClick={() => setShowBulkTagModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={isBulkUpdatingTags} disabled={isBulkUpdatingTags} onClick={handleExecuteBulkTags}>
              Apply Tags
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Group Modal */}
      <Modal
        isOpen={showBulkGroupModal}
        onClose={() => {
          if (isBulkUpdatingGroup) return;
          setShowBulkGroupModal(false);
        }}
        title="Assign Contact Group"
        maxWidth="sm"
      >
        <div className="space-y-3 text-xs text-left">
          <p className="text-[var(--color-muted)]">
            Assign or move <strong>{selectedIds.length}</strong> selected contacts into a group:
          </p>

          <div className="space-y-2">
            {availableGroups.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                  Choose Existing Group:
                </label>
                <select
                  value={bulkTargetGroup}
                  onChange={(e) => setBulkTargetGroup(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)]"
                >
                  <option value="">-- Select an existing group --</option>
                  {availableGroups.map((grp) => (
                    <option key={grp} value={grp}>
                      {grp}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                Or Enter / Create Group Name:
              </label>
              <input
                type="text"
                placeholder="e.g. Q3 Inbound Priority"
                value={bulkTargetGroup}
                onChange={(e) => setBulkTargetGroup(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" disabled={isBulkUpdatingGroup} onClick={() => setShowBulkGroupModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isBulkUpdatingGroup}
              disabled={!bulkTargetGroup.trim() || isBulkUpdatingGroup}
              onClick={handleExecuteBulkGroup}
            >
              Assign to Group
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Modal */}
      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => {
          if (isBulkDeleting) return;
          setShowBulkDeleteModal(false);
        }}
        title="Bulk Delete Contacts"
        maxWidth="sm"
      >
        <div className="space-y-3 text-xs text-left">
          <p className="text-[var(--color-muted)] leading-relaxed">
            Are you sure you want to delete <strong>{selectedIds.length}</strong> selected contacts? This action is permanent.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" disabled={isBulkDeleting} onClick={() => setShowBulkDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" isLoading={isBulkDeleting} disabled={isBulkDeleting} onClick={handleExecuteBulkDelete}>
              Delete {selectedIds.length} Contacts
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Contact Group Modal with Contact Reassignment / Deletion Options */}
      <Modal
        isOpen={showDeleteGroupModal}
        onClose={() => {
          if (isDeletingGroup) return;
          setShowDeleteGroupModal(false);
        }}
        title={`Delete Contact Group: "${groupToDelete}"`}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs text-left">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>What would you like to do with contacts in "{groupToDelete}"?</span>
            </p>
            <p className="text-[11px] leading-relaxed opacity-90">
              Select whether to keep your contacts, move them to another group, or permanently delete them from Contacts & Leads:
            </p>
          </div>

          <div className="space-y-2.5">
            {/* Option 1: Unassign (Keep Contacts) */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                groupDeleteAction === "unassign"
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-2xs"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              <input
                type="radio"
                name="groupDeleteAction"
                value="unassign"
                checked={groupDeleteAction === "unassign"}
                onChange={() => setGroupDeleteAction("unassign")}
                className="mt-0.5 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Keep contacts (Remove from this group)</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-normal bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                  Removes the group tag from contacts, but safely preserves all contacts in your Contacts & Leads list.
                </p>
              </div>
            </label>

            {/* Option 2: Move Contacts to Another Group */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                groupDeleteAction === "move"
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-2xs"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              <input
                type="radio"
                name="groupDeleteAction"
                value="move"
                checked={groupDeleteAction === "move"}
                onChange={() => setGroupDeleteAction("move")}
                className="mt-0.5 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <div className="space-y-2 flex-1">
                <div>
                  <div className="font-semibold text-[var(--color-heading)]">Move contacts to another group</div>
                  <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                    Reassign all contacts from "{groupToDelete}" into a different existing or new group.
                  </p>
                </div>

                {groupDeleteAction === "move" && (
                  <div className="space-y-2 pt-1">
                    {availableGroups.filter((g) => g !== groupToDelete).length > 0 && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                          Select Target Group:
                        </label>
                        <select
                          value={groupMoveTarget}
                          onChange={(e) => setGroupMoveTarget(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)]"
                        >
                          <option value="">-- Choose existing group --</option>
                          {availableGroups
                            .filter((g) => g !== groupToDelete)
                            .map((grp) => (
                              <option key={grp} value={grp}>
                                {grp}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                        Or Create New Group Name:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Q4 Priority Leads"
                        value={groupMoveTarget}
                        onChange={(e) => setGroupMoveTarget(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </label>

            {/* Option 3: Delete Contacts Permanently */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                groupDeleteAction === "delete_contacts"
                  ? "border-rose-500 bg-rose-500/5 shadow-2xs"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              <input
                type="radio"
                name="groupDeleteAction"
                value="delete_contacts"
                checked={groupDeleteAction === "delete_contacts"}
                onChange={() => setGroupDeleteAction("delete_contacts")}
                className="mt-0.5 text-rose-600 focus:ring-rose-500"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <span>Permanently delete all contacts in this group</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-normal bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                    Destructive
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                  Deletes this group AND permanently removes all associated contacts from Contacts & Leads.
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" disabled={isDeletingGroup} onClick={() => setShowDeleteGroupModal(false)}>
              Cancel
            </Button>
            <Button
              variant={groupDeleteAction === "delete_contacts" ? "danger" : "primary"}
              size="sm"
              isLoading={isDeletingGroup}
              disabled={isDeletingGroup || (groupDeleteAction === "move" && !groupMoveTarget.trim())}
              onClick={handleExecuteDeleteGroup}
              className="inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {groupDeleteAction === "delete_contacts" ? (
                <>
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Delete Group & Contacts</span>
                </>
              ) : groupDeleteAction === "move" ? (
                <>
                  <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                  <span>Move & Delete Group</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Keep Contacts & Delete Group</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
