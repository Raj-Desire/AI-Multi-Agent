import React, { useState, useEffect, useRef } from "react";
import { AgentConfig, VoiceTelemetryEvent, ConversationTurnMessage } from "../types";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Play,
  Square,
  Sparkles,
  Bot,
  MessageSquare,
  Activity,
  Cpu,
  RefreshCw,
  Send,
  AlertCircle,
  Clock,
  Zap,
  Sliders,
  Loader2
} from "lucide-react";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { useAuth } from "../context/AuthContext";

interface AgentLivePreviewProps {
  agentConfig: AgentConfig;
  className?: string;
}

export function AgentLivePreview({ agentConfig, className = "" }: AgentLivePreviewProps) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [transcriptMessages, setTranscriptMessages] = useState<ConversationTurnMessage[]>([]);
  const [latestLatency, setLatestLatency] = useState({ stt: 0, llm: 0, tts: 0, turn: 0 });
  const [typedMessage, setTypedMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio Context & Streaming refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const transcriptBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      stopPreviewSession();
    };
  }, []);

  // Update prompt dynamically if agentConfig changes while session is active
  useEffect(() => {
    if (isConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "configure",
          agent_config: agentConfig,
          greeting: agentConfig.greeting,
        })
      );
    }
  }, [JSON.stringify(agentConfig)]);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [transcriptMessages]);

  async function startPreviewSession() {
    try {
      setIsConnecting(true);
      setErrorMsg(null);
      setTranscriptMessages([]);
      setLatestLatency({ stt: 0, llm: 0, tts: 0, turn: 0 });

      // 1. Initialize Web Audio Context at native browser hardware rate (e.g. 44.1kHz or 48kHz)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx(); // Native hardware clock, no downsampling distortion
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;
      nextPlayTimeRef.current = 0;
      scheduledSourcesRef.current = [];

      console.info(`[VoicePlayground] Initialized native AudioContext at ${audioCtx.sampleRate} Hz`);

      // 2. Open WebSocket to backend preview stream
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/voice/preview-stream`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Ensure active organization_id is embedded in the agentConfig payload
      const effectiveOrgId = (agentConfig.organization_id && agentConfig.organization_id !== "default")
        ? agentConfig.organization_id
        : (user?.organization_id || "org_platform_root");

      const fullAgentConfig = {
        ...agentConfig,
        organization_id: effectiveOrgId
      };

      ws.onopen = () => {
        // Send initial agent configuration payload
        ws.send(
          JSON.stringify({
            type: "configure",
            agent_config: fullAgentConfig,
            greeting: agentConfig.greeting,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ready") {
            setIsConnected(true);
            setIsConnecting(false);
            startMicrophoneStream(ws);
          } else if (data.type === "audio" && data.payload) {
            playIncomingHDLinearAudio(data.payload, data.sample_rate || 24000, data.encoding || "linear16");
          } else if (data.type === "transcript") {
            setTranscriptMessages((prev) => [
              ...prev,
              {
                role: data.role === "user" ? "user" : "assistant",
                content: data.content,
                turn_latency_ms: data.latency_ms,
              },
            ]);
            if (data.role === "assistant") {
              setIsAgentSpeaking(false);
              setLatestLatency((prev) => ({ ...prev, turn: data.latency_ms || prev.turn }));
            }
          } else if (data.type === "clear") {
            // User interrupted / barged in - stop playing scheduled audio immediately
            clearAudioQueue();
            setIsUserSpeaking(true);
            setTimeout(() => setIsUserSpeaking(false), 800);
          } else if (data.event_type === "AgentThinking" || data.type === "event" && data.event_type === "AgentThinking") {
            setIsAgentSpeaking(true);
          } else if (data.event_type === "UserStartedSpeaking" || data.type === "event" && data.event_type === "UserStartedSpeaking") {
            setIsUserSpeaking(true);
            clearAudioQueue();
          } else if (data.event_type === "UserStoppedSpeaking" || data.type === "event" && data.event_type === "UserStoppedSpeaking") {
            setIsUserSpeaking(false);
          } else if (data.type === "call_concluded") {
            setTimeout(() => {
              stopPreviewSession();
            }, 1200);
          } else if (data.type === "error") {
            setErrorMsg(data.message || "Preview session error.");
            stopPreviewSession();
          }
        } catch (e) {
          console.error("Preview WS parse error:", e);
        }
      };

      ws.onerror = (err) => {
        console.error("Preview WS error:", err);
        setErrorMsg("Failed to connect to live preview stream. Please check backend status.");
        stopPreviewSession();
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setIsMicActive(false);
        setIsAgentSpeaking(false);
      };
    } catch (err: any) {
      console.error("Error starting live preview:", err);
      setErrorMsg(err.message || "Failed to start microphone or preview session.");
      stopPreviewSession();
    }
  }

  async function startMicrophoneStream(ws: WebSocket) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;
      setIsMicActive(true);

      const audioCtx = audioContextRef.current;
      if (!audioCtx) return;

      const source = audioCtx.createMediaStreamSource(stream);

      // Inline AudioWorklet code: batches render quanta into ~1024 samples for linear16 streaming
      const workletCode = `
        class MicProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.buffer = new Float32Array(1024);
            this.bufferIndex = 0;
          }
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input && input.length > 0) {
              const channelData = input[0];
              for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferIndex++] = channelData[i];
                if (this.bufferIndex >= this.buffer.length) {
                  this.port.postMessage(new Float32Array(this.buffer));
                  this.bufferIndex = 0;
                }
              }
            }
            return true;
          }
        }
        registerProcessor('mic-processor', MicProcessor);
      `;

      const blob = new Blob([workletCode], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);

      try {
        await audioCtx.audioWorklet.addModule(workletUrl);
        const workletNode = new AudioWorkletNode(audioCtx, "mic-processor");

        workletNode.port.onmessage = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData: Float32Array = e.data;
          if (!inputData || inputData.length === 0) return;

          // Resample from browser native sample rate (e.g. 48000Hz/44100Hz) to Deepgram input rate (24000Hz)
          const targetSampleRate = 24000;
          const srcSampleRate = audioCtx.sampleRate;
          let resampledData: Float32Array;

          if (srcSampleRate === targetSampleRate) {
            resampledData = inputData;
          } else {
            const ratio = srcSampleRate / targetSampleRate;
            const newLength = Math.round(inputData.length / ratio);
            resampledData = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
              const srcIdx = i * ratio;
              const i0 = Math.floor(srcIdx);
              const i1 = Math.min(i0 + 1, inputData.length - 1);
              const frac = srcIdx - i0;
              resampledData[i] = inputData[i0] * (1 - frac) + inputData[i1] * frac;
            }
          }

          // Convert Float32 to Int16 PCM (16-bit linear at 24000Hz)
          const pcm16Buffer = new Int16Array(resampledData.length);
          for (let i = 0; i < resampledData.length; i++) {
            const s = Math.max(-1, Math.min(1, resampledData[i]));
            pcm16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          // Convert Int16Array buffer to base64
          const uint8 = new Uint8Array(pcm16Buffer.buffer);
          let binary = "";
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const b64 = btoa(binary);

          ws.send(
            JSON.stringify({
              type: "audio",
              payload: b64,
              format: "pcm16",
            })
          );
        };

        source.connect(workletNode);
      } catch (workletErr) {
        console.warn("AudioWorklet fallback to ScriptProcessor:", workletErr);
        const processor = audioCtx.createScriptProcessor(2048, 1, 1);
        processorNodeRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);

          // Resample from browser native sample rate to 24000Hz
          const targetSampleRate = 24000;
          const srcSampleRate = audioCtx.sampleRate;
          let resampledData: Float32Array;

          if (srcSampleRate === targetSampleRate) {
            resampledData = inputData;
          } else {
            const ratio = srcSampleRate / targetSampleRate;
            const newLength = Math.round(inputData.length / ratio);
            resampledData = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
              const srcIdx = i * ratio;
              const i0 = Math.floor(srcIdx);
              const i1 = Math.min(i0 + 1, inputData.length - 1);
              const frac = srcIdx - i0;
              resampledData[i] = inputData[i0] * (1 - frac) + inputData[i1] * frac;
            }
          }

          const pcm16Buffer = new Int16Array(resampledData.length);
          for (let i = 0; i < resampledData.length; i++) {
            const s = Math.max(-1, Math.min(1, resampledData[i]));
            pcm16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          const uint8 = new Uint8Array(pcm16Buffer.buffer);
          let binary = "";
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const b64 = btoa(binary);

          ws.send(
            JSON.stringify({
              type: "audio",
              payload: b64,
              format: "pcm16",
            })
          );
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      }
    } catch (err: any) {
      console.warn("Microphone access denied or unavailable:", err);
      setErrorMsg("Microphone access is needed for live speech test. You can also type text below to test.");
    }
  }

  function stopPreviewSession() {
    setIsConnected(false);
    setIsConnecting(false);
    setIsMicActive(false);
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);

    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.disconnect();
      } catch (e) {}
      processorNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "stop" }));
        }
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    clearAudioQueue();
  }

  function clearAudioQueue() {
    // Instantly stop all scheduled audio buffers on timeline
    scheduledSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    });
    scheduledSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
    setIsAgentSpeaking(false);
  }

  /**
   * Decodes incoming high-definition 24kHz 16-bit linear PCM audio from Deepgram TTS
   * and schedules playback seamlessly on the Web Audio timeline (zero micro-gaps, zero jitter).
   */
  function playIncomingHDLinearAudio(base64Payload: string, sampleRate: number = 24000, encoding: string = "linear16") {
    const audioCtx = audioContextRef.current;
    if (!audioCtx) return;

    try {
      const binaryStr = atob(base64Payload);
      const byteLen = binaryStr.length;
      if (byteLen === 0) return;

      const bytes = new Uint8Array(byteLen);
      for (let i = 0; i < byteLen; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      let float32Samples: Float32Array;

      if (encoding === "linear16" || encoding === "pcm16") {
        // 16-bit signed integer Linear PCM (Little-Endian)
        const int16View = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
        float32Samples = new Float32Array(int16View.length);
        for (let i = 0; i < int16View.length; i++) {
          float32Samples[i] = int16View[i] / 32768.0;
        }
      } else {
        // Fallback standard mu-law decoding if legacy payload received
        float32Samples = new Float32Array(byteLen);
        for (let i = 0; i < byteLen; i++) {
          let b = ~bytes[i] & 0xff;
          let sign = b & 0x80;
          let exponent = (b >> 4) & 0x07;
          let mantissa = b & 0x0f;
          let sample = ((mantissa << 3) + 0x84) << exponent;
          sample -= 0x84;
          float32Samples[i] = (sign !== 0 ? -sample : sample) / 32768.0;
        }
      }

      const numSamples = float32Samples.length;
      const audioBuffer = audioCtx.createBuffer(1, numSamples, sampleRate);
      audioBuffer.getChannelData(0).set(float32Samples);

      // Schedule seamlessly onto the audio timeline
      const sourceNode = audioCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;

      const voiceSpeed = agentConfig?.voice?.speed || 1.0;
      sourceNode.playbackRate.value = Math.max(0.5, Math.min(2.0, voiceSpeed));

      sourceNode.connect(audioCtx.destination);

      const currentTime = audioCtx.currentTime;
      // If queue fell behind current time, schedule with small 10ms safety buffer
      const startTime = Math.max(currentTime + 0.01, nextPlayTimeRef.current);
      const chunkDuration = audioBuffer.duration / sourceNode.playbackRate.value;

      sourceNode.start(startTime);
      nextPlayTimeRef.current = startTime + chunkDuration;
      scheduledSourcesRef.current.push(sourceNode);
      setIsAgentSpeaking(true);

      // Clean up reference when ended
      sourceNode.onended = () => {
        scheduledSourcesRef.current = scheduledSourcesRef.current.filter((s) => s !== sourceNode);
        if (scheduledSourcesRef.current.length === 0 && audioCtx.currentTime >= nextPlayTimeRef.current - 0.05) {
          setIsAgentSpeaking(false);
        }
      };

      console.debug(
        `[VoicePlayground:Playback] Scheduled ${numSamples} samples (${(chunkDuration * 1000).toFixed(1)}ms) | ` +
        `Rate: ${sampleRate}Hz | StartTime: ${startTime.toFixed(3)}s (currentTime: ${currentTime.toFixed(3)}s)`
      );
    } catch (e) {
      console.error("[VoicePlayground] Audio playback decode/schedule error:", e);
    }
  }

  function handleSendTypedMessage() {
    if (!typedMessage.trim() || !isConnected || !wsRef.current) return;
    const msg = typedMessage.trim();
    setTypedMessage("");

    setTranscriptMessages((prev) => [
      ...prev,
      { role: "user", content: msg },
    ]);

    // Send text to backend preview socket
    wsRef.current.send(
      JSON.stringify({
        type: "inject_text",
        text: msg,
      })
    );
  }

  return (
    <div className={`flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-sm overflow-hidden text-left ${className}`}>
      {/* Top Header Banner */}
      <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="relative flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <div className={`w-3 h-3 rounded-full transition-colors ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" : "bg-slate-400"}`} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs font-bold text-[var(--color-heading)] leading-tight">
                Live Playground &amp; Voice Preview
              </h4>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 shadow-2xs shrink-0">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                <span>Real-Time Voice</span>
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-snug">
              Talk directly with your microphone or test conversational turns with ultra-low latency.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0 self-start sm:self-auto">
          {!isConnected ? (
            <button
              type="button"
              disabled={isConnecting}
              onClick={startPreviewSession}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover,var(--color-primary))] text-white shadow-sm hover:shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-50 select-none whitespace-nowrap"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Live Preview</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopPreviewSession}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow-md active:scale-98 transition-all cursor-pointer select-none whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Preview</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between animate-fade-in">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-xs font-bold px-1.5 py-0.5 rounded hover:bg-rose-500/20 cursor-pointer">✕</button>
        </div>
      )}

      {/* Telemetry & Configuration Strip */}
      <div className="px-4 py-2.5 bg-[var(--color-surface-muted)]/30 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs text-[11px]">
            <Volume2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span className="text-[var(--color-muted)]">Voice:</span>
            <span className="font-mono font-semibold text-[var(--color-heading)]">{agentConfig.voice?.voice || "aura-orion-en"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs text-[11px]">
            <Cpu className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span className="text-[var(--color-muted)]">Model:</span>
            <span className="font-mono font-semibold text-[var(--color-heading)]">{agentConfig.llm?.model || "gpt-4o-mini"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs text-[11px]">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[var(--color-muted)]">Barge-in:</span>
            <span className="font-semibold text-emerald-600">Active</span>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-2">
            {isUserSpeaking && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[var(--color-primary)] text-white shadow-xs animate-pulse">
                <Mic className="w-3 h-3" />
                <span>User Speaking...</span>
              </span>
            )}
            {isAgentSpeaking && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-600 text-white shadow-xs animate-pulse">
                <Volume2 className="w-3 h-3" />
                <span>Agent Answering...</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Conversational Transcript Feed */}
      <div
        ref={transcriptBoxRef}
        className="flex-1 p-4 bg-[var(--color-surface)] min-h-[240px] max-h-[360px] overflow-y-auto space-y-3 text-xs select-text"
      >
        {transcriptMessages.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-[var(--color-muted)] text-center p-6 space-y-2.5">
            <div className="w-12 h-12 rounded-full bg-[var(--color-surface-muted)] flex items-center justify-center text-[var(--color-muted)] border border-[var(--color-border)]">
              <Bot className="w-6 h-6 opacity-60 text-[var(--color-primary)]" />
            </div>
            <p className="text-xs max-w-sm leading-relaxed text-[var(--color-muted)]">
              {isConnected
                ? "Microphone is connected! Speak naturally into your microphone or type below to test live speech and answers."
                : "Click 'Start Live Preview' above to test real-time voice synthesis, interruption barge-in, and responses directly in your browser."}
            </p>
          </div>
        ) : (
          transcriptMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} animate-fade-in`}
            >
              <div className="text-[10px] text-[var(--color-muted)] mb-1 capitalize flex items-center gap-1.5">
                <span className="font-semibold text-[var(--color-heading)]">{msg.role === "user" ? "You (Microphone)" : agentConfig.name || "AI Voice Agent"}</span>
                {msg.turn_latency_ms && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-[var(--color-muted)]">
                    {msg.turn_latency_ms}ms
                  </span>
                )}
              </div>
              <div
                className={`p-3 text-xs leading-relaxed max-w-[85%] ${
                  msg.role === "user"
                    ? "bg-[var(--color-primary)] text-white font-medium rounded-2xl rounded-tr-xs shadow-xs"
                    : "bg-[var(--color-surface-muted)]/80 border border-[var(--color-border)] text-[var(--color-heading)] rounded-2xl rounded-tl-xs shadow-2xs"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Interactive Message Bar */}
      <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 flex items-center gap-2.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={typedMessage}
            onChange={(e) => setTypedMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendTypedMessage();
            }}
            disabled={!isConnected}
            placeholder={
              isConnected
                ? "Type a message or speak into your microphone..."
                : "Click 'Start Live Preview' above to speak or type..."
            }
            className="w-full h-9 pl-3.5 pr-10 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15 disabled:opacity-50 transition-all"
          />
          <button
            type="button"
            onClick={handleSendTypedMessage}
            disabled={!isConnected || !typedMessage.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-30 cursor-pointer transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {isConnected && isMicActive && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold px-2.5 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 shrink-0">
            <Mic className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
            <span>Mic Live</span>
          </div>
        )}
      </div>
    </div>
  );
}
