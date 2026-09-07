import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { LoadingState } from "../ui/LoadingState";
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
import { TimezoneLiveClock } from "./TimezoneLiveClock";
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
  Plus,
} from "lucide-react";

interface CampaignCreateWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCampaignCreated: (campaign: Campaign) => void;
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

export function CampaignCreateWizardModal({
  isOpen,
  onClose,
  onCampaignCreated,
}: CampaignCreateWizardModalProps) {
  const [step, setStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Available Resources
  const [agents, setAgents] = useState<any[]>([]);
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectTotal, setProspectTotal] = useState<number>(0);
  const [prospectSearch, setProspectSearch] = useState<string>("");

  // Step 1: Basic Info
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Step 2: Agent Selection
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  // Step 3: Audience Selection
  const [selectionMode, setSelectionMode] = useState<"all" | "tags" | "manual">("all");
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [excludeDnc, setExcludeDnc] = useState<boolean>(true);

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
  
  // Real-time detected browser timezone default
  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [timezone, setTimezone] = useState<string>(defaultTz);

  // Step 6: Review & Launch
  const [startImmediately, setStartImmediately] = useState<boolean>(false);

  // Load prerequisites on modal open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      loadResources();
    }
  }, [isOpen]);

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
      const prspRes = await fetchApi<{ items: Prospect[]; total: number }>("/prospects?page=1&page_size=100");
      if (prspRes && prspRes.items) {
        setProspects(prspRes.items);
        setProspectTotal(prspRes.total);

        // Extract distinct tags
        const tagsSet = new Set<string>();
        prspRes.items.forEach((p) => (p.tags || []).forEach((t) => tagsSet.add(t)));
        setAvailableTags(Array.from(tagsSet));
      }
    } catch (err: any) {
      toast.error("Failed to load workspace configuration: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDay = (day: string) => {
    if (callingDays.includes(day)) {
      if (callingDays.length === 1) {
        toast.error("At least one calling day must be selected.");
        return;
      }
      setCallingDays(callingDays.filter((d) => d !== day));
    } else {
      setCallingDays([...callingDays, day]);
    }
  };

  // Helper to compute weekday name from YYYY-MM-DD
  const getWeekdayFromDate = (dateStr: string): string => {
    if (!dateStr) return "Monday";
    const parts = dateStr.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return names[d.getDay()];
  };

  // When schedule mode changes or single day date changes
  const handleScheduleModeChange = (mode: "single_day" | "date_range" | "recurring") => {
    setScheduleMode(mode);
    if (mode === "single_day") {
      const validStart = startDate || todayStr;
      setStartDate(validStart);
      setEndDate(validStart);
      const day = getWeekdayFromDate(validStart);
      setCallingDays([day]);
    } else if (mode === "recurring") {
      setEndDate("");
      if (callingDays.length === 1) {
        setCallingDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
      }
    } else if (mode === "date_range") {
      if (!endDate || endDate === startDate) {
        // Set end date to 5 days ahead
        const parts = startDate.split("-").map(Number);
        const nextDate = new Date(parts[0], parts[1] - 1, parts[2] + 4);
        setEndDate(nextDate.toISOString().split("T")[0]);
      }
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

      // Update available tags list
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

  // Handle CSV file selection for direct campaign import
  const handleDirectCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDirectCsvFile(file);
    setDirectCsvFileName(file.name);
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    setDirectCsvGroupName(cleanName || `Campaign_Group_${new Date().toISOString().split("T")[0]}`);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setDirectCsvContent(text || "");
    };
    reader.readAsText(file);
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
      const res = await fetchApi<{ imported_count: number; total_rows: number; updated_count: number }>("/prospects/import", {
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

  // Step Validations
  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
      if (!name.trim()) {
        toast.error("Please enter a campaign name.");
        return false;
      }
    }
    if (currentStep === 2) {
      if (!selectedAgentId) {
        toast.error("Please select an AI Voice Agent.");
        return false;
      }
    }
    if (currentStep === 3) {
      const audienceCount = computeEstimatedAudience();
      if (audienceCount === 0) {
        toast.error("Selected audience has 0 eligible contacts. Please adjust selection.");
        return false;
      }
    }
    if (currentStep === 4) {
      if (!callerNumber.trim()) {
        toast.error("Please specify a valid Twilio Caller ID number.");
        return false;
      }
    }
    if (currentStep === 5) {
      if (!startDate) {
        toast.error("Please select a Campaign Start Date.");
        return false;
      }
      if (scheduleMode === "date_range" && endDate && endDate < startDate) {
        toast.error("End date cannot be earlier than start date.");
        return false;
      }
      if (callingDays.length === 0) {
        toast.error("Please select at least one calling day.");
        return false;
      }
      if (startTime >= endTime) {
        toast.error("Calling start time must be earlier than end time.");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, 6));
    }
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (launchImmediately: boolean) => {
    if (!validateStep(step)) return;

    setIsSubmitting(true);
    try {
      const prospectSelection: ProspectSelectionFilter = {
        exclude_dnc: excludeDnc,
      };

      if (selectionMode === "all") {
        prospectSelection.select_all = true;
      } else if (selectionMode === "tags") {
        prospectSelection.tags = selectedTags;
      } else if (selectionMode === "manual") {
        prospectSelection.prospect_ids = selectedProspectIds;
      }

      // Calculate final start and end dates
      const finalStartDate = startDate || todayStr;
      let finalEndDate: string | null = null;
      if (scheduleMode === "single_day") {
        finalEndDate = finalStartDate;
      } else if (scheduleMode === "date_range") {
        finalEndDate = endDate || finalStartDate;
      } else {
        finalEndDate = null;
      }

      const payload: CreateCampaignPayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        calling_config: {
          agent_id: selectedAgentId,
          caller_phone_number: callerNumber.trim(),
          max_concurrent_calls: maxConcurrent,
          max_attempts_per_prospect: maxAttempts,
          retry_delay_minutes: maxAttempts === 1 ? 0 : retryDelayMinutes,
          call_timeout_seconds: callTimeoutSeconds,
        },
        schedule: {
          start_date: finalStartDate,
          end_date: finalEndDate,
          calling_days: callingDays,
          calling_start_time: startTime,
          calling_end_time: endTime,
          timezone: timezone,
        },
        prospect_selection: prospectSelection,
        start_immediately: launchImmediately,
      };

      const created = await fetchApi<Campaign>("/campaigns", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast.success(
        launchImmediately
          ? `Campaign "${created.name}" created and launched successfully!`
          : `Campaign "${created.name}" created as draft.`
      );

      onCampaignCreated(created);
      onClose();
    } catch (err: any) {
      toast.error("Failed to create campaign: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAgent = agents.find((a) => (a.agent_id || a.id) === selectedAgentId);
  const estimatedAudienceCount = computeEstimatedAudience();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Outbound Campaign"
      description="Design a scheduled, multi-contact automated dialing campaign powered by AI Voice Agents."
      maxWidth="xl"
    >
      <div className="flex flex-col gap-6">
        {/* Multi-Step Wizard Progress Bar */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 overflow-x-auto">
          {[
            { num: 1, label: "Details", icon: Megaphone },
            { num: 2, label: "Voice Agent", icon: Bot },
            { num: 3, label: "Audience", icon: Users },
            { num: 4, label: "Calling Rules", icon: Sliders },
            { num: 5, label: "Schedule", icon: Calendar },
            { num: 6, label: "Review", icon: CheckCircle2 },
          ].map((item) => {
            const Icon = item.icon;
            const isPassed = step > item.num;
            const isCurrent = step === item.num;

            return (
              <div
                key={item.num}
                className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-all whitespace-nowrap ${
                  isCurrent
                    ? "bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] font-semibold"
                    : isPassed
                    ? "text-[var(--color-success)] font-medium"
                    : "text-[var(--color-muted)] opacity-60"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    isCurrent
                      ? "bg-[var(--color-primary)] text-white"
                      : isPassed
                      ? "bg-[var(--color-success)] text-white"
                      : "bg-[var(--color-surface-muted)] border border-[var(--color-border)]"
                  }`}
                >
                  {isPassed ? "✓" : item.num}
                </div>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>

        {isLoading ? (
          <div className="py-12">
            <LoadingState message="Loading campaign creation assets..." />
          </div>
        ) : (
          <div className="min-h-[380px] flex flex-col justify-between">
            {/* Step 1: Campaign Details */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-md flex items-center gap-3">
                  <Megaphone className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
                  <p className="text-xs text-[var(--color-muted)]">
                    Give your outbound campaign a distinct operational title and description for team collaboration.
                  </p>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-[var(--color-heading)]">
                    Campaign Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Q3 High-Value Enterprise Outreach"
                    className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-[var(--color-heading)]">
                    Description & Objectives
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Describe the campaign goal, offer details, or qualification criteria..."
                    className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Voice Agent Selection */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in duration-200 text-left">
                <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-md flex items-center gap-3">
                  <Bot className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
                  <p className="text-xs text-[var(--color-muted)]">
                    Choose the AI Voice Agent personality, prompt instructions, and voice model that will conduct calls.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                  {agents.map((agent) => {
                    const agentId = agent.agent_id || agent.id;
                    const isSelected = selectedAgentId === agentId;
                    const voiceName = agent.voice?.voice || agent.voice || "Aura Voice";

                    return (
                      <div
                        key={agentId}
                        onClick={() => setSelectedAgentId(agentId)}
                        className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                          isSelected
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle,rgba(59,130,246,0.06))] ring-1 ring-[var(--color-primary)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Bot className={`w-4 h-4 ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
                            <span className="text-xs font-semibold text-[var(--color-heading)]">
                              {agent.name || "AI Agent"}
                            </span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-[var(--color-primary)]" />}
                        </div>

                        <p className="text-[11px] text-[var(--color-muted)] line-clamp-2">
                          {agent.role || agent.greeting || "Spoken Voice Assistant"}
                        </p>

                        <div className="flex items-center gap-2 pt-1 border-t border-[var(--color-border)]/50 text-[10px] text-[var(--color-muted)]">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border)] font-mono">
                            {voiceName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Audience Selection */}
            {step === 3 && (
              <div className="space-y-4 animate-in fade-in duration-200 text-left">
                <div className="flex items-center justify-between p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-md">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[var(--color-primary)]" />
                    <span className="text-xs text-[var(--color-muted)]">
                      Target Audience: <strong className="text-[var(--color-heading)]">{estimatedAudienceCount} eligible contacts</strong>
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] cursor-pointer">
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
                <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2 flex-wrap">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectionMode("tags")}
                      className={`px-3 py-1.5 text-xs rounded-md font-medium cursor-pointer transition-all flex items-center gap-1.5 ${
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
                      className={`px-3 py-1.5 text-xs rounded-md font-medium cursor-pointer transition-all ${
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
                      className={`px-3 py-1.5 text-xs rounded-md font-medium cursor-pointer transition-all ${
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
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all cursor-pointer flex items-center gap-1.5 border border-[var(--color-primary)]/30"
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
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[var(--color-surface-muted)] text-[var(--color-heading)] hover:bg-[var(--color-border)] transition-all cursor-pointer flex items-center gap-1.5 border border-[var(--color-border)]"
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
                    className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-primary)]/40 rounded-lg space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-xs"
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-[var(--color-border)]">
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
                        <label className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-border)]/50 cursor-pointer transition-colors">
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
                          className="w-full px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
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
                    className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-primary)]/40 rounded-lg space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-xs"
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-[var(--color-border)]">
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[11px] font-medium text-[var(--color-heading)]">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={quickFirstName}
                          onChange={(e) => setQuickFirstName(e.target.value)}
                          placeholder="e.g. John"
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-[var(--color-heading)]">Last Name</label>
                        <input
                          type="text"
                          value={quickLastName}
                          onChange={(e) => setQuickLastName(e.target.value)}
                          placeholder="e.g. Doe"
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-[var(--color-heading)]">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          value={quickPhone}
                          onChange={(e) => setQuickPhone(e.target.value)}
                          placeholder="+14155552671"
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono mt-0.5"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[11px] font-medium text-[var(--color-heading)]">Email (Optional)</label>
                        <input
                          type="email"
                          value={quickEmail}
                          onChange={(e) => setQuickEmail(e.target.value)}
                          placeholder="john@example.com"
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-[var(--color-heading)]">Company (Optional)</label>
                        <input
                          type="text"
                          value={quickCompany}
                          onChange={(e) => setQuickCompany(e.target.value)}
                          placeholder="Acme Corp"
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] mt-0.5"
                        />
                      </div>
                      <div className="relative" ref={quickDropdownRef}>
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-[var(--color-heading)] flex items-center gap-1">
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
                          <div className="relative mt-0.5">
                            <button
                              type="button"
                              onClick={() => setQuickDropdownOpen((prev) => !prev)}
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] flex items-center justify-between font-medium text-left cursor-pointer hover:border-[var(--color-border-hover)]"
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
                          <div className="space-y-1 mt-0.5">
                            <input
                              type="text"
                              autoFocus
                              placeholder="e.g. Q3 Healthcare Leads"
                              value={quickGroup}
                              onChange={(e) => setQuickGroup(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium"
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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[var(--color-heading)]">
                        Select Target Contact Groups:
                      </label>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        Click group(s) to target their members
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[180px] overflow-y-auto pr-1">
                      {availableTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag);
                        const groupCount = prospects.filter((p) => (p.tags || []).includes(tag)).length;

                        return (
                          <div
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                              isSelected
                                ? "bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] text-[var(--color-primary)]"
                                : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Folder className={`w-4 h-4 shrink-0 ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
                              <div className="truncate">
                                <span className="text-xs font-semibold block truncate">{tag}</span>
                                <span className="text-[10px] text-[var(--color-muted)]">{groupCount} contacts</span>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 shrink-0 text-[var(--color-primary)]" />}
                          </div>
                        );
                      })}
                      {availableTags.length === 0 && (
                        <div className="col-span-full py-6 text-center text-xs text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-lg">
                          No Contact Groups defined yet. Use <strong>&quot;Import CSV to Campaign&quot;</strong> above to create your first group!
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Manual Prospect Selection View */}
                {selectionMode === "manual" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--color-muted)]" />
                      <input
                        type="text"
                        value={prospectSearch}
                        onChange={(e) => setProspectSearch(e.target.value)}
                        placeholder="Search contacts by name or phone..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                      />
                    </div>
                    <div className="max-h-[180px] overflow-y-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                      {prospects
                        .filter(
                          (p) =>
                            !prospectSearch ||
                            p.full_name.toLowerCase().includes(prospectSearch.toLowerCase()) ||
                            p.phone_number.includes(prospectSearch)
                        )
                        .map((p) => {
                          const isSelected = selectedProspectIds.includes(p.id);
                          return (
                            <div
                              key={p.id}
                              onClick={() => toggleProspectSelection(p.id)}
                              className="px-3 py-2 flex items-center justify-between text-xs cursor-pointer hover:bg-[var(--color-surface-muted)] transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded border-[var(--color-border)] text-[var(--color-primary)] cursor-pointer"
                                />
                                <span className="font-medium text-[var(--color-heading)]">{p.full_name}</span>
                                <span className="text-[11px] text-[var(--color-muted)] font-mono">{p.phone_number}</span>
                              </div>
                              {p.company && (
                                <span className="text-[11px] text-[var(--color-muted)]">{p.company}</span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Calling & Concurrency Rules */}
            {step === 4 && (
              <div className="space-y-4 animate-in fade-in duration-200 text-left">
                <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-md flex items-center gap-3">
                  <Sliders className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
                  <p className="text-xs text-[var(--color-muted)]">
                    Configure caller ID, live line concurrency, maximum retry attempts, and ring timeout.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Caller ID Phone Number */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">
                      Caller ID Number <span className="text-red-500">*</span>
                    </label>
                    {availableNumbers.length > 0 ? (
                      <select
                        value={callerNumber}
                        onChange={(e) => setCallerNumber(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono"
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
                        className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono"
                      />
                    )}
                  </div>

                  {/* Max Concurrency Slider */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--color-heading)]">Max Concurrent Calls</span>
                      <span className="px-2 py-0.5 rounded bg-[var(--color-primary-subtle,rgba(59,130,246,0.1))] text-[var(--color-primary)] font-bold">
                        {maxConcurrent} live lines
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={maxConcurrent}
                      onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                      className="w-full accent-[var(--color-primary)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--color-muted)]">
                      <span>1 (Gentle)</span>
                      <span>10 (Standard)</span>
                      <span>20 (Fast)</span>
                    </div>
                  </div>

                  {/* Max Attempts */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">
                      Max Attempts Per Contact
                    </label>
                    <select
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                    >
                      <option value={1}>1 Attempt (No Retries)</option>
                      <option value={2}>2 Attempts</option>
                      <option value={3}>3 Attempts (Recommended)</option>
                      <option value={4}>4 Attempts</option>
                      <option value={5}>5 Attempts</option>
                    </select>
                    {maxAttempts === 1 && (
                      <p className="text-[11px] text-[var(--color-muted)]">
                        Each contact is dialed exactly once. Unanswered calls will not be retried.
                      </p>
                    )}
                  </div>

                  {/* Retry Delay - Automatically disabled when 1 attempt */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-semibold ${maxAttempts === 1 ? "text-[var(--color-muted)] opacity-60" : "text-[var(--color-heading)]"}`}>
                        Retry Delay on Unanswered
                      </label>
                      {maxAttempts === 1 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--color-surface-muted)] text-[var(--color-muted)] border border-[var(--color-border)]">
                          Disabled
                        </span>
                      )}
                    </div>
                    <select
                      value={maxAttempts === 1 ? 0 : retryDelayMinutes}
                      disabled={maxAttempts === 1}
                      onChange={(e) => setRetryDelayMinutes(Number(e.target.value))}
                      className={`w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-all ${
                        maxAttempts === 1
                          ? "opacity-50 bg-[var(--color-surface-muted)] cursor-not-allowed text-[var(--color-muted)]"
                          : "cursor-pointer"
                      }`}
                    >
                      {maxAttempts === 1 ? (
                        <option value={0}>Disabled (1 Attempt / No Retries)</option>
                      ) : (
                        <>
                          <option value={15}>15 Minutes</option>
                          <option value={30}>30 Minutes</option>
                          <option value={60}>1 Hour</option>
                          <option value={120}>2 Hours (Recommended)</option>
                          <option value={240}>4 Hours</option>
                          <option value={1440}>Next Day (24 Hours)</option>
                        </>
                      )}
                    </select>
                    {maxAttempts > 1 && (
                      <p className="text-[11px] text-[var(--color-muted)]">
                        Time to wait before queuing next attempt when contact does not answer.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Schedule & Timezone */}
            {step === 5 && (
              <div className="space-y-4 animate-in fade-in duration-200 text-left">
                <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-md flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
                  <p className="text-xs text-[var(--color-muted)]">
                    Configure dates, allowed days, and operational calling window in your target timezone.
                  </p>
                </div>

                {/* Campaign Schedule Mode Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--color-heading)]">Campaign Schedule Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleScheduleModeChange("single_day")}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        scheduleMode === "single_day"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle,rgba(59,130,246,0.06))] ring-1 ring-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span className="text-xs font-semibold text-[var(--color-heading)]">Single Specific Date</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)] mt-1">
                        Runs only on one scheduled date (e.g. Sept 1)
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleScheduleModeChange("date_range")}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        scheduleMode === "date_range"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle,rgba(59,130,246,0.06))] ring-1 ring-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span className="text-xs font-semibold text-[var(--color-heading)]">Date Range Window</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)] mt-1">
                        From start date to end date on selected days
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleScheduleModeChange("recurring")}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        scheduleMode === "recurring"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle,rgba(59,130,246,0.06))] ring-1 ring-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span className="text-xs font-semibold text-[var(--color-heading)]">Ongoing Schedule</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)] mt-1">
                        Starts on date and repeats every week on chosen days
                      </p>
                    </button>
                  </div>
                </div>

                {/* Date Selection Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center justify-between">
                      <span>{scheduleMode === "single_day" ? "Campaign Date" : "Start Date"} <span className="text-red-500">*</span></span>
                      <span className="text-[10px] text-[var(--color-muted)]">Day: {getWeekdayFromDate(startDate)}</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                    />
                  </div>

                  {scheduleMode === "date_range" && (
                    <div className="space-y-1 animate-in fade-in duration-150">
                      <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center justify-between">
                        <span>End Date <span className="text-red-500">*</span></span>
                        <span className="text-[10px] text-[var(--color-muted)]">Day: {endDate ? getWeekdayFromDate(endDate) : "—"}</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={endDate}
                        min={startDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                      />
                    </div>
                  )}

                  {scheduleMode === "recurring" && (
                    <div className="flex items-center text-xs text-[var(--color-muted)] p-2">
                      <span>Runs continuously on selected days starting from <strong>{startDate}</strong> until stopped or completed.</span>
                    </div>
                  )}
                </div>

                {/* Weekday Buttons */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">Allowed Calling Days</label>
                    {scheduleMode === "single_day" && (
                      <span className="text-[11px] text-[var(--color-muted)]">
                        Locked to {getWeekdayFromDate(startDate)} for single day
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAYS.map((day) => {
                      const isSelected = callingDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={scheduleMode === "single_day"}
                          onClick={() => toggleDay(day)}
                          className={`py-2 text-xs font-medium rounded-md border transition-all ${
                            scheduleMode === "single_day"
                              ? isSelected
                                ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] font-bold"
                                : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] opacity-40 cursor-not-allowed border-[var(--color-border)]"
                              : isSelected
                              ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] font-bold shadow-2xs cursor-pointer"
                              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-muted)] cursor-pointer"
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Window & Global Timezone */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">Calling Starts (24h)</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">Calling Ends (24h)</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Target Timezone</span>
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                    >
                      {ALL_SYSTEM_TIMEZONES.map((group) => (
                        <optgroup key={group.region} label={group.region}>
                          {group.options.map((tz) => (
                            <option key={tz.value} value={tz.value}>
                              {tz.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Timezone & Window Preview */}
                <TimezoneLiveClock
                  schedule={{
                    calling_days: callingDays,
                    calling_start_time: startTime,
                    calling_end_time: endTime,
                    timezone: timezone,
                    start_date: startDate,
                    end_date: endDate
                  }}
                />

                {/* Dynamic Schedule Summary Box */}
                <div className="p-3 bg-[var(--color-primary-subtle,rgba(59,130,246,0.06))] border border-[var(--color-primary)]/30 rounded-lg flex items-start gap-2.5 text-xs text-[var(--color-heading)]">
                  <Info className="w-4 h-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Schedule Summary: </span>
                    {scheduleMode === "single_day" && (
                      <span>
                        Calls will only be placed on <strong>{getWeekdayFromDate(startDate)}, {startDate}</strong> between <strong>{startTime} - {endTime}</strong> ({timezone}). {maxAttempts === 1 ? "Each contact receives 1 attempt." : `Max ${maxAttempts} attempts.`}
                      </span>
                    )}
                    {scheduleMode === "date_range" && (
                      <span>
                        Calls will only be made on <strong>{callingDays.map(d => d.slice(0, 3)).join(", ")}</strong> occurring between <strong>{startDate}</strong> and <strong>{endDate || startDate}</strong> during <strong>{startTime} - {endTime}</strong> ({timezone}).
                      </span>
                    )}
                    {scheduleMode === "recurring" && (
                      <span>
                        Calls will run continuously every week on <strong>{callingDays.map(d => d.slice(0, 3)).join(", ")}</strong> starting from <strong>{startDate}</strong> during <strong>{startTime} - {endTime}</strong> ({timezone}).
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Review & Launch */}
            {step === 6 && (
              <div className="space-y-4 animate-in fade-in duration-200 text-left">
                <div className="p-3 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-md flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[var(--color-success)] shrink-0" />
                  <p className="text-xs text-[var(--color-muted)]">
                    Review your automated outbound campaign parameters before creating or launching.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-xs">
                  <div>
                    <span className="text-[11px] text-[var(--color-muted)]">Campaign Name</span>
                    <p className="font-semibold text-[var(--color-heading)] mt-0.5">{name}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[var(--color-muted)]">Assigned AI Voice Agent</span>
                    <p className="font-semibold text-[var(--color-heading)] mt-0.5">{selectedAgent?.name || selectedAgentId}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[var(--color-muted)]">Target Audience</span>
                    <p className="font-semibold text-[var(--color-heading)] mt-0.5">
                      {estimatedAudienceCount} Contacts {excludeDnc && "(DNC Excluded)"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[var(--color-muted)]">Caller ID</span>
                    <p className="font-mono font-semibold text-[var(--color-heading)] mt-0.5">{callerNumber}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[var(--color-muted)]">Concurrency & Retries</span>
                    <p className="font-semibold text-[var(--color-heading)] mt-0.5">
                      {maxConcurrent} concurrent lines • {maxAttempts === 1 ? "1 attempt (No Retries)" : `${maxAttempts} attempts (${retryDelayMinutes}m retry delay)`}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[var(--color-muted)]">Calling Schedule</span>
                    <p className="font-semibold text-[var(--color-heading)] mt-0.5">
                      {scheduleMode === "single_day"
                        ? `Single Day: ${startDate} (${getWeekdayFromDate(startDate)})`
                        : scheduleMode === "date_range"
                        ? `${startDate} to ${endDate} (${callingDays.map(d => d.slice(0, 3)).join(", ")})`
                        : `Ongoing from ${startDate} (${callingDays.map(d => d.slice(0, 3)).join(", ")})`}
                    </p>
                    <span className="text-[10px] text-[var(--color-muted)] font-mono">
                      {startTime} - {endTime} • {timezone}
                    </span>
                  </div>
                </div>

                {/* Immediate Launch Checkbox */}
                <div className="p-3 bg-[var(--color-primary-subtle,rgba(59,130,246,0.06))] border border-[var(--color-primary)]/30 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-heading)]">Launch Campaign Immediately</p>
                      <p className="text-[11px] text-[var(--color-muted)]">
                        If checked, the automated dialer will begin placing calls during the next active calling window.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={startImmediately}
                    onChange={(e) => setStartImmediately(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Modal Bottom Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)] mt-4">
              {step > 1 ? (
                <Button variant="outline" size="sm" onClick={handleBack} disabled={isSubmitting}>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>

                {step < 6 ? (
                  <Button variant="primary" size="sm" onClick={handleNext}>
                    Next Step
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSubmit(false)}
                      disabled={isSubmitting}
                    >
                      Save as Draft
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSubmit(true)}
                      disabled={isSubmitting}
                      className="bg-[var(--color-primary)]"
                    >
                      {isSubmitting ? "Creating..." : "Launch Campaign"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
