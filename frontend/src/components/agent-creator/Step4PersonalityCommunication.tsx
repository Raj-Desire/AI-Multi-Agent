import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Volume2,
  Smile,
  Zap,
  Heart,
  ShieldCheck,
  Check,
  RotateCcw,
  Play,
  Square,
  Briefcase,
  Sun,
  Award,
  Coffee,
  Flame,
  Clock,
  Compass,
  Search,
  Plus,
  Minus,
  Bot,
  Activity,
  MessageSquareQuote,
  CheckCircle2,
  FileText,
  ChevronDown,
  CircleOff,
  Loader2
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import { COMMUNICATION_STYLES, getInitialAgentData, AURA_VOICES } from "./constants";
import { AgentConfig, AgentPersonality } from "../../types";
import { toast } from "sonner";

interface Step4PersonalityCommunicationProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

// Tone icons mapping
const TONE_ICONS: Record<string, React.ElementType> = {
  Professional: Briefcase,
  Friendly: Smile,
  Warm: Sun,
  Casual: Coffee,
  Formal: Award,
  Energetic: Zap,
  Empathetic: Heart,
  Confident: ShieldCheck,
  Persuasive: Flame,
  Enthusiastic: Sparkles,
  None: CircleOff
};

// Custom Tone Dropdown Component with Icons
interface CustomToneSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  isSecondary?: boolean;
}

function CustomToneSelect({
  value,
  onChange,
  options,
  placeholder = "Select tone...",
  isSecondary = false
}: CustomToneSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const SelectedIcon = TONE_ICONS[value] || Smile;
  const isNone = value === "None";

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] font-semibold cursor-pointer transition-all hover:bg-[var(--color-surface)]"
      >
        <div className="flex items-center gap-2 truncate">
          <div
            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
              isNone
                ? "text-[var(--color-muted)]"
                : "text-[var(--color-primary)]"
            }`}
          >
            <SelectedIcon className="w-3.5 h-3.5" />
          </div>
          <span className="truncate">
            {isSecondary && isNone ? "None (Single Tone)" : isSecondary ? `+ ${value}` : value}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--color-muted)] shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[var(--color-primary)]" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-elevated p-1 space-y-0.5 animate-fade-in">
          {options.map((opt) => {
            const IconComponent = TONE_ICONS[opt] || Smile;
            const isSelected = value === opt;
            const isOptionNone = opt === "None";

            return (
              <div
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.25rem)] text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold"
                    : "text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "text-[var(--color-primary)]"
                        : isOptionNone
                        ? "text-[var(--color-muted)]"
                        : "text-[var(--color-muted)]"
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <span className="truncate">
                    {isSecondary && isOptionNone ? "None (Single Tone)" : opt}
                  </span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 stroke-[2.5]" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// Intensity helper
function getIntensityLabel(val: number): string {
  if (val <= 25) return "Very Low";
  if (val <= 45) return "Low";
  if (val <= 65) return "Moderate";
  if (val <= 85) return "High";
  return "Very High";
}

// Semi-Circle Gauge Component for Core Traits
interface SemiCircleGaugeProps {
  value: number;
  label: string;
  description: string;
  icon: React.ElementType;
  onChange: (val: number) => void;
}

function SemiCircleGaugeCard({
  value,
  label,
  description,
  icon: Icon,
  onChange
}: SemiCircleGaugeProps) {
  const intensity = getIntensityLabel(value);
  const radius = 38;
  const strokeWidth = 7;
  // Circumference of half circle = PI * r
  const halfCircumference = Math.PI * radius;
  const strokeDashoffset = halfCircumference - (value / 100) * halfCircumference;

  const presetLevels = [
    { label: "V.Low", val: 20 },
    { label: "Low", val: 40 },
    { label: "Mod", val: 60 },
    { label: "High", val: 80 },
    { label: "V.High", val: 95 }
  ];

  return (
    <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs flex flex-col justify-between space-y-3 transition-all hover:border-[var(--color-border-strong,var(--color-border))] select-none">
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--color-heading)] leading-none">
              {label}
            </h4>
            <span className="text-[10px] text-[var(--color-muted)] mt-0.5 block">
              {description}
            </span>
          </div>
        </div>
        <Badge
          variant={value >= 80 ? "primary" : value >= 50 ? "neutral" : "warning"}
          size="sm"
          className="text-[10px] font-semibold"
        >
          {intensity}
        </Badge>
      </div>

      {/* Center Gauge Visualization */}
      <div className="flex flex-col items-center justify-center py-1">
        <div className="relative w-36 h-20 flex items-end justify-center overflow-hidden">
          <svg viewBox="0 0 100 55" className="w-full h-full">
            {/* Background Arc */}
            <path
              d="M 12 50 A 38 38 0 0 1 88 50"
              fill="none"
              stroke="var(--color-surface-muted)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Value Arc */}
            <path
              d="M 12 50 A 38 38 0 0 1 88 50"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={strokeWidth}
              strokeDasharray={halfCircumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-300 ease-out"
            />
          </svg>
          {/* Centered Readout */}
          <div className="absolute bottom-0 inset-x-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-extrabold text-[var(--color-heading)] tracking-tight leading-none">
              {value}%
            </span>
            <span className="text-[9px] font-medium text-[var(--color-muted)] uppercase tracking-wider mt-0.5">
              Intensity
            </span>
          </div>
        </div>
      </div>

      {/* Stepped Scale & Fine-Tuning Controls */}
      <div className="space-y-2 pt-1 border-t border-[var(--color-border)]/60">
        <div className="grid grid-cols-5 gap-1">
          {presetLevels.map((lvl) => {
            const isMatch =
              value >= lvl.val - 10 && (lvl.val === 95 ? value >= 90 : value < lvl.val + 10);

            return (
              <button
                key={lvl.val}
                type="button"
                onClick={() => onChange(lvl.val)}
                className={`py-1 text-[10px] font-semibold rounded-[var(--radius-main,0.25rem)] transition-all cursor-pointer text-center ${
                  isMatch
                    ? "bg-[var(--color-primary)] text-white shadow-2xs scale-[1.02]"
                    : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-border)]/60"
                }`}
              >
                {lvl.label}
              </button>
            );
          })}
        </div>

        {/* Fine-Tuning Increment/Decrement Row */}
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => onChange(Math.max(10, value - 5))}
            disabled={value <= 10}
            className="w-6 h-6 rounded flex items-center justify-center bg-[var(--color-surface-muted)] hover:bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-heading)] transition-colors cursor-pointer disabled:opacity-30"
          >
            <Minus className="w-3 h-3" />
          </button>
          <div className="flex-1 px-1">
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={value}
              onChange={(e) => onChange(parseInt(e.target.value))}
              className="w-full h-1.5 bg-[var(--color-surface-muted)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(Math.min(100, value + 5))}
            disabled={value >= 100}
            className="w-6 h-6 rounded flex items-center justify-center bg-[var(--color-surface-muted)] hover:bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-heading)] transition-colors cursor-pointer disabled:opacity-30"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Compact Segmented Control for Advanced Traits
interface AdvancedTraitCardProps {
  label: string;
  description: string;
  icon: React.ElementType;
  value: number;
  onChange: (val: number) => void;
}

function AdvancedTraitCard({
  label,
  description,
  icon: Icon,
  value,
  onChange
}: AdvancedTraitCardProps) {
  const intensity = getIntensityLabel(value);
  const segments = [20, 40, 60, 80, 100];

  return (
    <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs flex flex-col justify-between gap-2 hover:border-[var(--color-border-strong,var(--color-border))] transition-all select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[var(--radius-main,0.25rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Icon className="w-3 h-3" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-[var(--color-heading)] leading-none">
              {label}
            </h5>
            <span className="text-[10px] text-[var(--color-muted)]">{description}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
            {value}%
          </span>
          <span className="text-[9px] text-[var(--color-muted)] block leading-none">
            {intensity}
          </span>
        </div>
      </div>

      {/* Interactive Segment Bar */}
      <div className="flex items-center gap-1.5 pt-1">
        <span className="text-[9px] text-[var(--color-muted)] font-medium">Low</span>
        <div className="flex-1 grid grid-cols-5 gap-1 bg-[var(--color-surface-muted)] p-1 rounded-[var(--radius-main,0.25rem)] border border-[var(--color-border)]">
          {segments.map((segVal) => {
            const isActive = value >= segVal - 10;
            return (
              <button
                key={segVal}
                type="button"
                onClick={() => onChange(segVal)}
                className={`h-2.5 rounded-xs transition-all cursor-pointer ${
                  isActive
                    ? "bg-[var(--color-primary)] shadow-2xs"
                    : "bg-[var(--color-border)] hover:bg-[var(--color-border-strong,var(--color-border))]"
                }`}
                title={`${segVal}%`}
              />
            );
          })}
        </div>
        <span className="text-[9px] text-[var(--color-muted)] font-medium">High</span>

        {/* Increment / Decrement */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(Math.max(10, value - 10))}
            disabled={value <= 10}
            className="w-5 h-5 rounded flex items-center justify-center bg-[var(--color-surface-muted)] hover:bg-[var(--color-border)] text-[var(--color-muted)] cursor-pointer disabled:opacity-30"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => onChange(Math.min(100, value + 10))}
            disabled={value >= 100}
            className="w-5 h-5 rounded flex items-center justify-center bg-[var(--color-surface-muted)] hover:bg-[var(--color-border)] text-[var(--color-muted)] cursor-pointer disabled:opacity-30"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Step4PersonalityCommunication({
  agentData,
  setAgentData
}: Step4PersonalityCommunicationProps) {
  // Voice Preview State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selectedVoiceId = agentData.voice?.voice || "aura-orion-en";
  const selectedVoiceObj = AURA_VOICES.find((v) => v.id === selectedVoiceId) || AURA_VOICES[0];

  const currentStyles = (agentData.communication_style || "Professional").split("+").map((s) => s.trim());
  const primaryStyle = currentStyles[0] || "Professional";
  const secondaryStyle = currentStyles[1] || "None";

  const personality = agentData.personality || getInitialAgentData().personality;

  // Cleanup all audio and speech synthesis on mount and unmount
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    return () => {
      stopAudio();
    };
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setIsLoadingAudio(false);
  };

  const handleStyleChange = (primary: string, secondary: string) => {
    let combined = primary;
    if (secondary && secondary !== "None" && secondary !== primary) {
      combined = `${primary} + ${secondary}`;
    }
    setAgentData({
      ...agentData,
      communication_style: combined
    });
  };

  const updatePersonality = (key: keyof AgentPersonality, val: number) => {
    setAgentData((prev) => ({
      ...prev,
      personality: { ...prev.personality, [key]: val }
    }));
  };

  const resetToRecommended = () => {
    const defaults = getInitialAgentData().personality;
    setAgentData((prev) => ({
      ...prev,
      communication_style: "Professional + Friendly",
      response_length: "short",
      personality: { ...defaults }
    }));
  };

  // Generate dynamic persona tags that react to all active parameters
  const getDominantTags = () => {
    const tags: string[] = [];
    if (primaryStyle) tags.push(primaryStyle);
    if (secondaryStyle && secondaryStyle !== "None") tags.push(secondaryStyle);

    if (personality.professionalism >= 80) tags.push("Business-Focused");
    else if (personality.professionalism <= 35) tags.push("Casual & Relaxed");

    if (personality.friendliness >= 85) tags.push("Warm & Welcoming");
    if (personality.empathy >= 80) tags.push("High Empathy");
    if (personality.confidence >= 85) tags.push("Authoritative");
    if (personality.assertiveness >= 75) tags.push("Goal-Driven");
    if (personality.energy >= 80) tags.push("High Energy");
    if (personality.patience >= 85) tags.push("Patient & Calm");
    if (personality.curiosity >= 75) tags.push("Proactive Inquirer");
    if (personality.humor >= 60) tags.push("Witty & Light");

    // Add length indicator
    if (agentData.response_length === "short") tags.push("Fast Paced");
    else if (agentData.response_length === "detailed") tags.push("Comprehensive");

    return Array.from(new Set(tags)).slice(0, 5);
  };

  // Generate dynamic summary text reacting to all dimensions
  const getDynamicSummary = () => {
    const traits = [];

    // Demeanor & Professionalism
    if (personality.professionalism >= 85) {
      traits.push("maintains a formal, executive, and highly polished demeanor");
    } else if (personality.professionalism <= 40 || primaryStyle === "Casual") {
      traits.push("speaks in a relaxed, approachable, and conversational style");
    } else {
      traits.push("communicates in a balanced, professional manner");
    }

    // Friendliness & Empathy
    if (personality.empathy >= 80 && personality.friendliness >= 80) {
      traits.push("delivers deeply empathetic, warm, and supportive responses");
    } else if (personality.empathy >= 75) {
      traits.push("actively listens with compassionate understanding");
    } else if (personality.friendliness >= 75) {
      traits.push("greets callers with an upbeat, welcoming presence");
    } else {
      traits.push("focuses directly on concise, objective facts");
    }

    // Confidence & Assertiveness
    if (personality.confidence >= 85 && personality.assertiveness >= 75) {
      traits.push("leads conversations with decisive, goal-driven authority");
    } else if (personality.confidence >= 80) {
      traits.push("speaks with steady assurance and conviction");
    }

    // Energy & Humor & Curiosity
    if (personality.energy >= 80) {
      traits.push("radiates high energy and enthusiastic pacing");
    }
    if (personality.humor >= 60) {
      traits.push("infuses subtle wit and lighthearted charm");
    }
    if (personality.curiosity >= 75) {
      traits.push("proactively asks engaging diagnostic questions");
    }
    if (personality.patience >= 85) {
      traits.push("maintains an unhurried, reassuring patience");
    }

    // Length closing
    let lengthSummary = "keeping voice turns concise and reactive.";
    if (agentData.response_length === "balanced") {
      lengthSummary = "providing natural, balanced conversational explanations.";
    } else if (agentData.response_length === "detailed") {
      lengthSummary = "delivering in-depth, thorough step-by-step guidance.";
    }

    return `Your agent ${traits.slice(0, 3).join(", ")}, while ${lengthSummary}`;
  };

  // Generate dynamic dialogue preview accurately reflecting all chosen parameters
  const getDialoguePreview = () => {
    const len = agentData.response_length || "short";
    const prof = personality.professionalism ?? 85;
    const friend = personality.friendliness ?? 90;
    const emp = personality.empathy ?? 80;
    const conf = personality.confidence ?? 85;
    const energy = personality.energy ?? 70;
    const patience = personality.patience ?? 90;
    const assert = personality.assertiveness ?? 50;
    const curiosity = personality.curiosity ?? 75;
    const humor = personality.humor ?? 10;

    // 1. Dynamic Greeting
    let greeting = "Hello! Thank you for calling us today.";
    if (primaryStyle === "Casual" || prof <= 40) {
      greeting = energy >= 75 ? "Hey there! Great to connect with you today!" : "Hey there! Thanks for calling in today.";
    } else if (primaryStyle === "Formal" || prof >= 88) {
      greeting = conf >= 85 
        ? "Good day. Thank you for contacting our office; it is my pleasure to assist you."
        : "Good day. Thank you for reaching out to our team today.";
    } else if (primaryStyle === "Energetic" || primaryStyle === "Enthusiastic" || energy >= 80) {
      greeting = "Hello! Fantastic to connect with you today!";
    } else if (primaryStyle === "Empathetic" || primaryStyle === "Warm" || emp >= 85) {
      greeting = "Hello! Thank you so much for calling. I'm really glad we're connecting today.";
    } else if (primaryStyle === "Persuasive") {
      greeting = "Hello! Thanks for taking a moment to speak with me today.";
    } else if (friend >= 85) {
      greeting = "Hi there! Thank you so much for reaching out to us.";
    }

    // 2. Core Body
    let body = "";
    if (len === "short") {
      if (emp >= 80) {
        body = "I completely understand what you need, and I'm here to help you get this resolved quickly.";
      } else if (assert >= 75 || conf >= 85) {
        body = "I'll guide you directly to the optimal solution and take care of the details right away.";
      } else if (primaryStyle === "Persuasive") {
        body = "I'd love to share how our tailored solutions can deliver immediate results for your goals.";
      } else if (humor >= 60 || primaryStyle === "Casual") {
        body = "I'm happy to help you get everything sorted out without any fuss!";
      } else if (patience >= 85) {
        body = "Please take your time—I'm ready whenever you'd like to begin.";
      } else {
        body = "I'd be glad to help you with our services today.";
      }
    } else if (len === "balanced") {
      if (emp >= 80) {
        body = "I completely understand what you're looking for, and I'm right here to take care of everything. Let me pull up your details so we can find the best option for your situation.";
      } else if (assert >= 75 || conf >= 85) {
        body = "I will guide you directly to the best solution for your requirements and coordinate all the next steps seamlessly. Let's look into the exact details right now.";
      } else if (primaryStyle === "Persuasive") {
        body = "I'd love to highlight how our proven solutions streamline your process and maximize value. Let's review the top benefits that align with what you're trying to achieve.";
      } else if (humor >= 60 || primaryStyle === "Casual") {
        body = "I'm happy to help you get everything sorted out smoothly—no complicated steps or headache. Let's take a look at what we've got.";
      } else if (patience >= 85) {
        body = "Please take all the time you need. I'm happy to walk through each detail at your own pace so you feel completely confident.";
      } else {
        body = "I'm here to assist you with our services, verify your details, and guide you through the process. Let me quickly check the records for you.";
      }
    } else {
      // detailed
      if (emp >= 80) {
        body = "I completely understand how important this is to you, and I am right here to take care of each detail. I will personally guide you through every option step-by-step, review the requirements together, and ensure everything is clear and stress-free.";
      } else if (assert >= 75 || conf >= 85) {
        body = "I will provide a direct, strategic recommendation tailored specifically to your objectives. We will review the key milestones, outline the exact timeline, and ensure immediate execution without any delays.";
      } else if (primaryStyle === "Persuasive") {
        body = "I'm excited to walk you through how our specialized solutions can dramatically increase your efficiency and return on investment. I'll outline the key advantages, comparative benefits, and custom options available for you.";
      } else if (patience >= 85) {
        body = "Please feel free to take all the time you need throughout our conversation. I will gladly explain each step as thoroughly as you'd like, pause for any questions, and ensure you have total clarity before moving forward.";
      } else {
        body = "I would be happy to give you a comprehensive overview of our available options, explain each benefit step-by-step, and ensure all your specific requirements are fully addressed.";
      }
    }

    // 3. Dynamic Closing Question / CTA
    let closing = "";
    if (curiosity >= 75) {
      closing = "To make sure I get you the exact right fit, could you share a bit more about your main priority today?";
    } else if (assert >= 75) {
      closing = "Shall we go ahead and confirm the next steps for you right now?";
    } else if (primaryStyle === "Casual" || friend >= 85) {
      closing = "What can I help you with first?";
    } else if (primaryStyle === "Formal" || prof >= 88) {
      closing = "How may I best assist you with your inquiry?";
    } else {
      closing = "What questions can I answer for you today?";
    }

    return `“${greeting} ${body} ${closing}”`;
  };

  // Play Sample Speech Preview using strictly the selected voice persona
  const handlePlaySampleVoice = async () => {
    if (isPlayingAudio || isLoadingAudio) {
      stopAudio();
      return;
    }

    stopAudio();
    setIsLoadingAudio(true);

    const textToSpeak = getDialoguePreview().replace(/“|”/g, "");
    const voiceId = agentData.voice?.voice || "aura-orion-en";

    try {
      const token = localStorage.getItem("desire_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch("http://localhost:8000/api/v1/voice/sample-speech", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: textToSpeak, voice: voiceId })
      });

      if (!response.ok) {
        throw new Error(`Voice synthesis failed (${response.status})`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      // Apply Speaking Speed directly from agent config
      const speed = agentData.voice?.speed || 1.0;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));

      audio.onended = () => {
        setIsPlayingAudio(false);
        setIsLoadingAudio(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
        setIsLoadingAudio(false);
        audioRef.current = null;
        toast.error("Audio playback error.");
      };

      audioRef.current = audio;
      setIsLoadingAudio(false);
      setIsPlayingAudio(true);
      await audio.play();
    } catch (err: any) {
      stopAudio();
      toast.error(err?.message || "Failed to generate sample voice.");
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* 1. Header with Visual Waveform Accent & Reset Button */}
      <div className="border-b border-[var(--color-border)] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[var(--color-heading)] tracking-tight flex items-center gap-1.5">
              <span>Personality &amp; Communication Style</span>
              <InfoTooltip
                content="Define how your AI agent communicates, responds, behaves, and connects with callers."
                position="top"
              />
            </h2>
            <Badge variant="primary" size="sm" className="text-[10px]">
              AI Studio
            </Badge>
          </div>
        </div>

        {/* Abstract AI Waveform Visualization & Reset */}
        <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]" title="AI Voice Persona Modulation">
            <Activity className="w-3.5 h-3.5 text-[var(--color-primary)] animate-pulse" />
            <div className="flex items-center gap-0.5 h-3.5 px-1">
              <span className="w-0.5 h-2 bg-[var(--color-primary)]/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-0.5 h-3 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-0.5 h-1.5 bg-[var(--color-primary)]/40 rounded-full animate-bounce" />
              <span className="w-0.5 h-3.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.25s]" />
              <span className="w-0.5 h-2 bg-[var(--color-primary)]/70 rounded-full animate-bounce [animation-delay:-0.05s]" />
            </div>
            <span className="text-[10px] font-semibold text-[var(--color-heading)] ml-1">
              Live Modulation
            </span>
          </div>

          <button
            type="button"
            onClick={resetToRecommended}
            className="px-2.5 py-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-heading)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] rounded-[var(--radius-main,0.375rem)] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Reset personality to recommended defaults"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Recommended</span>
          </button>
        </div>
      </div>

      {/* Row 1: Tone & Demeanor + Response Length */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Communication Tone & Demeanor */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Smile className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Communication Tone &amp; Demeanor</span>
                  <InfoTooltip
                    content="Set the primary and secondary conversational tone to mold the agent's attitude and interpersonal style."
                    position="top"
                  />
                </h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Primary Tone */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-[var(--color-heading)] flex items-center gap-1">
                Primary Tone <span className="text-[var(--color-danger)]">*</span>
              </span>
              <CustomToneSelect
                value={primaryStyle}
                onChange={(val) => handleStyleChange(val, secondaryStyle)}
                options={COMMUNICATION_STYLES}
              />
            </div>

            {/* Secondary Tone */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-[var(--color-heading)]">
                Secondary Tone (Optional)
              </span>
              <CustomToneSelect
                value={secondaryStyle}
                onChange={(val) => handleStyleChange(primaryStyle, val)}
                options={["None", ...COMMUNICATION_STYLES.filter((st) => st !== primaryStyle)]}
                isSecondary={true}
              />
            </div>
          </div>

          <div className="p-2 bg-[var(--color-surface-muted)]/60 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]/60 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Combined Demeanor:</span>
            <span className="font-bold text-[var(--color-heading)]">
              {agentData.communication_style || "Professional"}
            </span>
          </div>
        </div>

        {/* Card 2: Response Length */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <MessageSquareQuote className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Response Length &amp; Pacing</span>
                  <InfoTooltip
                    content="Control whether the agent provides concise, balanced, or detailed explanations during spoken responses."
                    position="top"
                  />
                </h3>
              </div>
            </div>
            <Badge variant="success" size="sm" className="text-[10px] font-semibold">
              Voice Recommended
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              {
                id: "short",
                label: "Short",
                icon: Zap,
                badge: "Fast Turns",
                desc: "1–2 sentences. Fast, direct, and ideal for telephony."
              },
              {
                id: "balanced",
                label: "Balanced",
                icon: Clock,
                badge: "Standard",
                desc: "2–3 sentences. Natural flow with complete answers."
              },
              {
                id: "detailed",
                label: "Detailed",
                icon: FileText,
                badge: "In-Depth",
                desc: "3+ sentences. Comprehensive explanations & steps."
              }
            ].map((len) => {
              const isSelected = (agentData.response_length || "short") === len.id;
              const IconComponent = len.icon;

              return (
                <div
                  key={len.id}
                  onClick={() => setAgentData({ ...agentData, response_length: len.id })}
                  className={`p-2.5 rounded-[var(--radius-main,0.375rem)] border flex flex-col justify-between gap-1.5 cursor-pointer transition-all select-none text-left relative ${
                    isSelected
                      ? "bg-[var(--color-primary)]/[0.04] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40 shadow-2xs"
                      : "bg-[var(--color-surface-muted)] border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] hover:bg-[var(--color-surface-muted)]/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <IconComponent
                        className={`w-3.5 h-3.5 ${
                          isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
                        }`}
                      />
                      <span className="text-xs font-bold text-[var(--color-heading)]">
                        {len.label}
                      </span>
                    </div>
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                          : "border-[var(--color-border-strong,var(--color-border))] bg-[var(--color-surface)]"
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] leading-tight">
                    {len.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Core Personality Traits (Semi-Circle Gauges) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider flex items-center gap-1.5">
              <span>Core Personality Dimensions</span>
              <InfoTooltip
                content="Fine-tune key emotional and behavioral dimensions including professionalism, friendliness, empathy, and confidence."
                position="top"
              />
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <SemiCircleGaugeCard
            label="Professionalism"
            description="Formal, respectful & business-focused"
            icon={Briefcase}
            value={personality.professionalism ?? 85}
            onChange={(val) => updatePersonality("professionalism", val)}
          />

          <SemiCircleGaugeCard
            label="Friendliness"
            description="Warm, approachable & conversational"
            icon={Smile}
            value={personality.friendliness ?? 90}
            onChange={(val) => updatePersonality("friendliness", val)}
          />

          <SemiCircleGaugeCard
            label="Empathy"
            description="Active listening & emotional awareness"
            icon={Heart}
            value={personality.empathy ?? 80}
            onChange={(val) => updatePersonality("empathy", val)}
          />

          <SemiCircleGaugeCard
            label="Confidence"
            description="Decisive, authoritative & assured"
            icon={ShieldCheck}
            value={personality.confidence ?? 85}
            onChange={(val) => updatePersonality("confidence", val)}
          />
        </div>
      </div>

      {/* Row 3: Advanced Personality Controls (Left) + Live Persona Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
        {/* Left Column: Advanced Personality Controls (7 cols) */}
        <div className="lg:col-span-7 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="border-b border-[var(--color-border)] pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Advanced Personality Controls</span>
                  <InfoTooltip
                    content="Fine-tune secondary traits like patience during interruptions, conversational energy, humor, and curiosity."
                    position="top"
                  />
                </h4>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <AdvancedTraitCard
              label="Patience"
              description="Tolerant & willing to re-explain without rushing"
              icon={Clock}
              value={personality.patience ?? 90}
              onChange={(val) => updatePersonality("patience", val)}
            />

            <AdvancedTraitCard
              label="Energy"
              description="Conversational vitality & upbeat enthusiasm"
              icon={Zap}
              value={personality.energy ?? 70}
              onChange={(val) => updatePersonality("energy", val)}
            />

            <AdvancedTraitCard
              label="Humor"
              description="Lighthearted charm & polite witty warmth"
              icon={Sparkles}
              value={personality.humor ?? 10}
              onChange={(val) => updatePersonality("humor", val)}
            />

            <AdvancedTraitCard
              label="Assertiveness"
              description="Directness & steering calls toward key goals"
              icon={ShieldCheck}
              value={personality.assertiveness ?? 50}
              onChange={(val) => updatePersonality("assertiveness", val)}
            />

            <AdvancedTraitCard
              label="Curiosity"
              description="Asking proactive questions to uncover caller needs"
              icon={Search}
              value={personality.curiosity ?? 75}
              onChange={(val) => updatePersonality("curiosity", val)}
            />
          </div>
        </div>

        {/* Right Column: Dynamic Personality Profile & Live Persona Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Dynamic Personality Profile Card */}
          <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[var(--color-primary)]" />
                <h4 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Your Agent Personality Profile</span>
                  <InfoTooltip
                    content="Real-time AI analysis of the agent's personality traits, conversational posture, and demeanor."
                    position="top"
                  />
                </h4>
              </div>
              <Badge variant="primary" size="sm" className="text-[10px]">
                Dynamic Persona
              </Badge>
            </div>

            {/* Dominant Tags */}
            <div className="flex flex-wrap gap-1.5">
              {getDominantTags().map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 rounded-[var(--radius-main,0.25rem)]"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Dynamic AI Summary */}
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed italic bg-[var(--color-surface-muted)]/60 p-2.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]/60">
              “{getDynamicSummary()}”
            </p>
          </div>

          {/* Live Persona Preview Box */}
          <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                <MessageSquareQuote className="w-4 h-4 text-[var(--color-primary)]" />
                <span>Live Persona Preview</span>
                <InfoTooltip
                  content="Simulates how your agent introduces itself, explains value, and prompts the caller based on current settings."
                  position="top"
                />
              </h4>
              <span className="text-[10px] text-[var(--color-muted)] font-medium">
                {selectedVoiceObj.name} ({selectedVoiceObj.gender})
              </span>
            </div>

            {/* Dialogue Bubble */}
            <div className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] space-y-2.5">
              <div className="flex items-center justify-between gap-1 text-[10px] font-semibold text-[var(--color-muted)]">
                <div className="flex items-center gap-1.5 uppercase tracking-wider">
                  <Bot className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>Agent Response Preview</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[9px] text-[var(--color-heading)]">
                    {agentData.communication_style || "Professional"}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[9px] text-[var(--color-heading)] capitalize">
                    {agentData.response_length || "short"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-[var(--color-heading)] font-medium leading-relaxed transition-all duration-200">
                {getDialoguePreview()}
              </p>
            </div>

            {/* Play Sample Voice Button */}
            <button
              type="button"
              onClick={handlePlaySampleVoice}
              disabled={isLoadingAudio}
              className={`w-full py-2 px-3 text-xs font-semibold rounded-[var(--radius-main,0.375rem)] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs ${
                isPlayingAudio
                  ? "bg-[var(--color-danger)] text-white hover:opacity-90"
                  : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover,var(--color-primary))] disabled:opacity-60"
              }`}
            >
              {isLoadingAudio ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Voice...</span>
                </>
              ) : isPlayingAudio ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Voice Sample</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Sample Voice ({selectedVoiceObj.name})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

