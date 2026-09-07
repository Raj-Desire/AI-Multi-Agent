import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Select } from "../ui/Select";
import {
  CSVValidateResponse,
  CSVImportSummaryResponse
} from "../../types";
import { fetchApi, invalidateApiCache } from "../../api-client";
import { toast } from "sonner";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Layers,
  Copy,
  Download,
  Check,
  RefreshCw
} from "lucide-react";

interface ProspectImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type ImportStep = "upload" | "mapping" | "validation" | "summary";

const TARGET_FIELDS: { value: string; label: string }[] = [
  { value: "", label: "-- Ignore Column --" },
  { value: "full_name", label: "Full Name" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "phone_number", label: "Phone Number (Required)" },
  { value: "email", label: "Email Address" },
  { value: "company", label: "Company Name" },
  { value: "group_name", label: "Group / List Name" },
  { value: "tags", label: "Tags (Comma Separated)" },
];

export function ProspectImportModal({
  isOpen,
  onClose,
  onImportComplete,
}: ProspectImportModalProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [csvContent, setCsvContent] = useState<string>("");
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [duplicatePolicy, setDuplicatePolicy] = useState<string>("skip"); // "skip" | "update"
  
  // Group Mode: "existing" | "new"
  const [groupMode, setGroupMode] = useState<"existing" | "new">("new");
  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [selectedExistingGroup, setSelectedExistingGroup] = useState<string>("");
  const [newGroupName, setNewGroupName] = useState<string>("");

  // Validation State
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<CSVValidateResponse | null>(null);

  // Execution State
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<CSVImportSummaryResponse | null>(null);

  // Load existing groups on modal open
  React.useEffect(() => {
    if (isOpen) {
      fetchExistingGroups();
    }
  }, [isOpen]);

  const fetchExistingGroups = async () => {
    try {
      const res = await fetchApi<{ groups: string[] }>("/prospects/groups");
      if (res && res.groups && res.groups.length > 0) {
        setExistingGroups(res.groups);
        setSelectedExistingGroup(res.groups[0]);
        setGroupMode("existing");
      } else {
        setExistingGroups([]);
        setGroupMode("new");
      }
    } catch {
      setExistingGroups([]);
      setGroupMode("new");
    }
  };

  const resetWizard = () => {
    setStep("upload");
    setFileName("");
    setCsvContent("");
    setDetectedHeaders([]);
    setColumnMapping({});
    setDuplicatePolicy("skip");
    setGroupMode(existingGroups.length > 0 ? "existing" : "new");
    setNewGroupName("");
    setValidationResult(null);
    setImportSummary(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        toast.error("The selected file has no sheets.");
        return;
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet);

      if (!csv || !csv.trim()) {
        toast.error("The selected file is empty or has no readable records.");
        return;
      }

      // CRITICAL: Set csv content in state
      setCsvContent(csv);

      // Default new group name to clean file name
      const cleanFileName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, " ").trim();
      setNewGroupName(cleanFileName || "Imported Contacts");

      // Parse headers from first line
      const firstLine = csv.split("\n")[0] || "";
      const headers = firstLine
        .split(/[,;\t]/)
        .map((h) => h.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);

      setDetectedHeaders(headers);

      // Auto-suggest mappings for standard fields
      const initialMap: Record<string, string> = {};
      for (const h of headers) {
        const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (lower.includes("first") && lower.includes("name")) initialMap[h] = "first_name";
        else if (lower.includes("last") && lower.includes("name")) initialMap[h] = "last_name";
        else if (lower === "name" || lower === "fullname") initialMap[h] = "full_name";
        else if (lower.includes("phone") || lower.includes("mobile") || lower === "cell") initialMap[h] = "phone_number";
        else if (lower.includes("email") || lower.includes("mail")) initialMap[h] = "email";
        else if (lower.includes("company") || lower.includes("organization") || lower.includes("org")) initialMap[h] = "company";
        else if (lower.includes("group") || lower.includes("list")) initialMap[h] = "group_name";
        else if (lower.includes("tag")) initialMap[h] = "tags";
        else initialMap[h] = ""; // default extra columns to ignore
      }

      setColumnMapping(initialMap);
      setStep("mapping");
    } catch (err: any) {
      toast.error("Failed to read file: " + err.message);
    }
  };

  const handleValidate = async () => {
    // Check if phone number is mapped
    const hasPhone = Object.values(columnMapping).some((v) => v === "phone_number");
    if (!hasPhone) {
      toast.error("Please map at least one column to 'Phone Number (Required)'.");
      return;
    }

    try {
      setIsValidating(true);
      const res = await fetchApi<CSVValidateResponse>("/prospects/validate-import", {
        method: "POST",
        body: JSON.stringify({
          csv_content: csvContent,
          column_mapping: columnMapping,
        }),
      });
      setValidationResult(res);
      setStep("validation");
    } catch (err: any) {
      toast.error(err.message || "Failed to validate CSV file.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleExecuteImport = async () => {
    const effectiveGroupName = groupMode === "existing" ? selectedExistingGroup.trim() : newGroupName.trim();
    if (!effectiveGroupName) {
      toast.error("Please specify a Contact Group name (either select an existing group or create a new group).");
      return;
    }

    try {
      setIsImporting(true);
      const tagList = [effectiveGroupName];

      const res = await fetchApi<CSVImportSummaryResponse>("/prospects/import", {
        method: "POST",
        body: JSON.stringify({
          csv_content: csvContent,
          column_mapping: columnMapping,
          duplicate_policy: duplicatePolicy,
          default_group_name: effectiveGroupName,
          default_tags: tagList,
          default_source: "CSV Import",
        }),
      });

      setImportSummary(res);
      setStep("summary");
      invalidateApiCache("/prospects");
      toast.success(`Import complete! ${res.imported_count} contacts imported into "${effectiveGroupName}".`);
      onImportComplete();
    } catch (err: any) {
      toast.error(err.message || "Import failed.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadErrors = () => {
    if (!importSummary || importSummary.errors.length === 0) return;
    const csvRows = ["Row,Phone,Reason"];
    for (const e of importSummary.errors) {
      csvRows.push(`${e.row},"${e.phone}","${e.reason.replace(/"/g, '""')}"`);
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import_errors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetWizard();
        onClose();
      }}
      title="Batch CSV Contact Importer"
      description="Upload, map columns, preview validation diagnostics, and import contacts in bulk."
      maxWidth="xl"
    >
      <div className="space-y-4 text-xs text-left">
        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2 py-2 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] text-[11px]">
          <span className={`font-semibold ${step === "upload" ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>
            1. Upload File
          </span>
          <span className="text-[var(--color-border)]">&rarr;</span>
          <span className={`font-semibold ${step === "mapping" ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>
            2. Map Columns
          </span>
          <span className="text-[var(--color-border)]">&rarr;</span>
          <span className={`font-semibold ${step === "validation" ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>
            3. Validate &amp; Preview
          </span>
          <span className="text-[var(--color-border)]">&rarr;</span>
          <span className={`font-semibold ${step === "summary" ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>
            4. Summary
          </span>
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] rounded-[var(--radius-main,0.375rem)] p-8 text-center bg-[var(--color-surface)]/50 transition-colors">
              <UploadCloud className="w-10 h-10 mx-auto text-[var(--color-primary)] mb-3 opacity-80" />
              <p className="text-sm font-semibold text-[var(--color-heading)] mb-1">
                Select or drag an Excel or CSV file
              </p>
              <p className="text-xs text-[var(--color-muted)] mb-4">
                Supported formats: Microsoft Excel (.xlsx, .xls) and CSV (.csv, .tsv, .txt)
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)] text-white font-medium cursor-pointer hover:opacity-90 shadow-xs">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Browse Excel / CSV Files</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] text-[11px] text-[var(--color-muted)] space-y-1">
              <p className="font-semibold text-[var(--color-heading)]">Supported Sample CSV Format:</p>
              <code className="block bg-[var(--color-background)] p-2 rounded border border-[var(--color-border)] text-[10px] font-mono">
                first_name,last_name,phone,email,company,interest<br />
                Alexander,Wright,+14155550123,alex@example.com,Apex Logistics,Enterprise<br />
                Elena,Rostova,+14155550124,elena@sample.org,Global Health,Startup
              </code>
            </div>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === "mapping" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
              <div>
                <p className="font-semibold text-[var(--color-heading)]">File: {fileName}</p>
                <p className="text-[11px] text-[var(--color-muted)]">
                  {detectedHeaders.length} columns identified. Match each CSV column to platform fields.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cleanMap: Record<string, string> = {};
                    detectedHeaders.forEach((h) => {
                      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
                      if (lower.includes("phone") || lower.includes("mobile") || lower === "cell") cleanMap[h] = "phone_number";
                      else if (lower.includes("first") && lower.includes("name")) cleanMap[h] = "first_name";
                      else if (lower.includes("last") && lower.includes("name")) cleanMap[h] = "last_name";
                      else if (lower === "name" || lower === "fullname") cleanMap[h] = "full_name";
                      else if (lower.includes("email") || lower.includes("mail")) cleanMap[h] = "email";
                      else if (lower.includes("company") || lower.includes("org")) cleanMap[h] = "company";
                      else if (lower.includes("tag") || lower.includes("group")) cleanMap[h] = "tags";
                      else cleanMap[h] = "";
                    });
                    setColumnMapping(cleanMap);
                    toast.info("Ignoring extra columns. Standard fields only.");
                  }}
                  className="px-2.5 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)] text-[var(--color-heading)] font-medium cursor-pointer"
                >
                  Ignore Extra Fields
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const extraMap = { ...columnMapping };
                    detectedHeaders.forEach((h) => {
                      if (!extraMap[h]) {
                        extraMap[h] = h.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                      }
                    });
                    setColumnMapping(extraMap);
                    toast.info("Including extra columns as custom attributes.");
                  }}
                  className="px-2.5 py-1 text-xs rounded border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] font-medium cursor-pointer"
                >
                  Include Extra Fields
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {detectedHeaders.map((header) => {
                const currentVal = columnMapping[header] || "";
                const isCustom = !TARGET_FIELDS.some((tf) => tf.value === currentVal) && currentVal !== "";

                return (
                  <div
                    key={header}
                    className="flex items-center justify-between gap-3 p-2 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]"
                  >
                    <div className="w-1/3 min-w-0">
                      <span className="font-mono text-xs font-semibold text-[var(--color-heading)] truncate block">
                        {header}
                      </span>
                    </div>

                    <div className="flex-1">
                      <select
                        value={isCustom ? "__custom__" : currentVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__custom__") {
                            setColumnMapping({
                              ...columnMapping,
                              [header]: header.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                            });
                          } else {
                            setColumnMapping({ ...columnMapping, [header]: val });
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)]"
                      >
                        {TARGET_FIELDS.map((tf) => (
                          <option key={tf.value} value={tf.value}>
                            {tf.label}
                          </option>
                        ))}
                        <option value="__custom__">-- Map as Custom Field --</option>
                      </select>
                    </div>

                    {isCustom && (
                      <div className="w-1/3">
                        <input
                          type="text"
                          placeholder="Custom Key Name"
                          value={currentVal}
                          onChange={(e) =>
                            setColumnMapping({
                              ...columnMapping,
                              [header]: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                            })
                          }
                          className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
              <Button variant="ghost" size="sm" onClick={() => setStep("upload")} leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isValidating}
                onClick={handleValidate}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Validate Records
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Validation Preview */}
        {step === "validation" && validationResult && (
          <div className="space-y-4">
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
                <div className="text-lg font-bold text-[var(--color-heading)]">{validationResult.total_rows}</div>
                <div className="text-[10px] text-[var(--color-muted)]">Total Rows</div>
              </div>
              <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{validationResult.valid_count}</div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Valid</div>
              </div>
              <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-amber-500/10 border border-amber-500/30">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{validationResult.duplicate_count}</div>
                <div className="text-[10px] text-amber-600 dark:text-amber-400">Duplicates</div>
              </div>
              <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-rose-500/10 border border-rose-500/30">
                <div className="text-lg font-bold text-rose-600 dark:text-rose-400">{validationResult.invalid_count}</div>
                <div className="text-[10px] text-rose-600 dark:text-rose-400">Invalid</div>
              </div>
            </div>

            {/* Group Assignment & Duplicate Strategy */}
            <div className="p-3.5 bg-[var(--color-surface-muted)] rounded-lg border border-[var(--color-border)] space-y-3">
              <div className="flex items-center justify-between p-2 rounded bg-[var(--color-primary-subtle,rgba(59,130,246,0.08))] text-[var(--color-primary)] border border-[var(--color-primary)]/20 text-xs">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Group Assignment:</strong> Organize these contacts into an existing group or a brand new group for targeting in campaigns.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Group Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[var(--color-heading)]">
                    Contact Group / List Name: <span className="text-red-500">*</span>
                  </label>

                  {/* Mode Selector Tabs */}
                  <div className="flex items-center p-0.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-xs">
                    <button
                      type="button"
                      onClick={() => setGroupMode("existing")}
                      disabled={existingGroups.length === 0}
                      className={`flex-1 py-1 px-2 rounded font-medium transition-all ${
                        groupMode === "existing"
                          ? "bg-[var(--color-primary)] text-white shadow-xs"
                          : "text-[var(--color-muted)] hover:text-[var(--color-heading)] disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                    >
                      Existing Group ({existingGroups.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupMode("new")}
                      className={`flex-1 py-1 px-2 rounded font-medium transition-all ${
                        groupMode === "new"
                          ? "bg-[var(--color-primary)] text-white shadow-xs"
                          : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                      }`}
                    >
                      + Create New Group
                    </button>
                  </div>

                  {groupMode === "existing" && existingGroups.length > 0 ? (
                    <div>
                      <select
                        value={selectedExistingGroup}
                        onChange={(e) => setSelectedExistingGroup(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)] font-medium focus:outline-hidden focus:ring-1 focus:ring-[var(--color-primary)]"
                      >
                        {existingGroups.map((grp) => (
                          <option key={grp} value={grp}>
                            {grp}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-[var(--color-muted)] mt-1 block">
                        New contacts will be added directly into the selected existing group.
                      </span>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Q3 Healthcare Inbound Leads"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)] font-medium focus:outline-hidden focus:ring-1 focus:ring-[var(--color-primary)]"
                      />
                      <span className="text-[10px] text-[var(--color-muted)] mt-1 block">
                        Creates a new distinct group for this import audience.
                      </span>
                    </div>
                  )}
                </div>

                {/* Duplicate Policy */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[var(--color-heading)]">
                    Duplicate Phone Policy:
                  </label>
                  <select
                    value={duplicatePolicy}
                    onChange={(e) => setDuplicatePolicy(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)]"
                  >
                    <option value="skip">Skip duplicates (Preserve existing contacts)</option>
                    <option value="update">Update / Merge existing contacts with new CSV fields</option>
                  </select>
                  <span className="text-[10px] text-[var(--color-muted)] mt-1 block">
                    Choose whether matching normalized phone numbers should be updated or ignored.
                  </span>
                </div>
              </div>
            </div>

            {/* Error List if any */}
            {validationResult.all_errors.length > 0 && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-[var(--radius-main,0.375rem)] max-h-36 overflow-y-auto">
                <div className="font-semibold text-rose-600 dark:text-rose-400 text-xs mb-1.5 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Validation Warnings ({validationResult.all_errors.length} rows with issues)</span>
                </div>
                <div className="space-y-1 text-[11px] text-rose-700 dark:text-rose-300 font-mono">
                  {validationResult.all_errors.slice(0, 10).map((err, i) => (
                    <div key={i}>
                      Row {err.row}: {err.errors.join("; ")}
                    </div>
                  ))}
                  {validationResult.all_errors.length > 10 && (
                    <div className="opacity-75 italic text-[10px]">
                      + {validationResult.all_errors.length - 10} more rows with errors
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sample Table */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                Sample Validated Rows Preview (First 5)
              </div>
              <div className="border border-[var(--color-border)] rounded-md overflow-x-auto bg-[var(--color-surface)]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[var(--color-surface-muted)] text-[var(--color-muted)] font-semibold border-b border-[var(--color-border)]">
                    <tr>
                      <th className="px-3 py-2 text-center w-12">Row</th>
                      <th className="px-3 py-2 whitespace-nowrap">Name</th>
                      <th className="px-3 py-2 whitespace-nowrap">Phone Number</th>
                      <th className="px-3 py-2 whitespace-nowrap">Email</th>
                      <th className="px-3 py-2 whitespace-nowrap">Company</th>
                      <th className="px-3 py-2 text-center whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {validationResult.sample_rows.slice(0, 5).map((r) => (
                      <tr key={r.row_number} className={`hover:bg-[var(--color-surface-muted)]/50 transition-colors ${r.is_valid ? "" : "bg-rose-500/5"}`}>
                        <td className="px-3 py-2 text-center font-mono text-[var(--color-muted)]">#{r.row_number}</td>
                        <td className="px-3 py-2 font-medium text-[var(--color-heading)] whitespace-nowrap">{r.data.first_name || r.data.full_name || "-"}</td>
                        <td className="px-3 py-2 font-mono font-medium text-[var(--color-heading)] whitespace-nowrap">{r.data.phone_number || "-"}</td>
                        <td className="px-3 py-2 text-[var(--color-muted)] whitespace-nowrap">{r.data.email || "-"}</td>
                        <td className="px-3 py-2 text-[var(--color-muted)] whitespace-nowrap">{r.data.company || "-"}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {r.is_valid ? (
                            r.is_duplicate ? (
                              <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Duplicate</span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Valid</span>
                            )
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Error</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Navigation Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
              <Button variant="ghost" size="sm" onClick={() => setStep("mapping")} leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
                Adjust Mapping
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isImporting}
                onClick={handleExecuteImport}
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
              >
                Confirm &amp; Import Contacts
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Summary */}
        {step === "summary" && importSummary && (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[var(--color-heading)]">Batch Import Successfully Completed</h3>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Your workspace contacts database has been updated and is ready for campaigns.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center my-4">
              <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
                <div className="text-lg font-bold text-[var(--color-heading)]">{importSummary.total_rows}</div>
                <div className="text-[10px] text-[var(--color-muted)]">Total Rows</div>
              </div>
              <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{importSummary.imported_count}</div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Imported</div>
              </div>
              <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-indigo-500/10 border border-indigo-500/30">
                <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{importSummary.updated_count}</div>
                <div className="text-[10px] text-indigo-600 dark:text-indigo-400">Updated</div>
              </div>
              <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-amber-500/10 border border-amber-500/30">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{importSummary.skipped_count}</div>
                <div className="text-[10px] text-amber-600 dark:text-amber-400">Skipped</div>
              </div>
            </div>

            {importSummary.invalid_count > 0 && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-[var(--radius-main,0.375rem)] flex items-center justify-between text-left">
                <div>
                  <span className="font-semibold text-rose-600 dark:text-rose-400 text-xs block">
                    {importSummary.invalid_count} records could not be imported due to errors.
                  </span>
                  <span className="text-[11px] text-rose-700 dark:text-rose-300">
                    Download the error report to inspect and correct invalid rows.
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadErrors}
                  leftIcon={<Download className="w-3 h-3" />}
                >
                  Download Errors CSV
                </Button>
              </div>
            )}

            <div className="pt-3 border-t border-[var(--color-border)] flex justify-center">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  resetWizard();
                  onClose();
                }}
              >
                Close &amp; View Contacts
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
