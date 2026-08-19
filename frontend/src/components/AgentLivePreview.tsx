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
  Sliders
} from "lucide-react";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";

interface AgentLivePreviewProps {
  agentConfig: AgentConfig;
  className?: string;
}

export function AgentLivePreview({ agentConfig, className = "" }: AgentLivePreviewProps) {
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
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
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

      // 1. Initialize Web Audio Context at 8000Hz (telephony standard)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 8000 });
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      // 2. Open WebSocket to backend preview stream
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/voice/preview-stream`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send initial agent configuration payload
        ws.send(
          JSON.stringify({
            type: "configure",
            agent_config: agentConfig,
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
            playIncomingAudio(data.payload);
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
            // User interrupted / barged in - stop playing current queued audio
            clearAudioQueue();
            setIsUserSpeaking(true);
            setTimeout(() => setIsUserSpeaking(false), 800);
          } else if (data.type === "event") {
            const ev = data.data;
            if (data.event_type === "AgentThinking") {
              setIsAgentSpeaking(true);
            } else if (data.event_type === "UserStartedSpeaking") {
              setIsUserSpeaking(true);
              clearAudioQueue();
            } else if (data.event_type === "UserStoppedSpeaking") {
              setIsUserSpeaking(false);
            }
          } else if (data.type === "call_concluded") {
            // Call concluded gracefully after max duration or silence timeout
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
        setErrorMsg("Failed to connect to Deepgram live preview stream. Check backend logs and DEEPGRAM_API_KEY.");
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

      // Inline AudioWorklet code: batches 128-sample render quanta into ~1024 samples (128ms) for standard streaming
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

          // Convert Float32 to Int16 PCM (16-bit)
          const pcm16Buffer = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
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
        // Fallback to ScriptProcessor if AudioWorklet is blocked in environment
        const processor = audioCtx.createScriptProcessor(2048, 1, 1);
        processorNodeRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16Buffer = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
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
    if (activeSourceNodeRef.current) {
      try {
        activeSourceNodeRef.current.stop();
        activeSourceNodeRef.current.disconnect();
      } catch (e) {}
      activeSourceNodeRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsAgentSpeaking(false);
  }

  // Decodes incoming base64 mu-law audio from Deepgram TTS and queues for seamless playback
  function playIncomingAudio(base64Payload: string) {
    const audioCtx = audioContextRef.current;
    if (!audioCtx) return;

    try {
      const binaryStr = atob(base64Payload);
      const len = binaryStr.length;
      const mulawBytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        mulawBytes[i] = binaryStr.charCodeAt(i);
      }

      // Convert 8kHz mu-law bytes to Float32 [-1, 1]
      const float32Samples = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        // Mu-law to linear expansion
        let b = ~mulawBytes[i] & 0xff;
        let sign = b & 0x80;
        let exponent = (b >> 4) & 0x07;
        let mantissa = b & 0x0f;
        let sample = ((mantissa << 3) + 0x84) << exponent;
        sample -= 0x84;
        if (sign === 0) sample = -sample;
        float32Samples[i] = sample / 32768.0;
      }

      // Create AudioBuffer at 8000Hz (native TTS mulaw sample rate)
      const audioBuffer = audioCtx.createBuffer(1, float32Samples.length, 8000);
      audioBuffer.copyToChannel(float32Samples, 0);

      audioQueueRef.current.push(audioBuffer);
      if (!isPlayingRef.current) {
        playNextAudioInQueue();
      }
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  }

  function playNextAudioInQueue() {
    const audioCtx = audioContextRef.current;
    if (!audioCtx || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsAgentSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsAgentSpeaking(true);
    const nextBuffer = audioQueueRef.current.shift()!;
    const sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = nextBuffer;
    sourceNode.connect(audioCtx.destination);
    activeSourceNodeRef.current = sourceNode;

    sourceNode.onended = () => {
      activeSourceNodeRef.current = null;
      playNextAudioInQueue();
    };

    sourceNode.start();
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
    <div className={`flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-sm overflow-hidden ${className}`}>
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
          <div>
            <h4 className="text-xs font-semibold text-[var(--color-heading)] flex items-center gap-1.5">
              <span>Live Playground & Voice Preview</span>
              <Badge variant="primary" size="sm">Deepgram Real-Time</Badge>
            </h4>
            <p className="text-[10px] text-[var(--color-muted)]">
              Talk directly with your mic or test parameters with 0 delay. No phone call needed.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isConnected ? (
            <Button
              variant="primary"
              size="sm"
              disabled={isConnecting}
              onClick={startPreviewSession}
              leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
              className="h-8 text-xs font-semibold"
            >
              {isConnecting ? "Connecting..." : "Start Live Preview"}
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={stopPreviewSession}
              leftIcon={<Square className="w-3.5 h-3.5 fill-current" />}
              className="h-8 text-xs"
            >
              Stop Preview
            </Button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-xs font-bold px-1">✕</button>
        </div>
      )}

      {/* Live Status Indicators Strip */}
      <div className="px-4 py-2 bg-[var(--color-surface-muted)]/30 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <Volume2 className="w-3 h-3 text-[var(--color-primary)]" />
            <span className="text-[var(--color-muted)]">Voice:</span>
            <strong className="font-mono text-[var(--color-heading)]">{agentConfig.voice?.voice || "aura-orion-en"}</strong>
          </div>
          <div className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-[var(--color-primary)]" />
            <span className="text-[var(--color-muted)]">Model:</span>
            <strong className="font-mono text-[var(--color-heading)]">{agentConfig.llm?.model || "gpt-4o-mini"}</strong>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[var(--color-muted)]">Barge-in:</span>
            <span className="font-medium text-emerald-600">Active</span>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-2">
            {isUserSpeaking && (
              <Badge variant="primary" size="sm" className="animate-pulse">
                🎤 User Speaking...
              </Badge>
            )}
            {isAgentSpeaking && (
              <Badge variant="success" size="sm" className="animate-pulse">
                🔊 Agent Answering...
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Spoken Turn Transcript Feed */}
      <div
        ref={transcriptBoxRef}
        className="flex-1 p-4 bg-[var(--color-surface)] min-h-[220px] max-h-[320px] overflow-y-auto space-y-2.5 text-xs select-text"
      >
        {transcriptMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--color-muted)] text-center p-6 space-y-2">
            <Bot className="w-8 h-8 opacity-25" />
            <p className="text-xs">
              {isConnected
                ? "Listening... Speak into your microphone to chat with the agent live!"
                : "Click 'Start Live Preview' to test voice synthesis, interruption barge-in, and response speed directly in your browser."}
            </p>
          </div>
        ) : (
          transcriptMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className="text-[10px] text-[var(--color-muted)] mb-0.5 capitalize flex items-center gap-1">
                <span>{msg.role === "user" ? "You (Microphone)" : agentConfig.name || "AI Agent"}</span>
                {msg.turn_latency_ms && (
                  <span className="font-mono opacity-60">({msg.turn_latency_ms}ms)</span>
                )}
              </div>
              <div
                className={`p-2.5 rounded-[var(--radius-main,0.375rem)] max-w-[85%] text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--color-primary)] text-white font-medium"
                    : "bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-[var(--color-heading)]"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Interactive Bar (Type to Speak & Send) */}
      <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 flex items-center gap-2">
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
                ? "Type a message or speak into your mic..."
                : "Connect preview above to speak or type..."
            }
            className="w-full h-8.5 pl-3 pr-8 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSendTypedMessage}
            disabled={!isConnected || !typedMessage.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-primary)] hover:opacity-80 disabled:opacity-30 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {isConnected && isMicActive && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
            <Mic className="w-3 h-3 animate-pulse" />
            <span>Mic Live</span>
          </div>
        )}
      </div>
    </div>
  );
}
