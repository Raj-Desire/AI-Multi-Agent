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
import { AURA_VOICES, LLM_MODELS } from "./constants";
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
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  // Advanced accordion
  const [showAdvancedAI, setShowAdvancedAI] = useState(false);

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

  async function handlePlaySample() {
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.src = "";
      setCurrentAudio(null);
    }

    if (isPlayingSample) {
      setIsPlayingSample(false);
      return;
    }

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
          voice: agentData.voice?.voice || "aura-orion-en"
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
        setIsPlayingSample(false);
        setCurrentAudio(null);
      };

      audio.onerror = () => {
        setIsPlayingSample(false);
        setCurrentAudio(null);
        setAudioError("Unable to play synthesized audio sample.");
      };

      setCurrentAudio(audio);
      await audio.play();
    } catch (err: any) {
      console.error("Audio sample error:", err);
      setIsPlayingSample(false);
      setAudioError("Failed to play voice sample. Please ensure backend is running.");
    }
  }

  const selectedVoiceId = agentData.voice?.voice || "aura-orion-en";
  const selectedVoiceObj = AURA_VOICES.find((v) => v.id === selectedVoiceId) || AURA_VOICES[0];

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5">
        <h2 className="text-sm font-bold text-[var(--color-heading)]">Voice & Language</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Select how your voice assistant sounds and the language parameters it uses during calls.
        </p>
      </div>

      {/* Section 1: Voice Selection & Instant Preview */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <label className="block text-xs font-bold text-[var(--color-heading)]">
              Voice Model (Deepgram Aura Engine)
            </label>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              Select your AI voice and preview speech synthesis directly.
            </p>
          </div>
          <Badge variant="neutral" className="text-[10px] py-0.5 self-start sm:self-auto">
            Deepgram Aura TTS
          </Badge>
        </div>

        {/* Dropdown + Sample Text + Play Voice Button Row */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5 pt-1">
          {/* Voice Dropdown */}
          <div className="w-full md:w-64 shrink-0">
            <select
              value={selectedVoiceId}
              onChange={(e) => {
                const voiceId = e.target.value;
                const voiceObj = AURA_VOICES.find((v) => v.id === voiceId);
                const voiceLang = voiceObj?.language || "en";
                setAgentData((prev) => ({
                  ...prev,
                  voice: { ...prev.voice, voice: voiceId, language: voiceLang },
                  listen: {
                    ...prev.listen,
                    provider: prev.listen?.provider || "deepgram",
                    model: prev.listen?.model || "nova-3",
                    language: voiceLang
                  }
                }));
              }}
              className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium cursor-pointer"
            >
              <optgroup label="Deepgram Aura (English)">
                {AURA_VOICES.filter((v) => v.language === "en" && !v.id.startsWith("aura-2")).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender} • {v.style})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Deepgram Aura-2 Next-Gen (English)">
                {AURA_VOICES.filter((v) => v.language === "en" && v.id.startsWith("aura-2")).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender} • {v.style})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Deepgram Aura-2 Multilingual">
                {AURA_VOICES.filter((v) => v.language !== "en").map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender} • {v.style})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Sample Text Input */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder="Type sample text to preview voice..."
              className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Play Voice Button right beside dropdown */}
          <Button
            type="button"
            variant={isPlayingSample ? "danger" : "primary"}
            size="sm"
            onClick={handlePlaySample}
            leftIcon={isPlayingSample ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            className="cursor-pointer text-xs h-9 px-4 font-semibold shrink-0"
          >
            {isPlayingSample ? "Stop Audio" : "▶ Play Voice"}
          </Button>
        </div>

        {/* Active Voice Summary Meta */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-border)]/60 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--color-heading)]">{selectedVoiceObj.name}</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
              {selectedVoiceObj.gender}
            </Badge>
            <span className="text-[var(--color-primary)] font-medium">• {selectedVoiceObj.style}</span>
            <span className="text-[var(--color-muted)] hidden sm:inline">— {selectedVoiceObj.description}</span>
          </div>
          {audioError && <span className="text-[11px] text-[var(--color-danger)] font-medium">{audioError}</span>}
        </div>
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
            <span>Slow (0.8x)</span>
            <span>Normal (1.0x)</span>
            <span>Fast (1.2x)</span>
          </div>
        </div>

        {/* Primary Language */}
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-2.5">
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Primary Language
          </label>
          <select
            value={agentData.voice?.language || "en"}
            onChange={(e) => {
              const lang = e.target.value;
              let defaultSample = "Hello! I am your AI Voice Agent. How can I help you today?";
              let defaultVoice = "aura-orion-en";
              let defaultGreeting = "Hello! Thank you for calling. How can I assist you today?";

              if (lang === "es") {
                defaultSample = "¡Hola! Soy tu asistente de voz con IA. ¿Cómo puedo ayudarte hoy?";
                defaultVoice = "aura-2-agustina-es";
                defaultGreeting = "¡Hola! Gracias por llamar. ¿En qué puedo ayudarte hoy?";
              } else if (lang === "fr") {
                defaultSample = "Bonjour! Je suis votre assistant vocal IA. Comment puis-je vous aider aujourd'hui?";
                defaultVoice = "aura-2-agathe-fr";
                defaultGreeting = "Bonjour! Merci de votre appel. Comment puis-je vous aider?";
              } else if (lang === "de") {
                defaultSample = "Hallo! Ich bin Ihr KI-Sprachassistent. Wie kann ich Ihnen heute helfen?";
                defaultVoice = "aura-2-aurelia-de";
                defaultGreeting = "Hallo! Vielen Dank für Ihren Anruf. Wie kann ich Ihnen helfen?";
              } else if (lang === "ja") {
                defaultSample = "こんにちは！AI音声アシスタントです。本日はどのようなご用件でしょうか？";
                defaultVoice = "aura-2-ama-ja";
                defaultGreeting = "お電話ありがとうございます。本日はどのようなご用件でしょうか？";
              }

              setSampleText(defaultSample);
              setAgentData((prev) => ({
                ...prev,
                greeting: defaultGreeting,
                voice: { ...prev.voice, voice: defaultVoice, language: lang },
                listen: { ...prev.listen, language: lang, provider: "deepgram", model: "nova-3" }
              }));
            }}
            className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer font-medium"
          >
            <option value="en">English (US / Global)</option>
            <option value="hi">Hindi (हिन्दी)</option>
            <option value="gu">Gujarati (ગુજરાતી)</option>
            <option value="es">Spanish (Español)</option>
            <option value="fr">French (Français)</option>
            <option value="de">German (Deutsch)</option>
            <option value="ja">Japanese (日本語)</option>
          </select>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="auto-detect-lang"
              defaultChecked={true}
              className="w-3.5 h-3.5 accent-[var(--color-primary)] cursor-pointer"
            />
            <label htmlFor="auto-detect-lang" className="text-[11px] text-[var(--color-muted)] cursor-pointer">
              Automatically detect customer accent & language
            </label>
          </div>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {LLM_MODELS.map((model) => {
                  const isSelected = (agentData.llm?.model || "gpt-4o-mini") === model.id;

                  return (
                    <div
                      key={model.id}
                      onClick={() => setAgentData({
                        ...agentData,
                        llm: { ...agentData.llm, model: model.id }
                      })}
                      className={`p-3 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "bg-[var(--color-primary-light)]/20 border-[var(--color-primary)] shadow-2xs ring-1 ring-[var(--color-primary)]"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-[var(--color-heading)]">{model.name}</h4>
                          {model.recommended && (
                            <Badge variant="success" className="text-[9px] py-0 px-1 font-semibold">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-snug">
                          {model.description}
                        </p>
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
