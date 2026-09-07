import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Prospect, ProspectStatus } from "../../types";
import { fetchApi, invalidateApiCache } from "../../api-client";
import { toast } from "sonner";
import {
  User,
  Phone,
  Mail,
  Building2,
  Tag,
  AlertTriangle,
  Save,
  Folder,
  ChevronDown,
  Check,
  Plus
} from "lucide-react";

interface ProspectEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (prospect: Prospect) => void;
  prospect?: Prospect | null;
  availableGroups?: string[];
}

const STATUS_OPTIONS: { value: ProspectStatus; label: string }[] = [
  { value: "New", label: "New Lead" },
  { value: "Contacted", label: "Contacted" },
  { value: "Connected", label: "Connected" },
  { value: "Interested", label: "Interested" },
  { value: "Not Interested", label: "Not Interested" },
  { value: "Callback Requested", label: "Callback Requested" },
  { value: "Do Not Contact", label: "Do Not Contact (DNC)" },
  { value: "Invalid", label: "Invalid Phone" },
];

export function ProspectEditorModal({
  isOpen,
  onClose,
  onSaved,
  prospect,
  availableGroups = [],
}: ProspectEditorModalProps) {
  const isEditing = Boolean(prospect);

  // Clean Essential Form State Only
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<ProspectStatus>("New");
  
  // Contact Group State (Existing vs New)
  const [existingGroups, setExistingGroups] = useState<string[]>(availableGroups);
  const [isCustomNew, setIsCustomNew] = useState(false);
  const [groupTag, setGroupTag] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isSaving, setIsSaving] = useState(false);

  // Click outside to close group dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Sync availableGroups when provided
  useEffect(() => {
    if (availableGroups && availableGroups.length > 0) {
      setExistingGroups((prev) => Array.from(new Set([...prev, ...availableGroups])).sort());
    }
  }, [availableGroups]);

  // Fetch distinct groups when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchGroups();
    }
  }, [isOpen]);

  const fetchGroups = async () => {
    try {
      const res = await fetchApi<{ groups: string[] }>("/prospects/groups");
      if (res && res.groups && res.groups.length > 0) {
        setExistingGroups((prev) => Array.from(new Set([...prev, ...res.groups])).sort());
      }
    } catch {}
  };

  useEffect(() => {
    if (prospect) {
      setFullName(prospect.full_name || `${prospect.first_name || ""} ${prospect.last_name || ""}`.trim());
      setPhoneNumber(prospect.phone_number || "");
      setEmail(prospect.email || "");
      setCompany(prospect.company || "");
      setStatus(prospect.status || "New");
      const currentGroup = prospect.group_name || (prospect.tags && prospect.tags.length > 0 ? prospect.tags[0] : "");
      setGroupTag(currentGroup);
      if (currentGroup && existingGroups.length > 0 && !existingGroups.includes(currentGroup)) {
        setIsCustomNew(true);
      } else {
        setIsCustomNew(false);
      }
    } else {
      setFullName("");
      setPhoneNumber("");
      setEmail("");
      setCompany("");
      setStatus("New");
      setIsCustomNew(false);
      if (existingGroups.length > 0) {
        setGroupTag(existingGroups[0]);
      } else {
        setGroupTag("");
      }
    }
  }, [prospect, isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumber.trim()) {
      toast.error("Phone number is required.");
      return;
    }

    // Split name into first and last
    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || undefined;

    // Parse group / tags
    const parsedTags = groupTag
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);

    const payload = {
      full_name: fullName.trim() || undefined,
      first_name: firstName || undefined,
      last_name: lastName,
      phone_number: phoneNumber.trim(),
      email: email.trim() || undefined,
      company: company.trim() || undefined,
      status,
      group_name: groupTag.trim() || undefined,
      tags: parsedTags,
      custom_fields: prospect?.custom_fields || {},
    };

    try {
      setIsSaving(true);
      let result: Prospect;

      if (isEditing && prospect) {
        result = await fetchApi<Prospect>(`/prospects/${prospect.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success(`Contact "${result.full_name}" updated successfully.`);
      } else {
        result = await fetchApi<Prospect>("/prospects", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success(`Contact "${result.full_name}" added successfully.`);
      }

      invalidateApiCache("/prospects");
      onSaved(result);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save contact.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Contact: ${prospect?.full_name}` : "Add New Contact"}
      description="Enter contact details for AI calling campaigns and CRM tracking."
      maxWidth="md"
    >
      <form onSubmit={handleSave} className="space-y-4 text-xs text-left">
        {status === "Do Not Contact" && (
          <div className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Do Not Contact (DNC) Active:</strong> Outbound AI calling is blocked for this number.
            </span>
          </div>
        )}

        {/* Clean, Responsive Form Grid */}
        <div className="space-y-3">
          {/* Row 1: Full Name & Contact Group */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Full Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Full Name</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Alexander Wright"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>

            {/* Contact Group / List */}
            <div className="space-y-1" ref={dropdownRef}>
              <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>Contact Group <span className="text-[10px] text-[var(--color-muted)] font-normal">(Optional)</span></span>
                </span>
                {!isCustomNew ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomNew(true);
                      setGroupTag("");
                      setDropdownOpen(false);
                    }}
                    className="text-[11px] text-[var(--color-primary)] hover:underline font-medium cursor-pointer"
                  >
                    + New
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomNew(false);
                      if (existingGroups.length > 0) setGroupTag(existingGroups[0]);
                      else setGroupTag("");
                    }}
                    className="text-[11px] text-[var(--color-muted)] hover:underline font-medium cursor-pointer"
                  >
                    ← Existing
                  </button>
                )}
              </label>

              {!isCustomNew ? (
                <div className="relative">
                  {/* Custom Dropdown Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((prev) => !prev)}
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] flex items-center justify-between focus:outline-hidden focus:ring-1 focus:ring-[var(--color-primary)] font-medium text-left cursor-pointer hover:border-[var(--color-border-hover)] transition-colors"
                  >
                    <span className="truncate pr-2">
                      {groupTag ? groupTag : <span className="text-[var(--color-muted)] font-normal">-- Select Group (or Unassigned) --</span>}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-[var(--color-muted)] shrink-0 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* Popover Dropdown Menu (Strictly bounded to w-full inside container with internal scroll) */}
                  {dropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-2xl z-50 max-h-48 overflow-y-auto py-1 text-xs">
                      {/* Unassigned Option */}
                      <button
                        type="button"
                        onClick={() => {
                          setGroupTag("");
                          setDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[var(--color-surface-muted)] transition-colors ${
                          !groupTag ? "text-[var(--color-primary)] font-semibold bg-[var(--color-primary-light)]/20" : "text-[var(--color-muted)]"
                        }`}
                      >
                        <span className="truncate">-- Select Group (or Unassigned) --</span>
                        {!groupTag && <Check className="w-3.5 h-3.5 shrink-0 text-[var(--color-primary)]" />}
                      </button>

                      {/* Existing Groups List */}
                      {existingGroups.map((grp) => {
                        const isSelected = groupTag.toLowerCase() === grp.toLowerCase();
                        return (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => {
                              setGroupTag(grp);
                              setDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[var(--color-surface-muted)] transition-colors ${
                              isSelected ? "text-[var(--color-primary)] font-semibold bg-[var(--color-primary-light)]/20" : "text-[var(--color-text)]"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <Folder className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
                              <span className="truncate">{grp}</span>
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[var(--color-primary)]" />}
                          </button>
                        );
                      })}

                      <div className="border-t border-[var(--color-border)] my-1"></div>

                      {/* Create New Group Action */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomNew(true);
                          setGroupTag("");
                          setDropdownOpen(false);
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-1.5 text-[var(--color-primary)] font-semibold hover:bg-[var(--color-surface-muted)] transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>+ Create New Group...</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder="Enter new group name (e.g. Q3 Healthcare Leads)"
                    value={groupTag}
                    onChange={(e) => setGroupTag(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-hidden focus:ring-1 focus:ring-[var(--color-primary)] font-medium"
                  />
                  {existingGroups.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                      <span>Or pick existing:</span>
                      <div className="flex flex-wrap gap-1">
                        {existingGroups.map((grp) => (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => {
                              setGroupTag(grp);
                              setIsCustomNew(false);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-surface-muted)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] font-medium transition-colors cursor-pointer border border-[var(--color-border)]"
                          >
                            <Folder className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                            <span className="truncate max-w-[120px]">{grp}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Phone Number & Email Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Phone Number <span className="text-red-500">*</span></span>
              </label>
              <input
                type="tel"
                required
                placeholder="+14155550123"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                <span>Email Address <span className="text-[10px] text-[var(--color-muted)] font-normal">(Optional)</span></span>
              </label>
              <input
                type="email"
                placeholder="alexander@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          {/* Row 3: Company Name & (Optional) Lead Status */}
          <div className={`grid grid-cols-1 ${isEditing ? "sm:grid-cols-2" : ""} gap-3`}>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                <span>Company Name <span className="text-[10px] text-[var(--color-muted)] font-normal">(Optional)</span></span>
              </label>
              <input
                type="text"
                placeholder="Apex Logistics"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>

            {/* Lead Status - Only shown when editing an existing contact */}
            {isEditing && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-heading)]">Lead Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProspectStatus)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSaving}
            disabled={isSaving}
            className="bg-[var(--color-primary)] text-white"
          >
            {isEditing ? "Save Changes" : "Save Contact"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
