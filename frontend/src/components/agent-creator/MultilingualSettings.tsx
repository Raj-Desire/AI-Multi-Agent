import React, { useEffect, useState } from "react";
import { InfoTooltip } from "../ui/Tooltip";
import { AgentConfig } from "../../types";

interface LanguageOption {
  code: string;
  label: string;
  selectable: boolean;
  reason: string | null;
}

interface MultilingualSettingsProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export function MultilingualSettings({ agentData, setAgentData }: MultilingualSettingsProps) {
  const [options, setOptions] = useState<LanguageOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const voiceId = agentData.voice?.voice || "flux-hannah-en";
  const provider = agentData.voice?.provider || "deepgram";
  const primary = agentData.voice?.language || "en";
  const enabled = !!agentData.language?.multilingual;
  const selected = agentData.language?.secondary || [];

  useEffect(() => {
    let isMounted = true;
    async function loadOptions() {
      try {
        const token = localStorage.getItem("desire_token");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
        const base = apiBase.endsWith("/api/v1") ? apiBase : `${apiBase}/api/v1`;
        const query = new URLSearchParams({ voice: voiceId, provider, language: primary });
        const res = await fetch(`${base}/voice/multilingual-languages?${query}`, { headers });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (isMounted) {
          setOptions(Array.isArray(body.data) ? body.data : []);
          setLoadFailed(false);
        }
      } catch {
        if (isMounted) setLoadFailed(true);
      }
    }
    loadOptions();
    return () => {
      isMounted = false;
    };
  }, [voiceId, provider, primary]);

  const primaryOption = options.find((o) => o.code === primary);
  const primarySupported = !!primaryOption?.selectable;
  const labelOf = (code: string) => options.find((o) => o.code === code)?.label || code.toUpperCase();

  const update = (multilingual: boolean, secondary: string[]) => {
    setAgentData((prev) => ({
      ...prev,
      language: { multilingual, primary, secondary },
    }));
  };

  const toggleLanguage = (code: string) => {
    update(enabled, selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };

  // Drop choices the current voice or primary language no longer supports.
  useEffect(() => {
    if (!enabled || options.length === 0) return;
    const valid = selected.filter((c) => c !== primary && options.find((o) => o.code === c)?.selectable);
    if (valid.length !== selected.length || !primarySupported) {
      setAgentData((prev) => ({
        ...prev,
        language: { multilingual: primarySupported, primary, secondary: valid },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, primary]);

  return (
    <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <label className="block text-xs font-semibold text-[var(--color-heading)]">Multi-language Calls</label>
            <InfoTooltip
              content="Let callers switch languages during the call. The agent opens in the spoken language above and replies in whichever selected language the caller uses."
              position="top"
            />
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            {primarySupported || options.length === 0
              ? `Starts in ${labelOf(primary)}, then follows the caller between the languages you select.`
              : `${labelOf(primary)} is not available for multi-language calls, so this agent stays in ${labelOf(primary)}.`}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable multi-language calls"
          disabled={!primarySupported}
          onClick={() => update(!enabled, selected)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
          } ${primarySupported ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-[var(--color-surface)] shadow-2xs transition-transform ${
              enabled ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      {loadFailed && (
        <p className="text-[11px] text-[var(--color-muted)]">
          Could not load the supported languages. Try again in a moment.
        </p>
      )}

      {enabled && primarySupported && (
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-[var(--color-heading)]">Languages callers can switch between</div>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => {
              const isPrimary = o.code === primary;
              const isOn = isPrimary || selected.includes(o.code);
              return (
                <button
                  key={o.code}
                  type="button"
                  disabled={isPrimary || !o.selectable}
                  title={isPrimary ? "Opening language" : o.reason || undefined}
                  aria-pressed={isOn}
                  onClick={() => toggleLanguage(o.code)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    isOn
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                      : o.selectable
                        ? "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border-[var(--color-border)] hover:border-[var(--color-primary)]/60 cursor-pointer"
                        : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border-[var(--color-border)] opacity-50 cursor-not-allowed"
                  }`}
                >
                  {o.label}
                  {isPrimary ? " · starts here" : ""}
                </button>
              );
            })}
          </div>
          {selected.length === 0 && (
            <p className="text-[11px] text-[var(--color-muted)]">Select at least one more language to turn switching on.</p>
          )}
        </div>
      )}
    </div>
  );
}
