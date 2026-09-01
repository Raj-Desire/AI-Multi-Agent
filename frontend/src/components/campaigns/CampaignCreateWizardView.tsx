import React, { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { Button } from "../ui/Button";
import { LoadingState } from "../ui/LoadingState";
import { Modal } from "../ui/Modal";
import { fetchApi } from "../../api-client";
import {
  Campaign,
  CampaignCallingConfig,
  CampaignSchedule,
  ProspectSelectionFilter,
  CreateCampaignPayload,
  Prospect,
  TwilioConfig,
} from "../../types";
import { toast } from "sonner";
import {
  Megaphone,
  Bot,
  Users,
  PhoneCall,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ShieldCheck,
  Clock,
  Sparkles,
  Sliders,
  AlertCircle,
  Search,
  Check,
  Layers,
  HelpCircle,
  UserPlus,
  X,
  Globe,
  Info,
  CalendarDays,
  UploadCloud,
  FileSpreadsheet,
  Folder,
  ArrowLeft,
  Save,
  Trash2,
  Eye,
  Plus,
} from "lucide-react";

interface CampaignCreateWizardViewProps {
  onCancel: () => void;
  onCampaignCreated: (campaign: Campaign) => void;
  onDirtyChange?: (isDirty: boolean, handleSaveDraft: () => Promise<void>, handleDiscard: () => void) => void;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

interface TimezoneOption {
  label: string;
  value: string;
  region: string;
}

// Dynamically generate all 400+ real-time IANA timezones using the native Intl ECMAScript engine
const getSystemTimezones = (): { region: string; options: TimezoneOption[] }[] => {
  try {
    if (typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function") {
      const rawTimezones: string[] = (Intl as any).supportedValuesOf("timeZone");
      const now = new Date();

      const options: TimezoneOption[] = rawTimezones.map((tz) => {
        let offsetStr = "UTC";
        try {
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            timeZoneName: "shortOffset",
          });
          const parts = formatter.formatToParts(now);
          const tzPart = parts.find((p) => p.type === "timeZoneName");
          offsetStr = tzPart ? tzPart.value.replace("GMT", "UTC") : "UTC";
        } catch {
          // fallback offset
        }

        const region = tz.includes("/") ? tz.split("/")[0].replace(/_/g, " ") : "Global";
        const city = tz.includes("/") ? tz.split("/").slice(1).join("/").replace(/_/g, " ") : tz;

        return {
          value: tz,
          label: `(${offsetStr}) ${city} (${tz})`,
          region,
        };
      });

      // Group by continent / region
      const grouped: Record<string, TimezoneOption[]> = {};
      options.forEach((opt) => {
        if (!grouped[opt.region]) grouped[opt.region] = [];
        grouped[opt.region].push(opt);
      });

      return Object.keys(grouped)
        .sort()
        .map((region) => ({
          region,
          options: grouped[region].sort((a, b) => a.label.localeCompare(b.label)),
        }));
    }
  } catch (err) {
    console.warn("Intl.supportedValuesOf not supported, using fallback", err);
  }

  // Standard fallback
  return [
    {
      region: "Global",
      options: [
        { label: "(UTC+00:00) UTC (Universal Coordinated Time)", value: "UTC", region: "Global" },
        { label: "(UTC+05:30) Asia/Kolkata (India Standard Time)", value: "Asia/Kolkata", region: "Asia" },
        { label: "(UTC-05:00) America/New_York (US Eastern)", value: "America/New_York", region: "America" },
        { label: "(UTC-08:00) America/Los_Angeles (US Pacific)", value: "America/Los_Angeles", region: "America" },
        { label: "(UTC+00:00) Europe/London (GMT/BST)", value: "Europe/London", region: "Europe" },
        { label: "(UTC+01:00) Europe/Paris (Central European)", value: "Europe/Paris", region: "Europe" },
        { label: "(UTC+04:00) Asia/Dubai (Gulf Standard Time)", value: "Asia/Dubai", region: "Asia" },
        { label: "(UTC+08:00) Asia/Singapore (SGT)", value: "Asia/Singapore", region: "Asia" },
        { label: "(UTC+09:00) Asia/Tokyo (Japan Standard Time)", value: "Asia/Tokyo", region: "Asia" },
        { label: "(UTC+10:00) Australia/Sydney (AEST)", value: "Australia/Sydney", region: "Australia" },
      ],
    },
  ];
};

const ALL_SYSTEM_TIMEZONES = getSystemTimezones();
const FLAT_SYSTEM_TIMEZONES: TimezoneOption[] = ALL_SYSTEM_TIMEZONES.flatMap((g) => g.options);

// Fuzzy & offset-aware timezone matcher (supports "5.30", "5:30", "kolkata", "delhi", "new york", "pst", "est", etc.)
const filterTimezonesList = (query: string): TimezoneOption[] => {
  if (!query.trim()) return FLAT_SYSTEM_TIMEZONES;
  const q = query.toLowerCase().trim();
  const cleanQ = q.replace(/[:.]/g, ""); // "5.30" -> "530", "5:30" -> "530"

  return FLAT_SYSTEM_TIMEZONES.filter((opt) => {
    const labelLower = opt.label.toLowerCase();
    const valLower = opt.value.toLowerCase();
    const regionLower = opt.region.toLowerCase();

    // 1. Direct label or value or region contains search text
    if (labelLower.includes(q) || valLower.includes(q) || regionLower.includes(q)) return true;

    // 2. Numerical offset match e.g. "5.30", "5:30", "+5:30", "530", "0530"
    const cleanLabel = labelLower.replace(/[:.]/g, "");
    if (cleanLabel.includes(cleanQ)) return true;

    // 3. Indian / Kolkata / IST aliases
    if (
      (q.includes("kolkata") || q.includes("calcutta") || q.includes("india") || q.includes("ist") || cleanQ === "530" || cleanQ === "0530" || cleanQ === "+530") &&
      opt.value === "Asia/Kolkata"
    ) {
      return true;
    }

    // 4. US / UK / Dubai aliases
    if ((q.includes("est") || q.includes("eastern")) && opt.value.includes("New_York")) return true;
    if ((q.includes("pst") || q.includes("pacific")) && opt.value.includes("Los_Angeles")) return true;
    if ((q.includes("cst") || q.includes("central")) && opt.value.includes("Chicago")) return true;
    if ((q.includes("gmt") || q.includes("london") || q.includes("uk")) && opt.value.includes("London")) return true;
    if (q.includes("dubai") && opt.value.includes("Dubai")) return true;

    return false;
  });
};

export function CampaignCreateWizardView({
  onCancel,
  onCampaignCreated,
  onDirtyChange,
}: CampaignCreateWizardViewProps) {
  const [step, setStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  // Available Resources
  const [agents, setAgents] = useState<any[]>([]);
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectTotal, setProspectTotal] = useState<number>(0);
  const [prospectSearch, setProspectSearch] = useState<string>("");

  // Step 1: Basic Information
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Step 2: Agent Selection
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  // Step 3: Audience Selection
  const [selectionMode, setSelectionMode] = useState<"all" | "tags" | "manual">("tags");
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [excludeDnc, setExcludeDnc] = useState<boolean>(true);
  const [inspectingGroup, setInspectingGroup] = useState<string | null>(null);

  // Quick Add Contact On-The-Fly State
  const [showQuickAddContact, setShowQuickAddContact] = useState<boolean>(false);
  const [quickFirstName, setQuickFirstName] = useState<string>("");
  const [quickLastName, setQuickLastName] = useState<string>("");
  const [quickPhone, setQuickPhone] = useState<string>("");
  const [quickEmail, setQuickEmail] = useState<string>("");
  const [quickCompany, setQuickCompany] = useState<string>("");
  const [quickGroupMode, setQuickGroupMode] = useState<"existing" | "new">("existing");
  const [quickGroup, setQuickGroup] = useState<string>("");
  const [quickDropdownOpen, setQuickDropdownOpen] = useState<boolean>(false);
  const quickDropdownRef = useRef<HTMLDivElement>(null);
  const [isAddingContact, setIsAddingContact] = useState<boolean>(false);

  // Click outside to close quick group dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickDropdownRef.current && !quickDropdownRef.current.contains(e.target as Node)) {
        setQuickDropdownOpen(false);
      }
    };
    if (quickDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [quickDropdownOpen]);

  // Direct CSV Import inside Campaign Wizard State
  const [showDirectCsvImport, setShowDirectCsvImport] = useState<boolean>(false);
  const [directCsvFile, setDirectCsvFile] = useState<File | null>(null);
  const [directCsvFileName, setDirectCsvFileName] = useState<string>("");
  const [directCsvContent, setDirectCsvContent] = useState<string>("");
  const [directCsvGroupName, setDirectCsvGroupName] = useState<string>("");
  const [isImportingDirectCsv, setIsImportingDirectCsv] = useState<boolean>(false);

  // Step 4: Calling & Concurrency
  const [callerNumber, setCallerNumber] = useState<string>("");
  const [maxConcurrent, setMaxConcurrent] = useState<number>(5);
  const [maxAttempts, setMaxAttempts] = useState<number>(3);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState<number>(120);
  const [callTimeoutSeconds, setCallTimeoutSeconds] = useState<number>(30);

  // Step 5: Schedule & Timezone
  const todayStr = new Date().toISOString().split("T")[0];
  const [scheduleMode, setScheduleMode] = useState<"single_day" | "date_range" | "recurring">("date_range");
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>("");
  const [callingDays, setCallingDays] = useState<string[]>([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ]);
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("18:00");

  // Real-time detected browser timezone default & search combobox state
  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [timezone, setTimezone] = useState<string>(defaultTz);
  const [tzSearchQuery, setTzSearchQuery] = useState<string>("");
  const [isTzDropdownOpen, setIsTzDropdownOpen] = useState<boolean>(false);

  // Step 6: Review & Launch
  const [startImmediately, setStartImmediately] = useState<boolean>(false);

  // Compute if editor is dirty
  const isDirty = Boolean(
    name.trim() ||
    description.trim() ||
    selectedProspectIds.length > 0 ||
    selectedTags.length > 0 ||
    step > 1
  );

  // Inform parent of dirty state for tab change interception
  const handleSaveDraft = useCallback(async () => {
    if (!name.trim()) {
      toast.info("Draft saved locally.");
      return;
    }
    try {
      const payload: CreateCampaignPayload = {
        name: `${name.trim()} (Draft)`,
        description: description.trim() || undefined,
        calling_config: {
          agent_id: selectedAgentId || (agents.length > 0 ? agents[0].id : "agt_receptionist_default"),
          caller_phone_number: callerNumber || (availableNumbers.length > 0 ? availableNumbers[0] : "+10000000000"),
          max_concurrent_calls: maxConcurrent,
          max_attempts_per_prospect: maxAttempts,
          retry_delay_minutes: maxAttempts === 1 ? 0 : retryDelayMinutes,
          call_timeout_seconds: callTimeoutSeconds,
        },
        schedule: {
          start_date: startDate || undefined,
          end_date: scheduleMode === "single_day" ? startDate : endDate || undefined,
          calling_days: callingDays.length > 0 ? callingDays : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          calling_start_time: startTime || "09:00",
          calling_end_time: endTime || "18:00",
          timezone: timezone || "UTC",
        },
        prospect_selection: {
          tags: selectionMode === "tags" ? selectedTags : undefined,
          prospect_ids: selectionMode === "manual" ? selectedProspectIds : undefined,
          exclude_dnc: excludeDnc,
        },
      };
      await fetchApi<Campaign>("/campaigns", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Campaign draft saved successfully.");
    } catch (err: any) {
      toast.error("Failed to save draft: " + err.message);
    }
  }, [
    name,
    description,
    selectedAgentId,
    callerNumber,
    maxConcurrent,
    maxAttempts,
    retryDelayMinutes,
    callTimeoutSeconds,
    startDate,
    endDate,
    scheduleMode,
    callingDays,
    startTime,
    endTime,
    timezone,
    selectionMode,
    selectedTags,
    selectedProspectIds,
    excludeDnc
  ]);

  const handleDiscard = useCallback(() => {
    // Reset state
  }, []);

  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(isDirty, handleSaveDraft, handleDiscard);
    }
  }, [isDirty, onDirtyChange, handleSaveDraft, handleDiscard]);

  // Load prerequisites on mount
  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Agents
      const agentsRes = await fetchApi<any[]>("/agents");
      if (Array.isArray(agentsRes)) {
        setAgents(agentsRes);
        if (agentsRes.length > 0) {
          setSelectedAgentId(agentsRes[0].agent_id || agentsRes[0].id || "agt_receptionist_default");
        }
      }

      // 2. Fetch Twilio Config
      try {
        const twRes = await fetchApi<TwilioConfig>("/twilio/configuration");
        if (twRes && twRes.phone_number) {
          setTwilioConfig(twRes);
          const nums = twRes.phone_number.split(",").map((n) => n.trim()).filter(Boolean);
          setAvailableNumbers(nums);
          if (nums.length > 0) {
            setCallerNumber(nums[0]);
          }
        }
      } catch (err) {
        console.warn("Twilio config not available:", err);
      }

      // 3. Fetch Prospects
      const prspRes = await fetchApi<{ items: Prospect[]; total: number }>("/prospects?page=1&page_size=200");
      if (prspRes && prspRes.items) {
        setProspects(prspRes.items);
        setProspectTotal(prspRes.total);

        // Extract available tags
        const tagsSet = new Set<string>();
        prspRes.items.forEach((p) => {
          if (p.tags && Array.isArray(p.tags)) {
            p.tags.forEach((t) => tagsSet.add(t));
          }
        });
        setAvailableTags(Array.from(tagsSet));
      }
    } catch (err: any) {
      toast.error("Failed to load campaign prerequisites: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getWeekdayFromDate = (dateStr: string): string => {
    if (!dateStr) return "Monday";
    const date = new Date(dateStr + "T00:00:00");
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()] || "Monday";
  };

  const toggleCallingDay = (day: string) => {
    if (scheduleMode === "single_day") {
      setCallingDays([day]);
      return;
    }
    if (callingDays.includes(day)) {
      if (callingDays.length > 1) {
        setCallingDays(callingDays.filter((d) => d !== day));
      } else {
        toast.warning("At least one calling day must be selected.");
      }
    } else {
      setCallingDays([...callingDays, day]);
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (scheduleMode === "single_day") {
      setEndDate(val);
      const day = getWeekdayFromDate(val);
      setCallingDays([day]);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const toggleProspectSelection = (id: string) => {
    if (selectedProspectIds.includes(id)) {
      setSelectedProspectIds(selectedProspectIds.filter((pid) => pid !== id));
    } else {
      setSelectedProspectIds([...selectedProspectIds, id]);
    }
  };

  const handleQuickAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickFirstName.trim()) {
      toast.error("First name is required.");
      return;
    }
    if (!quickPhone.trim()) {
      toast.error("Phone number is required.");
      return;
    }

    setIsAddingContact(true);
    try {
      const finalGroup = quickGroup.trim();
      const parsedTags = finalGroup ? [finalGroup] : [];

      const payload = {
        first_name: quickFirstName.trim(),
        last_name: quickLastName.trim() || undefined,
        phone_number: quickPhone.trim(),
        email: quickEmail.trim() || undefined,
        company: quickCompany.trim() || undefined,
        group_name: finalGroup || undefined,
        tags: parsedTags,
        status: "New",
      };

      const newProspect = await fetchApi<Prospect>("/prospects", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Prepend to local prospects list
      setProspects((prev) => [newProspect, ...prev]);
      setProspectTotal((prev) => prev + 1);

      // Update available tags
      if (parsedTags.length > 0) {
        setAvailableTags((prev) => {
          const next = new Set([...prev, ...parsedTags]);
          return Array.from(next);
        });
      }

      // If in manual mode, automatically select this new contact
      if (selectionMode === "manual") {
        setSelectedProspectIds((prev) => [...prev, newProspect.id]);
      } else if (selectionMode === "tags" && parsedTags.length > 0) {
        setSelectedTags((prev) => {
          const next = new Set([...prev, ...parsedTags]);
          return Array.from(next);
        });
      }

      toast.success(`Contact "${newProspect.full_name}" added and enrolled!`);

      // Reset form
      setQuickFirstName("");
      setQuickLastName("");
      setQuickPhone("");
      setQuickEmail("");
      setQuickCompany("");
      setQuickGroup("");
      setShowQuickAddContact(false);
    } catch (err: any) {
      toast.error("Failed to add contact: " + err.message);
    } finally {
      setIsAddingContact(false);
    }
  };

  // Handle Excel / CSV file selection for direct campaign import
  const handleDirectCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDirectCsvFile(file);
    setDirectCsvFileName(file.name);
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    setDirectCsvGroupName(cleanName || `Campaign_Group_${new Date().toISOString().split("T")[0]}`);

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
        toast.error("The selected file is empty.");
        return;
      }

      setDirectCsvContent(csv);
    } catch (err: any) {
      toast.error("Failed to parse file: " + err.message);
    }
  };

  // Execute direct CSV import and enroll into campaign
  const handleExecuteDirectCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directCsvContent.trim()) {
      toast.error("Please select a valid CSV file.");
      return;
    }
    if (!directCsvGroupName.trim()) {
      toast.error("Please enter a Group / List name.");
      return;
    }

    setIsImportingDirectCsv(true);
    try {
      const firstLine = directCsvContent.split("\n")[0] || "";
      const headers = firstLine.split(/[,;\t]/).map((h) => h.trim().replace(/^["']|["']$/g, ""));
      const mapping: Record<string, string> = {};
      headers.forEach((h) => {
        const lower = h.toLowerCase();
        if (lower.includes("phone") || lower.includes("mobile") || lower.includes("cell")) {
          mapping[h] = "phone_number";
        } else if (lower.includes("first") || lower === "fn") {
          mapping[h] = "first_name";
        } else if (lower.includes("last") || lower === "ln") {
          mapping[h] = "last_name";
        } else if (lower.includes("name") || lower === "full_name") {
          mapping[h] = "full_name";
        } else if (lower.includes("email") || lower === "mail") {
          mapping[h] = "email";
        } else if (lower.includes("company") || lower.includes("org")) {
          mapping[h] = "company";
        }
      });

      const cleanGroup = directCsvGroupName.trim();
      const res = await fetchApi<{ imported_count: number; total_rows: number; updated_count: number }>("/prospects/import/csv", {
        method: "POST",
        body: JSON.stringify({
          csv_content: directCsvContent,
          column_mapping: mapping,
          duplicate_policy: "skip",
          default_tags: [cleanGroup],
          default_source: "Campaign CSV Import",
        }),
      });

      toast.success(`Imported ${res.imported_count} contacts into group "${cleanGroup}" with status "New Lead"!`);

      // Reload prospects list
      const prspRes = await fetchApi<{ items: Prospect[]; total: number }>("/prospects?page=1&page_size=300");
      if (prspRes && prspRes.items) {
        setProspects(prspRes.items);
        setProspectTotal(prspRes.total);
        const tagsSet = new Set<string>();
        prspRes.items.forEach((p) => (p.tags || []).forEach((t) => tagsSet.add(t)));
        tagsSet.add(cleanGroup);
        setAvailableTags(Array.from(tagsSet));
      }

      // Auto-target this newly imported group for campaign
      setSelectionMode("tags");
      setSelectedTags([cleanGroup]);
      setShowDirectCsvImport(false);
      setDirectCsvFile(null);
      setDirectCsvFileName("");
      setDirectCsvContent("");
    } catch (err: any) {
      toast.error("CSV Import failed: " + err.message);
    } finally {
      setIsImportingDirectCsv(false);
    }
  };

  // Compute estimated audience size
  const computeEstimatedAudience = (): number => {
    if (selectionMode === "all") {
      return excludeDnc
        ? prospects.filter((p) => !p.is_dnc && p.status !== "Do Not Contact").length
        : prospects.length;
    }
    if (selectionMode === "tags") {
      if (selectedTags.length === 0) return 0;
      return prospects.filter((p) => {
        const matchesTag = (p.tags || []).some((t) => selectedTags.includes(t));
        const notDnc = !excludeDnc || (!p.is_dnc && p.status !== "Do Not Contact");
        return matchesTag && notDnc;
      }).length;
    }
    if (selectionMode === "manual") {
      return selectedProspectIds.length;
    }
    return 0;
  };

  const estimatedAudienceCount = computeEstimatedAudience();

  // Validate step navigation
  const handleNextStep = () => {
    if (step === 1) {
      if (!name.trim()) {
        toast.error("Please enter a campaign name.");
        return;
      }
    } else if (step === 2) {
      if (!selectedAgentId) {
        toast.error("Please select an AI Voice Agent.");
        return;
      }
    } else if (step === 3) {
      if (selectionMode === "tags" && selectedTags.length === 0) {
        toast.error("Please select at least one Contact Group.");
        return;
      }
      if (selectionMode === "manual" && selectedProspectIds.length === 0) {
        toast.error("Please select at least one contact manually.");
        return;
      }
      if (estimatedAudienceCount === 0) {
        toast.warning("Target audience has 0 eligible contacts. You may proceed, but no calls will be dispatched until contacts are enrolled.");
      }
    } else if (step === 4) {
      if (!callerNumber.trim()) {
        toast.error("Please specify a Caller ID phone number.");
        return;
      }
      if (maxConcurrent < 1 || maxConcurrent > 50) {
        toast.error("Max concurrent calls must be between 1 and 50.");
        return;
      }
    } else if (step === 5) {
      if (!startDate) {
        toast.error("Please select a start date.");
        return;
      }
      if (scheduleMode === "date_range" && endDate && endDate < startDate) {
        toast.error("End date cannot be earlier than start date.");
        return;
      }
      if (callingDays.length === 0) {
        toast.error("Please select at least one calling day.");
        return;
      }
    }

    setStep((prev) => Math.min(prev + 1, 6));
  };

  // Submit and Create Campaign
  const handleCreateCampaign = async () => {
    try {
      setIsSubmitting(true);

      const callingConfig: CampaignCallingConfig = {
        agent_id: selectedAgentId || (agents.length > 0 ? agents[0].id : "agt_receptionist_default"),
        caller_phone_number: callerNumber || (availableNumbers.length > 0 ? availableNumbers[0] : "+10000000000"),
        max_concurrent_calls: maxConcurrent,
        max_attempts_per_prospect: maxAttempts,
        retry_delay_minutes: maxAttempts === 1 ? 0 : retryDelayMinutes,
        call_timeout_seconds: callTimeoutSeconds,
      };

      const schedule: CampaignSchedule = {
        start_date: startDate || undefined,
        end_date: scheduleMode === "single_day" ? startDate : endDate || undefined,
        calling_days: callingDays.length > 0 ? callingDays : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        calling_start_time: startTime || "09:00",
        calling_end_time: endTime || "18:00",
        timezone: timezone || "UTC",
      };

      const prospectSelection: ProspectSelectionFilter = {
        tags: selectionMode === "tags" ? selectedTags : undefined,
        prospect_ids: selectionMode === "manual" ? selectedProspectIds : undefined,
        exclude_dnc: excludeDnc,
      };

      const payload: CreateCampaignPayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        calling_config: callingConfig,
        schedule: schedule,
        prospect_selection: prospectSelection,
        start_immediately: startImmediately,
      };

      const created = await fetchApi<Campaign>("/campaigns", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // If user selected start immediately, dispatch campaign start
      if (startImmediately && created && created.id) {
        try {
          await fetchApi(`/campaigns/${created.id}/start`, { method: "POST" });
          toast.success(`Campaign "${created.name}" created and launched!`);
        } catch (err: any) {
          toast.warning(`Campaign created as draft, but could not auto-start: ${err.message}`);
        }
      } else {
        toast.success(`Campaign "${created.name}" created successfully as draft.`);
      }

      onCampaignCreated(created);
    } catch (err: any) {
      toast.error("Failed to create campaign: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackClick = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      onCancel();
    }
  };

  const stepsMeta = [
    { num: 1, title: "Campaign Info", icon: Megaphone },
    { num: 2, title: "AI Agent", icon: Bot },
    { num: 3, title: "Audience", icon: Users },
    { num: 4, title: "Concurrency", icon: Sliders },
    { num: 5, title: "Schedule", icon: Calendar },
    { num: 6, title: "Review & Launch", icon: Sparkles },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackClick}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            className="cursor-pointer"
          >
            Back
          </Button>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-heading)] flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[var(--color-primary)]" />
              <span>Create Outbound Calling Campaign</span>
            </h1>
            <p className="text-xs text-[var(--color-muted)]">
              Configure campaign details, select AI voice agent, target audience groups &amp; automated schedule.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-[11px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              ● Unsaved Changes
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveDraft}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            Save Draft
          </Button>
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {stepsMeta.map((s) => {
          const StepIcon = s.icon;
          const isCurrent = step === s.num;
          const isPassed = step > s.num;

          return (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                if (isPassed) setStep(s.num);
              }}
              disabled={!isPassed && !isCurrent}
              className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1.5 ${
                isCurrent
                  ? "bg-[var(--color-primary-subtle,rgba(59,130,246,0.08))] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] text-[var(--color-primary)]"
                  : isPassed
                  ? "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-heading)] cursor-pointer hover:bg-[var(--color-surface-muted)]"
                  : "bg-[var(--color-surface-muted)]/50 border-[var(--color-border)]/50 text-[var(--color-muted)] opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold">0{s.num}</span>
                {isPassed ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <StepIcon className="w-3.5 h-3.5" />
                )}
              </div>
              <span className="text-xs font-semibold truncate">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 sm:p-7 shadow-xs">
        {isLoading ? (
          <div className="py-16">
            <LoadingState message="Loading campaign resources..." subMessage="Fetching AI agents and audience data" />
          </div>
        ) : (
          <div>
            {/* Step 1: Campaign Info */}
            {step === 1 && (
              <div className="space-y-4 max-w-2xl text-left">
                <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[var(--color-primary)]" />
                  <span>Step 1: Campaign Details &amp; Objective</span>
                </h3>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--color-heading)]">
                    Campaign Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Q3 Healthcare Provider Outreach"
                    className="w-full px-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                  <p className="text-[11px] text-[var(--color-muted)]">
                    A distinct internal label for monitoring campaign analytics and dispatch queues.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--color-heading)]">
                    Description &amp; Objective (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Automated appointment follow-ups and service surveys."
                    className="w-full px-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Agent Selection */}
            {step === 2 && (
              <div className="space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[var(--color-primary)]" />
                    <span>Step 2: Select AI Voice Agent</span>
                  </h3>
                  <span className="text-xs text-[var(--color-muted)]">
                    {agents.length} agent{agents.length !== 1 ? "s" : ""} available
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {agents.map((agent) => {
                    const agentId = agent.agent_id || agent.id;
                    const isSelected = selectedAgentId === agentId;
                    const voiceName = agent.voice?.voice || agent.voice || "Aura Voice";

                    return (
                      <div
                        key={agentId}
                        onClick={() => setSelectedAgentId(agentId)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                          isSelected
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle,rgba(59,130,246,0.06))] ring-1 ring-[var(--color-primary)] shadow-xs"
                            : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold">
                              <Bot className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[var(--color-heading)] block">
                                {agent.name || "AI Agent"}
                              </span>
                              <span className="text-[11px] text-[var(--color-muted)] line-clamp-1">
                                {agent.role || "Voice Assistant"}
                              </span>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-[var(--color-primary)]" />}
                        </div>

                        <p className="text-[11px] text-[var(--color-muted)] line-clamp-2 leading-relaxed">
                          {agent.greeting || agent.prompt || "Real-time conversational voice engine."}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)] text-[10px] text-[var(--color-muted)]">
                          <span className="px-2 py-0.5 rounded bg-[var(--color-surface-muted)] font-mono border border-[var(--color-border)]">
                            {voiceName}
                          </span>
                          <span>v{agent.version || 1}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Audience Selection */}
            {step === 3 && (
              <div className="space-y-4 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                    <span className="text-xs text-[var(--color-muted)]">
                      Total Audience Selected: <strong className="text-[var(--color-heading)] text-sm">{estimatedAudienceCount} eligible contacts</strong>
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-[var(--color-heading)] cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={excludeDnc}
                      onChange={(e) => setExcludeDnc(e.target.checked)}
                      className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-0 cursor-pointer"
                    />
                    <span>Exclude Do Not Contact (DNC)</span>
                  </label>
                </div>

                {/* Selection Mode Tabs & Quick Action Buttons */}
                <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3 flex-wrap">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectionMode("tags")}
                      className={`px-3.5 py-1.5 text-xs rounded-md font-medium cursor-pointer transition-all flex items-center gap-1.5 ${
                        selectionMode === "tags"
                          ? "bg-[var(--color-primary)] text-white shadow-2xs font-semibold"
                          : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                      }`}
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>Contact Groups &amp; Lists ({availableTags.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectionMode("all")}
                      className={`px-3.5 py-1.5 text-xs rounded-md font-medium cursor-pointer transition-all ${
                        selectionMode === "all"
                          ? "bg-[var(--color-primary)] text-white shadow-2xs font-semibold"
                          : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                      }`}
                    >
                      All Contacts ({prospects.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectionMode("manual")}
                      className={`px-3.5 py-1.5 text-xs rounded-md font-medium cursor-pointer transition-all ${
                        selectionMode === "manual"
                          ? "bg-[var(--color-primary)] text-white shadow-2xs font-semibold"
                          : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                      }`}
                    >
                      Manual Select ({selectedProspectIds.length})
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDirectCsvImport(!showDirectCsvImport);
                        setShowQuickAddContact(false);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all cursor-pointer flex items-center gap-1.5 border border-[var(--color-primary)]/30"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Import CSV to Campaign</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickAddContact(!showQuickAddContact);
                        setShowDirectCsvImport(false);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--color-surface-muted)] text-[var(--color-heading)] hover:bg-[var(--color-border)] transition-all cursor-pointer flex items-center gap-1.5 border border-[var(--color-border)]"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+ Quick Add</span>
                    </button>
                  </div>
                </div>

                {/* Direct CSV Import Form (Inline) */}
                {showDirectCsvImport && (
                  <form
                    onSubmit={handleExecuteDirectCsvImport}
                    className="p-4 bg-[var(--color-surface-muted)] border border-[var(--color-primary)]/40 rounded-xl space-y-3.5 animate-in fade-in duration-150 shadow-xs"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-2">
                        <UploadCloud className="w-4 h-4 text-[var(--color-primary)]" />
                        <span className="text-xs font-bold text-[var(--color-heading)]">Import CSV Contacts Directly into Campaign</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDirectCsvImport(false)}
                        className="text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-[var(--color-heading)] block mb-1">
                          Select CSV File <span className="text-red-500">*</span>
                        </label>
                        <label className="flex items-center gap-2 px-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)]/50 cursor-pointer transition-colors">
                          <FileSpreadsheet className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                          <span className="truncate flex-1 text-[var(--color-heading)]">
                            {directCsvFileName || "Click to browse .csv file..."}
                          </span>
                          <input
                            type="file"
                            accept=".csv,text/csv,text/plain"
                            onChange={handleDirectCsvFileChange}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-[var(--color-heading)] block mb-1">
                          Assign to Contact Group Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Q3 Healthcare Leads"
                          value={directCsvGroupName}
                          onChange={(e) => setDirectCsvGroupName(e.target.value)}
                          className="w-full px-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-[var(--color-muted)]">
                        All contacts will be created with status <strong>&quot;New Lead&quot;</strong> and targeted for this campaign.
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDirectCsvImport(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={isImportingDirectCsv || !directCsvContent}
                          className="bg-[var(--color-primary)] text-white"
                        >
                          {isImportingDirectCsv ? "Importing & Enrolling..." : "Import & Target Audience"}
                        </Button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Inline Quick Add Contact Form */}
                {showQuickAddContact && (
                  <form
                    onSubmit={handleQuickAddContact}
                    className="p-4 bg-[var(--color-surface-muted)] border border-[var(--color-primary)]/40 rounded-xl space-y-3.5 animate-in fade-in duration-150 shadow-xs"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-[var(--color-primary)]" />
                        <span className="text-xs font-bold text-[var(--color-heading)]">Add Contact Directly to Campaign</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowQuickAddContact(false)}
                        className="text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-heading)]">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={quickFirstName}
                          onChange={(e) => setQuickFirstName(e.target.value)}
                          placeholder="e.g. John"
                          className="w-full px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-heading)]">Last Name</label>
                        <input
                          type="text"
                          value={quickLastName}
                          onChange={(e) => setQuickLastName(e.target.value)}
                          placeholder="e.g. Doe"
                          className="w-full px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-heading)]">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          value={quickPhone}
                          onChange={(e) => setQuickPhone(e.target.value)}
                          placeholder="+14155552671"
                          className="w-full px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-heading)]">Email (Optional)</label>
                        <input
                          type="email"
                          value={quickEmail}
                          onChange={(e) => setQuickEmail(e.target.value)}
                          placeholder="john@example.com"
                          className="w-full px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-heading)]">Company (Optional)</label>
                        <input
                          type="text"
                          value={quickCompany}
                          onChange={(e) => setQuickCompany(e.target.value)}
                          placeholder="Acme Corp"
                          className="w-full px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] mt-1"
                        />
                      </div>
                      <div className="relative" ref={quickDropdownRef}>
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-[var(--color-heading)] flex items-center gap-1">
                            <Folder className="w-3 h-3 text-[var(--color-primary)]" />
                            <span>Contact Group <span className="text-[10px] text-[var(--color-muted)] font-normal">(Optional)</span></span>
                          </label>
                          {quickGroupMode === "existing" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickGroupMode("new");
                                setQuickGroup("");
                                setQuickDropdownOpen(false);
                              }}
                              className="text-[10px] text-[var(--color-primary)] hover:underline font-medium cursor-pointer"
                            >
                              + New
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickGroupMode("existing");
                                setQuickGroup(availableTags.length > 0 ? availableTags[0] : "");
                              }}
                              className="text-[10px] text-[var(--color-muted)] hover:underline font-medium cursor-pointer"
                            >
                              ← Select Existing
                            </button>
                          )}
                        </div>

                        {quickGroupMode === "existing" ? (
                          <div className="relative mt-1">
                            <button
                              type="button"
                              onClick={() => setQuickDropdownOpen((prev) => !prev)}
                              className="w-full px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] flex items-center justify-between font-medium text-left cursor-pointer hover:border-[var(--color-border-hover)]"
                            >
                              <span className="truncate pr-2">
                                {quickGroup ? quickGroup : <span className="text-[var(--color-muted)] font-normal">-- Select Group (or Unassigned) --</span>}
                              </span>
                              <ChevronDown className={`w-3.5 h-3.5 text-[var(--color-muted)] shrink-0 transition-transform ${quickDropdownOpen ? "rotate-180" : ""}`} />
                            </button>

                            {quickDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-xl z-50 max-h-48 overflow-y-auto py-1 text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickGroup("");
                                    setQuickDropdownOpen(false);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[var(--color-surface-muted)] ${
                                    !quickGroup ? "text-[var(--color-primary)] font-semibold bg-[var(--color-primary-light)]/20" : "text-[var(--color-muted)]"
                                  }`}
                                >
                                  <span className="truncate">-- Unassigned (No Group) --</span>
                                  {!quickGroup && <Check className="w-3 h-3 text-[var(--color-primary)]" />}
                                </button>
                                {availableTags.map((grp) => {
                                  const isSelected = quickGroup.toLowerCase() === grp.toLowerCase();
                                  return (
                                    <button
                                      key={grp}
                                      type="button"
                                      onClick={() => {
                                        setQuickGroup(grp);
                                        setQuickDropdownOpen(false);
                                      }}
                                      className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[var(--color-surface-muted)] ${
                                        isSelected ? "text-[var(--color-primary)] font-semibold bg-[var(--color-primary-light)]/20" : "text-[var(--color-text)]"
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5 truncate">
                                        <Folder className="w-3 h-3 text-[var(--color-muted)] shrink-0" />
                                        <span className="truncate">{grp}</span>
                                      </span>
                                      {isSelected && <Check className="w-3 h-3 text-[var(--color-primary)]" />}
                                    </button>
                                  );
                                })}
                                <div className="border-t border-[var(--color-border)] my-1"></div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickGroupMode("new");
                                    setQuickGroup("");
                                    setQuickDropdownOpen(false);
                                  }}
                                  className="w-full px-3 py-1.5 text-left flex items-center gap-1.5 text-[var(--color-primary)] font-semibold hover:bg-[var(--color-surface-muted)]"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>+ Create New Group...</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1 mt-1">
                            <input
                              type="text"
                              autoFocus
                              placeholder="e.g. Q3 Healthcare Leads"
                              value={quickGroup}
                              onChange={(e) => setQuickGroup(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium"
                            />
                            {availableTags.length > 0 && (
                              <div className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                                <span>Pick:</span>
                                <div className="flex flex-wrap gap-1">
                                  {availableTags.slice(0, 3).map((grp) => (
                                    <button
                                      key={grp}
                                      type="button"
                                      onClick={() => {
                                        setQuickGroup(grp);
                                        setQuickGroupMode("existing");
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-surface-muted)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] font-medium cursor-pointer border border-[var(--color-border)]"
                                    >
                                      <Folder className="w-2.5 h-2.5 text-[var(--color-primary)] shrink-0" />
                                      <span className="truncate max-w-[80px]">{grp}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowQuickAddContact(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={isAddingContact}
                        className="bg-[var(--color-primary)] text-white"
                      >
                        {isAddingContact ? "Adding..." : "Save & Enroll Contact"}
                      </Button>
                    </div>
                  </form>
                )}

                {/* Contact Group Selection View */}
                {selectionMode === "tags" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[var(--color-heading)]">
                        Select Target Contact Groups:
                      </label>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        Click card to toggle selection • Click <Eye className="w-3 h-3 inline text-[var(--color-primary)] mx-0.5" /> to inspect contacts
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[320px] overflow-y-auto pr-1">
                      {availableTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag);
                        const groupContacts = prospects.filter((p) => (p.tags || []).includes(tag));
                        const groupCount = groupContacts.length;

                        return (
                          <div
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 group ${
                              isSelected
                                ? "bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] text-[var(--color-primary)] shadow-xs"
                                : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] hover:border-[var(--color-primary)]/40"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <Folder className={`w-4 h-4 shrink-0 ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
                              <div className="truncate flex-1">
                                <span className="text-xs font-bold block truncate text-[var(--color-heading)]" title={tag}>{tag}</span>
                                <span className="text-[11px] text-[var(--color-muted)]">{groupCount} contacts</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Eye Preview Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInspectingGroup(tag);
                                }}
                                title={`Inspect ${groupCount} contacts in "${tag}"`}
                                className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface)] transition-all cursor-pointer border border-transparent hover:border-[var(--color-border)] shadow-2xs"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Selection Indicator */}
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                                isSelected
                                  ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                                  : "border-[var(--color-border)] bg-[var(--color-surface)] group-hover:border-[var(--color-primary)]/50"
                              }`}>
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {availableTags.length === 0 && (
                        <div className="col-span-full py-10 text-center text-xs text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
                          No Contact Groups defined yet. Use <strong>&quot;Import CSV to Campaign&quot;</strong> above to upload your contact list!
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Manual Prospect Selection View with Group Search */}
                {selectionMode === "manual" && (() => {
                  const query = prospectSearch.toLowerCase().trim();
                  const filteredProspects = prospects.filter((p) => {
                    if (!query) return true;
                    const nameMatch = (p.full_name && p.full_name.toLowerCase().includes(query)) ||
                      `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase().includes(query);
                    const phoneMatch = p.phone_number && p.phone_number.includes(query);
                    const emailMatch = p.email && p.email.toLowerCase().includes(query);
                    const companyMatch = p.company && p.company.toLowerCase().includes(query);
                    const tagMatch = p.tags && Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase().includes(query));
                    return nameMatch || phoneMatch || emailMatch || companyMatch || tagMatch;
                  });

                  const allFilteredSelected = filteredProspects.length > 0 &&
                    filteredProspects.every((p) => selectedProspectIds.includes(p.id));

                  const toggleSelectAllFiltered = () => {
                    if (allFilteredSelected) {
                      const filteredIds = new Set(filteredProspects.map((p) => p.id));
                      setSelectedProspectIds((prev) => prev.filter((id) => !filteredIds.has(id)));
                    } else {
                      const toAdd = filteredProspects.map((p) => p.id);
                      setSelectedProspectIds((prev) => Array.from(new Set([...prev, ...toAdd])));
                    }
                  };

                  return (
                    <div className="space-y-3">
                      {/* Search Bar & Quick Group Shortcuts */}
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--color-muted)]" />
                          <input
                            type="text"
                            value={prospectSearch}
                            onChange={(e) => setProspectSearch(e.target.value)}
                            placeholder="Search by name, phone, company, or Contact Group name..."
                            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                          />
                          {prospectSearch && (
                            <button
                              type="button"
                              onClick={() => setProspectSearch("")}
                              className="absolute right-3 top-2.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Available Group Filter Pills */}
                        {availableTags.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                            <span className="text-[var(--color-muted)] font-medium">Quick Filter Group:</span>
                            {availableTags.map((grp) => (
                              <button
                                key={grp}
                                type="button"
                                onClick={() => setProspectSearch(grp === prospectSearch ? "" : grp)}
                                className={`px-2 py-0.5 rounded-full border transition-colors cursor-pointer flex items-center gap-1 ${
                                  prospectSearch === grp
                                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] font-semibold"
                                    : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                                }`}
                              >
                                <Folder className="w-2.5 h-2.5" />
                                <span>{grp}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Header Selection Action Bar */}
                      <div className="flex items-center justify-between px-1 text-xs">
                        <span className="text-[var(--color-muted)] text-[11px]">
                          Showing <strong>{filteredProspects.length}</strong> matching contacts ({selectedProspectIds.length} selected total)
                        </span>
                        {filteredProspects.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleSelectAllFiltered}
                            className="text-xs font-semibold text-[var(--color-primary)] hover:underline cursor-pointer"
                          >
                            {allFilteredSelected
                              ? `Deselect All (${filteredProspects.length})`
                              : `Select All Filtered (${filteredProspects.length})`}
                          </button>
                        )}
                      </div>

                      {/* Contact List */}
                      <div className="max-h-[300px] overflow-y-auto border border-[var(--color-border)] rounded-xl divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                        {filteredProspects.map((p) => {
                          const isSelected = selectedProspectIds.includes(p.id);
                          return (
                            <div
                              key={p.id}
                              onClick={() => toggleProspectSelection(p.id)}
                              className={`p-3 flex items-center justify-between cursor-pointer text-xs transition-colors ${
                                isSelected ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]" : "hover:bg-[var(--color-surface-muted)]"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-0"
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-[var(--color-heading)] block">{p.full_name}</span>
                                    {p.tags && p.tags.length > 0 && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)] font-medium">
                                         {p.tags.join(", ")}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-[var(--color-muted)]">{p.company || "Individual"} • <span className="font-mono">{p.phone_number}</span></span>
                                </div>
                              </div>
                              <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-muted)] font-medium">
                                {p.status}
                              </span>
                            </div>
                          );
                        })}

                        {filteredProspects.length === 0 && (
                          <div className="py-8 text-center text-xs text-[var(--color-muted)]">
                            No contacts match &quot;{prospectSearch}&quot;.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Step 4: Calling & Concurrency */}
            {step === 4 && (
              <div className="space-y-4 max-w-2xl text-left">
                <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[var(--color-primary)]" />
                  <span>Step 4: Outbound Calling Parameters &amp; Concurrency</span>
                </h3>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--color-heading)]">
                    Caller ID / Outbound Phone Number <span className="text-red-500">*</span>
                  </label>
                  {availableNumbers.length > 0 ? (
                    <select
                      value={callerNumber}
                      onChange={(e) => setCallerNumber(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    >
                      {availableNumbers.map((num) => (
                        <option key={num} value={num}>
                          {num}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={callerNumber}
                      onChange={(e) => setCallerNumber(e.target.value)}
                      placeholder="+14155552671"
                      className="w-full px-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  )}
                  <p className="text-[11px] text-[var(--color-muted)]">
                    Verified phone number displayed on recipient caller IDs.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">Max Concurrent Calls</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={maxConcurrent}
                      onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                    <p className="text-[10px] text-[var(--color-muted)]">Parallel lines (1 - 50)</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">Max Attempts per Contact</label>
                    <select
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(parseInt(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    >
                      <option value={1}>1 attempt (No retries)</option>
                      <option value={2}>2 attempts</option>
                      <option value={3}>3 attempts (Recommended)</option>
                      <option value={4}>4 attempts</option>
                      <option value={5}>5 attempts</option>
                    </select>
                    <p className="text-[10px] text-[var(--color-muted)]">Retries on unanswered/busy</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${maxAttempts === 1 ? "text-[var(--color-muted)] opacity-60" : "text-[var(--color-heading)]"}`}>
                      Retry Delay (Minutes)
                    </label>
                    {maxAttempts === 1 ? (
                      <input
                        type="text"
                        disabled
                        value="Disabled (1 Attempt)"
                        className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-muted)] cursor-not-allowed italic"
                      />
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={retryDelayMinutes}
                        onChange={(e) => setRetryDelayMinutes(parseInt(e.target.value) || 120)}
                        className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      />
                    )}
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {maxAttempts === 1 ? "Single call attempt only" : "Wait time before next attempt"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Schedule & Timezone */}
            {step === 5 && (
              <div className="space-y-4 max-w-2xl text-left">
                <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
                  <span>Step 5: Automated Calling Schedule &amp; Timezone</span>
                </h3>

                {/* Schedule Mode Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--color-heading)]">Campaign Schedule Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleMode("single_day");
                        if (startDate) {
                          setEndDate(startDate);
                          setCallingDays([getWeekdayFromDate(startDate)]);
                        }
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        scheduleMode === "single_day"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle,rgba(59,130,246,0.08))] ring-1 ring-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[var(--color-heading)]">Single Specific Date</span>
                        {scheduleMode === "single_day" && <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />}
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)]">Execute calls strictly on one selected calendar day.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScheduleMode("date_range")}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        scheduleMode === "date_range"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle,rgba(59,130,246,0.08))] ring-1 ring-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[var(--color-heading)]">Date Range Window</span>
                        {scheduleMode === "date_range" && <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />}
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)]">Run between start &amp; end dates on selected weekdays.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setScheduleMode("recurring");
                        setEndDate("");
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        scheduleMode === "recurring"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle,rgba(59,130,246,0.08))] ring-1 ring-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[var(--color-heading)]">Ongoing Schedule</span>
                        {scheduleMode === "recurring" && <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />}
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)]">Run continuously during allowed calling hours.</p>
                    </button>
                  </div>
                </div>

                {/* Date Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>{scheduleMode === "single_day" ? "Campaign Execution Date *" : "Start Date *"}</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </div>

                  {scheduleMode === "date_range" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span>End Date (Optional)</span>
                      </label>
                      <input
                        type="date"
                        min={startDate}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      />
                    </div>
                  )}
                </div>

                {/* Calling Days Selection */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">Allowed Calling Days</label>
                    {scheduleMode === "single_day" && (
                      <span className="text-[11px] text-[var(--color-primary)] font-medium">
                        Automatically locked to {callingDays[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const isSelected = callingDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={scheduleMode === "single_day"}
                          onClick={() => toggleCallingDay(day)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isSelected
                              ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-2xs font-semibold"
                              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                          } ${scheduleMode === "single_day" ? "cursor-default" : "cursor-pointer"}`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Calling Window & Real-time Timezone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">Calling Window Hours</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                      />
                      <span className="text-xs text-[var(--color-muted)] font-bold">to</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 relative">
                    <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span>Campaign Timezone *</span>
                      </span>
                      <span className="text-[11px] text-[var(--color-primary)] font-mono font-medium truncate max-w-[200px]" title={timezone}>
                        {timezone}
                      </span>
                    </label>

                    {/* Search & Selection Box */}
                    <div className="relative">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--color-muted)] pointer-events-none" />
                        <input
                          type="text"
                          value={tzSearchQuery}
                          onFocus={() => setIsTzDropdownOpen(true)}
                          onChange={(e) => {
                            setTzSearchQuery(e.target.value);
                            setIsTzDropdownOpen(true);
                          }}
                          placeholder="Type offset (5.30, +5:30) or city (Kolkata, New York)..."
                          className="w-full pl-9 pr-8 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] shadow-2xs"
                        />
                        {tzSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setTzSearchQuery("");
                            }}
                            className="absolute right-2.5 top-2.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Dropdown Options List */}
                      {isTzDropdownOpen && (() => {
                        const matchingTzs = filterTimezonesList(tzSearchQuery);
                        return (
                          <>
                            {/* Backdrop to close on outer click */}
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setIsTzDropdownOpen(false)}
                            />

                            <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-30 max-h-[260px] overflow-y-auto divide-y divide-[var(--color-border)]">
                              <div className="p-2 bg-[var(--color-surface-muted)] text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider flex items-center justify-between sticky top-0 z-10 border-b border-[var(--color-border)]">
                                <span>Found {matchingTzs.length} timezones</span>
                                <span>Click to select</span>
                              </div>

                              {matchingTzs.map((opt) => {
                                const isCur = opt.value === timezone;
                                return (
                                  <div
                                    key={opt.value}
                                    onClick={() => {
                                      setTimezone(opt.value);
                                      setTzSearchQuery("");
                                      setIsTzDropdownOpen(false);
                                      toast.success(`Selected timezone: ${opt.label}`);
                                    }}
                                    className={`p-2.5 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                      isCur
                                        ? "bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] font-bold"
                                        : "hover:bg-[var(--color-surface-muted)] text-[var(--color-text)]"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <Globe className={`w-3.5 h-3.5 shrink-0 ${isCur ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
                                      <span className="truncate">{opt.label}</span>
                                    </div>
                                    {isCur && <Check className="w-3.5 h-3.5 shrink-0 text-[var(--color-primary)]" />}
                                  </div>
                                );
                              })}

                              {matchingTzs.length === 0 && (
                                <div className="p-4 text-center text-xs text-[var(--color-muted)]">
                                  No timezone matching &quot;{tzSearchQuery}&quot;. Try typing &quot;5.30&quot;, &quot;kolkata&quot;, or &quot;london&quot;.
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Quick Popular Timezone Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                      <span className="text-[var(--color-muted)] text-[10px]">Popular:</span>
                      {[
                        { name: "IST (India +5:30)", tz: "Asia/Kolkata" },
                        { name: "US Eastern (-5:00)", tz: "America/New_York" },
                        { name: "US Pacific (-8:00)", tz: "America/Los_Angeles" },
                        { name: "GMT (UK +0:00)", tz: "Europe/London" },
                        { name: "Dubai (+4:00)", tz: "Asia/Dubai" },
                        { name: "Singapore (+8:00)", tz: "Asia/Singapore" },
                      ].map((item) => (
                        <button
                          key={item.tz}
                          type="button"
                          onClick={() => {
                            setTimezone(item.tz);
                            setTzSearchQuery("");
                            setIsTzDropdownOpen(false);
                            toast.success(`Selected timezone: ${item.name}`);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                            timezone === item.tz
                              ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] font-bold"
                              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                          }`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Review & Launch */}
            {step === 6 && (
              <div className="space-y-4 max-w-2xl text-left">
                <h3 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                  <span>Step 6: Review Configuration &amp; Launch</span>
                </h3>

                <div className="p-4 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-xl space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--color-border)]">
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)] block">Campaign Name</span>
                      <strong className="text-[var(--color-heading)] text-sm">{name}</strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)] block">Selected AI Voice Agent</span>
                      <strong className="text-[var(--color-heading)]">
                        {agents.find((a) => (a.agent_id || a.id) === selectedAgentId)?.name || selectedAgentId}
                      </strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-[var(--color-border)]">
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)] block">Target Audience</span>
                      <strong className="text-[var(--color-primary)] font-bold text-sm">
                        {estimatedAudienceCount} Contacts
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)] block">Parallel Line Limit</span>
                      <strong className="text-[var(--color-heading)]">{maxConcurrent} Concurrent Calls</strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)] block">Max Attempts</span>
                      <strong className="text-[var(--color-heading)]">
                        {maxAttempts} {maxAttempts === 1 ? "attempt" : "attempts"}
                      </strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)] block">Schedule Window</span>
                      <strong className="text-[var(--color-heading)]">
                        {startDate} {endDate ? `to ${endDate}` : ""} ({startTime} - {endTime})
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)] block">Timezone</span>
                      <strong className="text-[var(--color-heading)] truncate block">{timezone}</strong>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-xl flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-[var(--color-heading)] block">Launch Campaign Immediately</span>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Activate automated background dialer immediately upon saving.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={startImmediately}
                    onChange={(e) => setStartImmediately(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 mt-6 border-t border-[var(--color-border)]">
          <div>
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => Math.max(s - 1, 1))}
                leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                className="cursor-pointer"
              >
                Previous Step
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBackClick}
                className="cursor-pointer"
              >
                Cancel Setup
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 6 ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleNextStep}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                className="bg-[var(--color-primary)] text-white cursor-pointer font-semibold"
              >
                Next Step
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={handleCreateCampaign}
                leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                className="bg-[var(--color-primary)] text-white cursor-pointer font-bold px-5"
              >
                {isSubmitting ? "Creating Campaign..." : startImmediately ? "Launch Campaign" : "Save as Draft"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Unsaved Changes Confirmation Modal */}
      <Modal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        title="Unsaved Campaign Setup"
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs text-left">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-[var(--color-heading)]">Leave campaign creation?</p>
              <p className="text-[var(--color-muted)] leading-relaxed">
                You have unsaved changes in your campaign setup. You can save your setup as a draft or discard changes.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExitConfirm(false)}
              className="w-full sm:w-auto"
            >
              Keep Editing
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setShowExitConfirm(false);
                onCancel();
              }}
              className="w-full sm:w-auto"
            >
              Discard Changes
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                await handleSaveDraft();
                setShowExitConfirm(false);
                onCancel();
              }}
              className="w-full sm:w-auto bg-[var(--color-primary)] text-white font-semibold"
            >
              Save Draft &amp; Exit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Contact Group Inspection / Preview Modal */}
      {inspectingGroup && (
        <Modal
          isOpen={Boolean(inspectingGroup)}
          onClose={() => setInspectingGroup(null)}
          title={`Contact Group: "${inspectingGroup}"`}
          maxWidth="lg"
        >
          {(() => {
            const groupContacts = prospects.filter((p) => (p.tags || []).includes(inspectingGroup));
            const isGroupSelected = selectedTags.includes(inspectingGroup);

            return (
              <div className="space-y-4 text-xs text-left">
                <div className="flex items-center justify-between p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[var(--color-heading)]">
                      Total Contacts in Group: <strong className="text-[var(--color-primary)]">{groupContacts.length}</strong>
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Status breakdown: {groupContacts.filter(c => c.status === "New").length} New, {groupContacts.filter(c => c.status === "Connected" || c.status === "Contacted").length} Contacted
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={isGroupSelected ? "outline" : "primary"}
                    size="sm"
                    onClick={() => {
                      toggleTag(inspectingGroup);
                    }}
                    className={isGroupSelected ? "text-amber-500 border-amber-500/50" : "bg-[var(--color-primary)] text-white"}
                  >
                    {isGroupSelected ? "✓ Group Targeted (Click to Remove)" : "+ Target This Group for Campaign"}
                  </Button>
                </div>

                <div className="max-h-[350px] overflow-y-auto border border-[var(--color-border)] rounded-xl divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                  {groupContacts.map((contact) => (
                    <div key={contact.id} className="p-3 flex items-center justify-between gap-3 hover:bg-[var(--color-surface-muted)] transition-colors">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--color-heading)] text-xs truncate">{contact.full_name}</span>
                          {contact.company && (
                            <span className="text-[11px] text-[var(--color-muted)] truncate">({contact.company})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted)]">
                          <span className="font-mono">{contact.phone_number}</span>
                          {contact.email && <span>• {contact.email}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border)] font-medium">
                          {contact.status}
                        </span>
                        <span className="text-[10px] text-[var(--color-muted)]">
                          {contact.total_calls || 0} calls
                        </span>
                      </div>
                    </div>
                  ))}

                  {groupContacts.length === 0 && (
                    <div className="py-8 text-center text-xs text-[var(--color-muted)]">
                      No contacts found in this group.
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setInspectingGroup(null)}
                  >
                    Close Preview
                  </Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
