import React, { useState, useEffect } from "react";
import {
  Volume2,
  Play,
  Square,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Cpu,
  Globe,
  Sliders,
  Check
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import { AURA_VOICES, DEEPGRAM_SUPPORTED_LANGUAGES, LLM_MODELS } from "./constants";
import { AgentConfig } from "../../types";

interface Step3VoiceLanguageProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export function Step3VoiceLanguage({
  agentData,
  setAgentData
}: Step3VoiceLanguageProps) {
  // Sample speech playback state
  const [sampleText, setSampleText] = useState("Hello, thank you for calling. How can I help you today?");
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  // Advanced accordion
  const [showAdvancedAI, setShowAdvancedAI] = useState(false);

  const selectedVoiceId = agentData.voice?.voice || "aura-orion-en";

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudio) {
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.pause();
        currentAudio.src = "";
      }
    };
  }, [currentAudio]);

  async function playVoiceSample(voiceId: string) {
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.src = "";
      setCurrentAudio(null);
    }

    if (playingVoiceId === voiceId) {
      setPlayingVoiceId(null);
      setIsPlayingSample(false);
      return;
    }

    setPlayingVoiceId(voiceId);
    setIsPlayingSample(true);
    setAudioError(null);

    try {
      const token = localStorage.getItem("desire_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch("http://localhost:8000/api/v1/voice/sample-speech", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: sampleText.trim() || "Hello, thank you for calling. How can I help you today?",
          voice: voiceId
        })
      });

      if (!response.ok) {
        throw new Error(`Voice synthesis failed (${response.status})`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      // Apply Speaking Speed directly to audio playback rate
      const speed = agentData.voice?.speed || 1.0;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));

      audio.onended = () => {
        setPlayingVoiceId(null);
        setIsPlayingSample(false);
        setCurrentAudio(null);
      };

      audio.onerror = () => {
        setPlayingVoiceId(null);
        setIsPlayingSample(false);
        setCurrentAudio(null);
        setAudioError("Sample audio not currently available for preview.");
      };

      setCurrentAudio(audio);
      await audio.play();
    } catch (e: any) {
      setPlayingVoiceId(null);
      setIsPlayingSample(false);
      setAudioError(e?.message || "Failed to play voice sample.");
    }
  }

  async function handlePlaySample() {
    await playVoiceSample(selectedVoiceId);
  }

  const handleVoiceChange = (voiceId: string) => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      setCurrentAudio(null);
      setIsPlayingSample(false);
      setPlayingVoiceId(null);
    }

    const vObj = AURA_VOICES.find((v) => v.id === voiceId);
    const lang = vObj?.language || "en";
    setAgentData((prev) => ({
      ...prev,
      voice: {
        ...prev.voice,
        voice: voiceId,
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
  const voiceDropdownRef = React.useRef<HTMLDivElement>(null);

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

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5">
        <h2 className="text-sm font-bold text-[var(--color-heading)]">Voice, Speed & Language</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Select Deepgram Aura ultra-low latency lifelike telephony voice, conversational speed, and AI intelligence model.
        </p>
      </div>

      {/* Section 1: Deepgram Voice Picker */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3 relative z-30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-heading)]">
              Voice Model (Deepgram Aura-2 Lifelike)
            </label>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              Optimized for real-time natural conversational rhythm and zero robotic hesitation.
            </p>
          </div>
          <Badge variant="neutral" className="text-[10px] py-0.5 self-start sm:self-auto">
            ⚡ Ultra-Low Latency (~200ms)
          </Badge>
        </div>

        {/* Dropdown + Play Button in one cohesive responsive row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
          {/* Custom Controlled Voice Dropdown (Opens downwards, fits 7 items with scroll) */}
          <div className="flex-1 min-w-0 relative" ref={voiceDropdownRef}>
            <button
              type="button"
              onClick={() => setIsVoiceDropdownOpen(!isVoiceDropdownOpen)}
              className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] font-semibold flex items-center justify-between gap-2 focus:outline-none focus:border-[var(--color-primary)] cursor-pointer select-none transition-colors hover:border-[var(--color-border-strong,var(--color-border))]"
            >
              <div className="flex items-center gap-2 min-w-0 truncate">
                <Volume2 className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                <span className="truncate">
                  {selectedVoiceObj.name} ({selectedVoiceObj.gender} • {selectedVoiceObj.style})
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-[var(--color-muted)] shrink-0 transition-transform duration-200 ${isVoiceDropdownOpen ? "rotate-180 text-[var(--color-primary)]" : ""}`} />
            </button>

            {/* Dropdown Menu - Opens BELOW (top-full mt-1) with max height of ~7 items (max-h-[250px]) and scrollable */}
            {isVoiceDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-xl z-50 overflow-hidden animate-fade-in text-xs">
                <div className="max-h-[255px] overflow-y-auto divide-y divide-[var(--color-border)]/50 focus:outline-none scrollbar-thin">
                  {/* Aura-1 Group */}
                  <div className="py-1">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] bg-[var(--color-surface-muted)]/60">
                      Deepgram Aura-1 (English)
                    </div>
                    {AURA_VOICES.filter((v) => v.language === "en" && !v.id.startsWith("aura-2")).map((v) => {
                      const isSelected = selectedVoiceId === v.id;
                      const isVoicePlaying = playingVoiceId === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => {
                            handleVoiceChange(v.id);
                            setIsVoiceDropdownOpen(false);
                          }}
                          className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors group ${
                            isSelected
                              ? "bg-[var(--color-primary-light)]/25 text-[var(--color-primary)] font-bold"
                              : "hover:bg-[var(--color-surface-muted)] text-[var(--color-heading)]"
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="font-semibold text-xs truncate">
                              {v.name} <span className="font-normal text-[11px] opacity-75">({v.gender} • {v.style})</span>
                            </div>
                            {v.description && (
                              <div className="text-[10px] text-[var(--color-muted)] truncate">{v.description}</div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Inline Voice Test Audio Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playVoiceSample(v.id);
                              }}
                              className={`p-1.5 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                                isVoicePlaying
                                  ? "bg-red-500 text-white border-red-500 animate-pulse"
                                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-heading)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] opacity-80 group-hover:opacity-100"
                              }`}
                              title={isVoicePlaying ? "Stop voice preview" : `Test ${v.name} voice`}
                            >
                              {isVoicePlaying ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                            </button>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 stroke-[2.5]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Aura-2 Group */}
                  <div className="py-1">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] bg-[var(--color-surface-muted)]/60">
                      Deepgram Aura-2 (Next-Gen Multilingual)
                    </div>
                    {AURA_VOICES.filter((v) => v.id.startsWith("aura-2")).map((v) => {
                      const isSelected = selectedVoiceId === v.id;
                      const isVoicePlaying = playingVoiceId === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => {
                            handleVoiceChange(v.id);
                            setIsVoiceDropdownOpen(false);
                          }}
                          className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors group ${
                            isSelected
                              ? "bg-[var(--color-primary-light)]/25 text-[var(--color-primary)] font-bold"
                              : "hover:bg-[var(--color-surface-muted)] text-[var(--color-heading)]"
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="font-semibold text-xs truncate">
                              {v.name} <span className="font-normal text-[11px] opacity-75">({v.gender} • {v.style})</span>
                            </div>
                            {v.description && (
                              <div className="text-[10px] text-[var(--color-muted)] truncate">{v.description}</div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Inline Voice Test Audio Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playVoiceSample(v.id);
                              }}
                              className={`p-1.5 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                                isVoicePlaying
                                  ? "bg-red-500 text-white border-red-500 animate-pulse"
                                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-heading)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] opacity-80 group-hover:opacity-100"
                              }`}
                              title={isVoicePlaying ? "Stop voice preview" : `Test ${v.name} voice`}
                            >
                              {isVoicePlaying ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                            </button>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 stroke-[2.5]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button
            type="button"
            variant={isPlayingSample ? "danger" : "primary"}
            size="sm"
            onClick={handlePlaySample}
            leftIcon={isPlayingSample ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            className="cursor-pointer text-xs h-9 px-4 font-semibold shrink-0"
          >
            {isPlayingSample ? "Stop" : "Preview"}
          </Button>
        </div>
        {audioError && <p className="text-[10px] text-[var(--color-danger)] font-medium">{audioError}</p>}
      </div>

      {/* Section 2: Speaking Speed & Language */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Speaking Speed */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--color-heading)]">
              Speaking Speed
            </label>
            <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
              {agentData.voice?.speed || 1.0}x
            </span>
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
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Spoken Language & Accent
          </label>
          <select
            value={agentData.voice?.language || "en"}
            onChange={(e) => setAgentData({
              ...agentData,
              voice: { ...agentData.voice, language: e.target.value }
            })}
            className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] font-semibold focus:outline-none focus:border-[var(--color-primary)] cursor-pointer"
          >
            {DEEPGRAM_SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--color-muted)]">
            Deepgram Aura-2 & Nova-3 native telephony speech language.
          </p>
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
          </div>
          {showAdvancedAI ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
        </button>

        {showAdvancedAI && (
          <div className="p-4 space-y-4 border-t border-[var(--color-border)] animate-fade-in text-xs">
            {/* AI Model Cards */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--color-heading)]">
                Conversational LLM Model
              </label>
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
                <div className="flex justify-between">
                  <label className="text-xs font-semibold text-[var(--color-heading)]">
                    Temperature (Predictability)
                  </label>
                  <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                    {agentData.llm?.temperature ?? 0.4}
                  </span>
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
                <p className="text-[11px] text-[var(--color-muted)]">
                  Controls how creative or precise the AI responses are. 0.4 is optimal for voice accuracy.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-heading)]">
                  Maximum Tokens Per Spoken Turn
                </label>
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
                <p className="text-[11px] text-[var(--color-muted)]">
                  Limits response length per turn to keep voice calls fast and conversational.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
