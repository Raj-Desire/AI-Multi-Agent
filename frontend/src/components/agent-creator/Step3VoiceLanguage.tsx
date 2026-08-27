import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Volume2,
  Play,
  Square,
  Sparkles,
  Globe,
  Sliders,
  Cpu,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Zap,
  Mic,
  Smile,
  ShieldCheck,
  Headphones,
  User
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import {
  AURA_VOICES,
  SUPPORTED_LANGUAGES,
  LLM_MODELS,
  AGENT_PURPOSES
} from "./constants";
import { AgentConfig } from "../../types";

interface Step3VoiceLanguageProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

interface VoiceMetadata {
  accent: string;
  tone: string;
  bestFor: string;
  tagColor?: string;
}

const VOICE_METADATA_MAP: Record<string, VoiceMetadata> = {
  "aura-orion-en": { accent: "US English", tone: "Calm & Professional", bestFor: "B2B Sales & Execs" },
  "aura-luna-en": { accent: "US English", tone: "Calm & Relaxed", bestFor: "Follow-Up & Support" },
  "aura-asteria-en": { accent: "US English", tone: "Warm & Natural", bestFor: "Reception & Scheduling" },
  "aura-stella-en": { accent: "US English", tone: "Friendly & Clear", bestFor: "Reminders & Outreach" },
  "aura-arcas-en": { accent: "US English", tone: "Conversational & Steady", bestFor: "Customer Care & Surveys" },
  "aura-athena-en": { accent: "US English", tone: "Authoritative & Crisp", bestFor: "Tech Support & Billing" },
  "aura-hera-en": { accent: "US English", tone: "Confident & Polished", bestFor: "Corporate Consultation" },
  "aura-perseus-en": { accent: "US English", tone: "Energetic & Direct", bestFor: "Outbound Lead Gen" },
  "aura-angus-en": { accent: "US English", tone: "Deep & Formal", bestFor: "Healthcare & Legal" },
  "aura-helios-en": { accent: "US English", tone: "Direct & Crisp", bestFor: "Logistics & Delivery" },
  "aura-zeus-en": { accent: "US English", tone: "Deep & Resonant", bestFor: "Authority & Broadcast" },
  "aura-2-thalia-en": { accent: "US English (Gen-2)", tone: "Ultra-Natural & Warm", bestFor: "High-EQ Conversations" },
  "aura-2-andromeda-en": { accent: "US English (Gen-2)", tone: "Expressive & Natural", bestFor: "Concierge & Real Estate" },
  "aura-2-apollo-en": { accent: "US English (Gen-2)", tone: "Dynamic & Expressive", bestFor: "Interactive Pitching" },
  "aura-2-agustina-es": { accent: "Spanish (ES)", tone: "Warm & Clear", bestFor: "Spanish Reception" },
  "aura-2-javier-es": { accent: "Spanish (ES)", tone: "Professional", bestFor: "Spanish Sales & Business" },
  "aura-2-aurelia-de": { accent: "German (DE)", tone: "Clear & Natural", bestFor: "German Customer Service" },
  "aura-2-agathe-fr": { accent: "French (FR)", tone: "Warm & Natural", bestFor: "French Reception" },
  "aura-2-cesare-it": { accent: "Italian (IT)", tone: "Warm & Engaging", bestFor: "Italian Customer Service" },
  "aura-2-ama-ja": { accent: "Japanese (JA)", tone: "Polite & Natural", bestFor: "Japanese Business Care" }
};

export function Step3VoiceLanguage({
  agentData,
  setAgentData
}: Step3VoiceLanguageProps) {
  // Voice Preview State & Instant Audio Cache
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const audioBlobCacheRef = useRef<Map<string, string>>(new Map());

  // Filter & Search State for Voice Picker
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "female" | "male" | "english" | "multilingual">("all");

  // Advanced AI Settings Collapsible
  const [showAdvancedAI, setShowAdvancedAI] = useState(false);

  // Match role/purpose for recommendations
  const matchedPurpose = useMemo(() => {
    return (
      AGENT_PURPOSES.find(
        (p) =>
          p.defaultRole.toLowerCase() === (agentData.role || "").toLowerCase() ||
          p.title.toLowerCase() === (agentData.role || "").toLowerCase() ||
          agentData.name?.toLowerCase().includes(p.id.replace(/_/g, " "))
      ) ||
      AGENT_PURPOSES.find((p) => p.id === "custom") ||
      AGENT_PURPOSES[0]
    );
  }, [agentData.role, agentData.name]);

  // Selected Voice
  const selectedVoiceId = agentData.voice?.voice || "aura-orion-en";
  const isPlayingSample = playingVoiceId === selectedVoiceId;

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.onerror = null;
        audioElement.onended = null;
        audioElement.pause();
        audioElement.src = "";
      }
    };
  }, [audioElement]);

  // Prefetch voice sample audio into memory for instantaneous (0ms) playback on click
  const prefetchVoiceSample = async (voiceId: string): Promise<string | undefined> => {
    if (audioBlobCacheRef.current.has(voiceId)) return audioBlobCacheRef.current.get(voiceId);

    const voiceObj = AURA_VOICES.find((v) => v.id === voiceId);
    const sampleText =
      (voiceObj as any)?.sampleText ||
      `Hello! I am your AI voice agent. How can I help you today?`;

    try {
      const token = localStorage.getItem("desire_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
      const sampleUrl = apiBase.endsWith("/api/v1") ? `${apiBase}/voice/sample-speech` : `${apiBase}/api/v1/voice/sample-speech`;

      const response = await fetch(sampleUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: sampleText,
          voice: voiceId
        })
      });

      if (!response.ok) return undefined;

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      audioBlobCacheRef.current.set(voiceId, audioUrl);
      return audioUrl;
    } catch {
      return undefined;
    }
  };

  // Pre-warm active voice and common voices in the background
  useEffect(() => {
    const popularVoices = [selectedVoiceId, "aura-2-thalia-en", "aura-orion-en", "aura-luna-en", "aura-asteria-en"];
    popularVoices.forEach((vId) => {
      prefetchVoiceSample(vId);
    });
  }, [selectedVoiceId]);

  const stopCurrentAudio = () => {
    if (audioElement) {
      audioElement.onerror = null;
      audioElement.onended = null;
      audioElement.pause();
      audioElement.src = "";
      setAudioElement(null);
    }
    setPlayingVoiceId(null);
  };

  const playVoiceSample = async (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      stopCurrentAudio();
      return;
    }

    stopCurrentAudio();
    setPlayingVoiceId(voiceId);
    setAudioError(null);

    try {
      let audioUrl = audioBlobCacheRef.current.get(voiceId);
      if (!audioUrl) {
        audioUrl = await prefetchVoiceSample(voiceId);
      }

      if (!audioUrl) {
        throw new Error("Failed to load voice audio preview.");
      }

      const audio = new Audio(audioUrl);
      const currentSpeed = agentData.voice?.speed || 1.0;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, currentSpeed));

      audio.onended = () => {
        setPlayingVoiceId(null);
        setAudioElement(null);
        setAudioError(null);
      };

      audio.onerror = () => {
        if (!audio.src || audio.src === "" || audio.src === window.location.href) return;
        setPlayingVoiceId(null);
        setAudioElement(null);
        setAudioError("Audio playback failed. Please check your audio output device.");
      };

      setAudioElement(audio);
      try {
        await audio.play();
        setAudioError(null);
      } catch (playErr: any) {
        if (playErr.name !== "AbortError") {
          setAudioError("Audio playback failed. Please check your audio output device.");
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.warn("Voice TTS error:", err);
      stopCurrentAudio();
      setAudioError(err?.message || "Failed to generate speech preview.");
    }
  };

  const handlePlaySample = () => {
    playVoiceSample(selectedVoiceId);
  };

  const handleVoiceChange = (voiceId: string) => {
    const voiceObj = AURA_VOICES.find((v) => v.id === voiceId);
    setAgentData((prev) => ({
      ...prev,
      voice: {
        ...prev.voice,
        provider: "deepgram",
        voice: voiceId,
        language: voiceObj?.language || prev.voice?.language || "en"
      }
    }));
  };

  const handleLanguageChange = (lang: string) => {
    setAgentData((prev) => ({
      ...prev,
      voice: {
        ...prev.voice,
        language: lang
      },
      listen: {
        ...prev.listen,
        provider: prev.listen?.provider || "deepgram",
        model: prev.listen?.model || "nova-3",
        language: lang
      }
    }));
  };

  // Custom Dropdown State
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
  const voiceDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(event.target as Node)) {
        setIsVoiceDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedVoiceObj = AURA_VOICES.find((v) => v.id === selectedVoiceId) || AURA_VOICES[0];
  const selectedMetadata = VOICE_METADATA_MAP[selectedVoiceId] || {
    accent: "US English",
    tone: selectedVoiceObj.style,
    bestFor: "General Telephony"
  };

  // Filtered voice list for the rich dropdown catalog
  const filteredVoices = useMemo(() => {
    return AURA_VOICES.filter((v) => {
      // 1. Gender / Language filter
      if (activeFilter === "female" && v.gender.toLowerCase() !== "female") return false;
      if (activeFilter === "male" && v.gender.toLowerCase() !== "male") return false;
      if (activeFilter === "english" && (v.language !== "en" || v.id.startsWith("aura-2-a") || v.id.startsWith("aura-2-j") || v.id.startsWith("aura-2-c"))) return false;
      if (activeFilter === "multilingual" && v.language === "en" && !v.id.startsWith("aura-2")) return false;

      // 2. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const meta = VOICE_METADATA_MAP[v.id];
        const matchName = v.name.toLowerCase().includes(q);
        const matchDesc = (v.description || "").toLowerCase().includes(q);
        const matchStyle = (v.style || "").toLowerCase().includes(q);
        const matchBest = (meta?.bestFor || "").toLowerCase().includes(q);
        const matchTone = (meta?.tone || "").toLowerCase().includes(q);
        const matchAccent = (meta?.accent || "").toLowerCase().includes(q);
        return matchName || matchDesc || matchStyle || matchBest || matchTone || matchAccent;
      }
      return true;
    });
  }, [searchQuery, activeFilter]);

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-[var(--color-heading)] flex items-center gap-1.5">
              Voice, Speed &amp; Language
            </h2>
            <InfoTooltip
              content="Select Aura ultra-low latency lifelike telephony voice, conversational speed, and AI intelligence model."
              position="top"
            />
          </div>
        </div>
      </div>

      {/* Section 1: Rich Production Voice Picker */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3 relative z-30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Voice Model (Aura Lifelike)
              </label>
              <InfoTooltip
                content="Aura voices provide human-like tone, natural breathing, and ~200ms ultra-low latency for seamless telephone conversations."
                position="top"
              />
            </div>
          </div>
          <span className="text-[10px] text-[var(--color-muted)] font-medium">
            20 Enterprise Spoken Voices Available
          </span>
        </div>

        {/* Dropdown Button + Quick Preview Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
          {/* Custom Controlled Rich Voice Dropdown Button */}
          <div className="flex-1 min-w-0 relative" ref={voiceDropdownRef}>
            <button
              type="button"
              onClick={() => setIsVoiceDropdownOpen(!isVoiceDropdownOpen)}
              className="w-full min-h-[42px] px-3.5 py-1.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] font-semibold flex items-center justify-between gap-2.5 focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-2 focus:ring-[var(--color-primary)]/15 cursor-pointer select-none transition-all hover:border-[var(--color-border-strong,var(--color-border))]"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                {/* Voice Avatar Badge */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  selectedVoiceObj.gender.toLowerCase() === "female"
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                }`}>
                  {selectedVoiceObj.name[0]}
                </div>

                <div className="min-w-0 flex items-center gap-2 flex-wrap truncate">
                  <span className="font-bold text-xs text-[var(--color-heading)]">
                    {selectedVoiceObj.name}
                  </span>

                  {/* Accent Tag */}
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)]">
                    <Globe className="w-2.5 h-2.5 text-[var(--color-muted)]" />
                    <span>{selectedMetadata.accent}</span>
                  </span>

                  {/* Tone Tag */}
                  <span className="inline-flex items-center text-[10px] font-medium bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)]">
                    {selectedMetadata.tone}
                  </span>

                  {/* Best For Tag (fills space smoothly) */}
                  <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] bg-[var(--color-primary-light)]/20 px-2 py-0.5 rounded border border-[var(--color-primary)]/20">
                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                    <span>{selectedMetadata.bestFor}</span>
                  </span>
                </div>
              </div>

              <ChevronDown className={`w-4 h-4 text-[var(--color-muted)] shrink-0 transition-transform duration-200 ${isVoiceDropdownOpen ? "rotate-180 text-[var(--color-primary)]" : ""}`} />
            </button>

            {/* Rich Dropdown Panel with Search, Filter Chips & Multi-Tag Voice Cards */}
            {isVoiceDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xl z-50 overflow-hidden animate-fade-in text-xs">
                {/* Search & Category Filter Header Bar */}
                <div className="p-2.5 bg-[var(--color-surface-muted)]/70 border-b border-[var(--color-border)] space-y-2">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search voice by name, tone, accent, or use-case..."
                      className="w-full h-8 pl-8 pr-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>

                  {/* Filter Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] scrollbar-none">
                    {[
                      { id: "all", label: "All Voices" },
                      { id: "female", label: "Female" },
                      { id: "male", label: "Male" },
                      { id: "english", label: "English (US)" },
                      { id: "multilingual", label: "Multilingual" }
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setActiveFilter(f.id as any)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer shrink-0 ${
                          activeFilter === f.id
                            ? "bg-[var(--color-primary)] text-white shadow-2xs"
                            : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-heading)] border border-[var(--color-border)]"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scrollable Voice Cards List */}
                <div className="max-h-[310px] overflow-y-auto divide-y divide-[var(--color-border)]/60 focus:outline-none scrollbar-thin">
                  {filteredVoices.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[var(--color-muted)]">
                      No voices found matching "{searchQuery}".
                    </div>
                  ) : (
                    filteredVoices.map((v) => {
                      const isSelected = selectedVoiceId === v.id;
                      const isVoicePlaying = playingVoiceId === v.id;
                      const meta = VOICE_METADATA_MAP[v.id] || {
                        accent: v.language === "en" ? "US English" : v.language.toUpperCase(),
                        tone: v.style,
                        bestFor: "General Telephony"
                      };

                      return (
                        <div
                          key={v.id}
                          onMouseEnter={() => prefetchVoiceSample(v.id)}
                          onClick={() => {
                            handleVoiceChange(v.id);
                            setIsVoiceDropdownOpen(false);
                          }}
                          className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-all group select-none ${
                            isSelected
                              ? "bg-[var(--color-primary-light)]/25 text-[var(--color-heading)] font-semibold border-l-2 border-[var(--color-primary)]"
                              : "hover:bg-[var(--color-surface-muted)] text-[var(--color-heading)]"
                          }`}
                        >
                          {/* Left: Avatar + Name + Description */}
                          <div className="flex items-center gap-3 min-w-0 max-w-[280px] shrink-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-transform ${
                              v.gender.toLowerCase() === "female"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                            }`}>
                              {v.name[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-[var(--color-heading)] flex items-center gap-1.5">
                                <span>{v.name}</span>
                                {v.id.startsWith("aura-2") && (
                                  <span className="text-[9px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary-light)]/30 px-1.5 py-0.2 rounded">
                                    Gen-2
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--color-muted)] truncate max-w-[220px]">
                                {v.description || v.style}
                              </div>
                            </div>
                          </div>

                          {/* Middle (Fills White Space with Rich Metadata Tags) */}
                          <div className="hidden sm:flex items-center gap-2 flex-1 min-w-0 justify-start overflow-hidden">
                            {/* Accent Tag */}
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-[var(--color-surface-muted)] px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)] shrink-0">
                              <Globe className="w-2.5 h-2.5 text-[var(--color-muted)]" />
                              <span>{meta.accent}</span>
                            </span>

                            {/* Gender Pill */}
                            <span className="text-[10px] font-medium text-[var(--color-muted)] bg-[var(--color-surface-muted)] px-2 py-0.5 rounded border border-[var(--color-border)] shrink-0">
                              {v.gender}
                            </span>

                            {/* Tone Tag */}
                            <span className="hidden md:inline-flex text-[10px] font-medium text-[var(--color-heading)] bg-[var(--color-surface-muted)] px-2 py-0.5 rounded border border-[var(--color-border)] shrink-0 truncate max-w-[150px]">
                              {meta.tone}
                            </span>

                            {/* Best For Tag */}
                            <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] bg-[var(--color-primary-light)]/20 px-2 py-0.5 rounded-full border border-[var(--color-primary)]/20 shrink-0">
                              <Sparkles className="w-2.5 h-2.5 shrink-0" />
                              <span>{meta.bestFor}</span>
                            </span>
                          </div>

                          {/* Right: Soundwave Visualizer + Play Audio Button + Active Check */}
                          <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                            {/* Animated Equalizer Waveform Bars when playing */}
                            {isVoicePlaying && (
                              <div className="flex items-end gap-0.5 h-4 px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/30 rounded shrink-0">
                                <span className="w-0.5 bg-rose-500 rounded-full animate-wave-1" />
                                <span className="w-0.5 bg-rose-500 rounded-full animate-wave-2" />
                                <span className="w-0.5 bg-rose-500 rounded-full animate-wave-3" />
                                <span className="w-0.5 bg-rose-500 rounded-full animate-wave-4" />
                              </div>
                            )}

                            {/* Inline Voice Test Audio Button */}
                            <button
                              type="button"
                              onMouseEnter={() => prefetchVoiceSample(v.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                playVoiceSample(v.id);
                              }}
                              className={`p-1.5 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                                isVoicePlaying
                                  ? "bg-rose-500 text-white border-rose-500 shadow-xs"
                                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-heading)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:shadow-2xs"
                              }`}
                              title={isVoicePlaying ? "Stop voice preview" : `Preview ${v.name} voice`}
                            >
                              {isVoicePlaying ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                            </button>

                            {/* Selection Checkmark */}
                            <div className="w-4 flex items-center justify-center">
                              {isSelected && <Check className="w-4 h-4 text-[var(--color-primary)] stroke-[2.5]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Preview Button */}
          <Button
            type="button"
            variant={isPlayingSample ? "danger" : "primary"}
            size="sm"
            onClick={handlePlaySample}
            leftIcon={isPlayingSample ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            className="cursor-pointer text-xs h-10 px-4 font-semibold shrink-0"
          >
            {isPlayingSample ? "Stop" : "Preview Voice"}
          </Button>
        </div>
        {audioError && <p className="text-[10px] text-[var(--color-danger)] font-medium">{audioError}</p>}
      </div>

      {/* Section 2: Speaking Speed & Language */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Speaking Speed */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <label className="text-xs font-semibold text-[var(--color-heading)]">
                Speaking Speed
              </label>
              <InfoTooltip
                content="Calibrate speech playback rate. 1.0x is standard natural conversation speed."
                position="top"
              />
            </div>
            <div className="flex items-center gap-2">
              {matchedPurpose?.recommendedSpeed !== undefined && (
                <span className="text-[10px] text-[var(--color-muted)] font-medium">
                  Rec: <strong className="text-[var(--color-primary)]">{matchedPurpose.recommendedSpeed}x</strong>
                </span>
              )}
              <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                {agentData.voice?.speed || 1.0}x
              </span>
            </div>
          </div>
          <input
            type="range"
            min="0.8"
            max="1.2"
            step="0.05"
            value={agentData.voice?.speed || 1.0}
            onChange={(e) => setAgentData({
              ...agentData,
              voice: { ...agentData.voice, speed: parseFloat(e.target.value) }
            })}
            className="w-full accent-[var(--color-primary)] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[var(--color-muted)] font-medium">
            <span>0.8x (Slower)</span>
            <span>1.0x (Natural Default)</span>
            <span>1.2x (Faster)</span>
          </div>
        </div>

        {/* Primary Language */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2">
          <div className="flex items-center gap-1">
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Spoken Language &amp; Accent
            </label>
            <InfoTooltip
              content="The primary language spoken by the text-to-speech engine and transcribed by speech recognition."
              position="top"
            />
          </div>
          <select
            value={agentData.voice?.language || "en"}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] font-semibold focus:outline-none focus:border-[var(--color-primary)] cursor-pointer"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section 3: Advanced AI Model Settings (Collapsible) */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowAdvancedAI(!showAdvancedAI)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--color-heading)] bg-[var(--color-surface-muted)]/50 hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Advanced AI Model Settings (Optional)</span>
            <InfoTooltip
              content="Configure underlying LLM model, temperature variability, and token response limits."
              position="top"
            />
          </div>
          {showAdvancedAI ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
        </button>

        {showAdvancedAI && (
          <div className="p-4 space-y-4 border-t border-[var(--color-border)] animate-fade-in text-xs">
            {/* AI Model Cards */}
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">
                  Conversational LLM Model
                </label>
                <InfoTooltip
                  content="The reasoning model that interprets user intent and generates conversation replies."
                  position="top"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {LLM_MODELS.map((model) => {
                  const isSelected = (agentData.llm?.model || "gpt-4o-mini") === model.id;

                  return (
                    <div
                      key={model.id}
                      onClick={() => setAgentData({
                        ...agentData,
                        llm: {
                          ...agentData.llm,
                          model: model.id,
                          provider: (model as any).provider || agentData.llm?.provider || "open_ai"
                        }
                      })}
                      className={`p-3 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex flex-col justify-between select-none ${isSelected
                          ? "bg-[var(--color-primary-light)]/20 border-[var(--color-primary)] shadow-2xs ring-1 ring-[var(--color-primary)]"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))]"
                        }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <h4 className="text-xs font-bold text-[var(--color-heading)] truncate">{model.name}</h4>
                            {model.description && (
                              <InfoTooltip content={model.description} position="top" />
                            )}
                          </div>
                          {model.recommended && (
                            <Badge variant="success" className="text-[9px] py-0 px-1 font-semibold shrink-0">
                              Recommended
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-[var(--color-muted)] mt-2 pt-1 border-t border-[var(--color-border)]">
                        <span>Speed: <strong>{model.speed}</strong></span>
                        <span>Cost: <strong>{model.cost}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Temperature and Max Tokens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-semibold text-[var(--color-heading)]">
                      Temperature (Predictability)
                    </label>
                    <InfoTooltip
                      content="Lower temperature produces more predictable, factual answers; higher values allow more natural phrasing variance."
                      position="top"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {matchedPurpose?.recommendedTemperature !== undefined && (
                      <span className="text-[10px] text-[var(--color-muted)] font-medium">
                        Rec: <strong className="text-[var(--color-primary)]">{matchedPurpose.recommendedTemperature}</strong>
                      </span>
                    )}
                    <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                      {agentData.llm?.temperature ?? 0.4}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={agentData.llm?.temperature ?? 0.4}
                  onChange={(e) => setAgentData({
                    ...agentData,
                    llm: { ...agentData.llm, temperature: parseFloat(e.target.value) }
                  })}
                  className="w-full accent-[var(--color-primary)] cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <label className="block text-xs font-semibold text-[var(--color-heading)]">
                    Maximum Tokens Per Spoken Turn
                  </label>
                  <InfoTooltip
                    content="Limits the length of a single spoken reply to keep telephony turns snappy and interactive."
                    position="top"
                  />
                </div>
                <input
                  type="number"
                  min="50"
                  max="800"
                  step="50"
                  value={agentData.llm?.max_tokens || 300}
                  onChange={(e) => setAgentData({
                    ...agentData,
                    llm: { ...agentData.llm, max_tokens: parseInt(e.target.value) || 300 }
                  })}
                  className="w-full h-8 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
