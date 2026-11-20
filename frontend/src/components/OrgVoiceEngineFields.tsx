import React from "react";
import type { VoiceEngineId } from "../types";
import { Input } from "./ui/Input";

export interface OrgVoiceEngineValue {
  engine: VoiceEngineId;
  engineKey: string;
  ttsKey: string;
  importPlatform: boolean;
}

export const DEFAULT_ORG_VOICE: OrgVoiceEngineValue = { engine: "aura", engineKey: "", ttsKey: "", importPlatform: false };

/** Voice engine and key fields of the create-organization form (superadmin only, so engine names are shown). */
export function OrgVoiceEngineFields({ value, onChange }: { value: OrgVoiceEngineValue; onChange: (v: OrgVoiceEngineValue) => void }) {
  const set = (patch: Partial<OrgVoiceEngineValue>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="space-y-3 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] p-3">
      <legend className="px-1 text-xs font-medium text-[var(--color-heading)]">Voice engine</legend>
      <div className="flex flex-wrap gap-4">
        {(["aura", "cartesia"] as VoiceEngineId[]).map((id) => (
          <label key={id} className="inline-flex items-center gap-2 text-xs text-[var(--color-heading)]">
            <input
              type="radio"
              name="org-voice-engine"
              checked={value.engine === id}
              onChange={() => set({ engine: id, ttsKey: id === "aura" ? "" : value.ttsKey })}
            />
            {id === "aura" ? "Aura" : "Cartesia"}
          </label>
        ))}
      </div>
      <label className="inline-flex items-center gap-2 text-xs text-[var(--color-heading)]">
        <input type="checkbox" checked={value.importPlatform} onChange={(e) => set({ importPlatform: e.target.checked })} />
        Import from superadmin
      </label>
      <Input
        label="Engine key"
        type="password"
        autoComplete="new-password"
        required={!value.importPlatform}
        value={value.engineKey}
        onChange={(e) => set({ engineKey: e.target.value })}
        placeholder={value.importPlatform ? "Optional override" : "Paste the engine key"}
      />
      {value.engine === "cartesia" && (
        <Input
          label="Voice key"
          type="password"
          autoComplete="new-password"
          required={!value.importPlatform}
          value={value.ttsKey}
          onChange={(e) => set({ ttsKey: e.target.value })}
          placeholder={value.importPlatform ? "Optional override" : "Paste the voice key"}
        />
      )}
      <p className="text-[11px] text-[var(--color-muted)]">The organization cannot take calls until its keys are verified.</p>
    </fieldset>
  );
}
