import React, { useCallback, useEffect, useState } from "react";
import { fetchApi, LIVE } from "../api-client";
import type { KeySlotName, KeySlotView, VoiceEngineId, VoiceProfile } from "../types";
import { Alert } from "./ui/Alert";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { LoadingState } from "./ui/LoadingState";

export interface VoiceCredentialsTabProps {
  organizationId: string;
  canManage: boolean;
  mode: "superadmin" | "org-admin";
}

const EMPTY_SLOT: KeySlotView = { key_hint: "", status: "unverified", source: null, last_verified_at: null, configured: false };

// Superadmin screens name the engine; anything an org admin sees uses the neutral voice labels.
const ADMIN_ENGINE_LABEL: Record<VoiceEngineId, string> = { aura: "Aura", cartesia: "Cartesia" };
const ORG_ENGINE_LABEL: Record<VoiceEngineId, string> = { aura: "Aura Voice", cartesia: "Sonic Voice" };

const SLOT_LABEL: Record<KeySlotName, string> = { engine: "engine key", tts: "voice key" };
const STATUS_VARIANT = { valid: "success", invalid: "danger", unverified: "warning" } as const;

function formatWhen(value: string | null): string {
  if (!value) return "Never verified";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "Never verified" : d.toLocaleString();
}

type Pending = { kind: "clear"; slot: KeySlotName } | { kind: "overwrite" } | null;

/**
 * An organization's voice credentials. Keys are write-only: the API only ever returns a masked hint, inputs are never
 * prefilled, and the typed value is dropped as soon as the save finishes.
 */
export function VoiceCredentialsTab({ organizationId, canManage, mode }: VoiceCredentialsTabProps) {
  const isAdminView = mode === "superadmin";
  const base = isAdminView ? `/superadmin/voice-profiles/${organizationId}` : "/voice-profile";
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<KeySlotName | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [change, setChange] = useState<Record<string, string> | null>(null);

  const load = useCallback(async () => {
    try {
      setProfile(await fetchApi<VoiceProfile>(base, LIVE));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load voice settings.");
    }
  }, [base]);

  useEffect(() => {
    setProfile(null);
    setEditing(null);
    setKeyInput("");
    setPending(null);
    load();
  }, [load]);

  async function run(action: () => Promise<VoiceProfile | void>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setProfile(next);
      else await load();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const put = (body: Record<string, unknown>) => fetchApi<VoiceProfile>(base, { method: "PUT", body: JSON.stringify(body) });

  function saveKey(slot: KeySlotName) {
    const value = keyInput;
    const field = slot === "engine" ? "engine_key" : "tts_key";
    run(async () => {
      const next = await put({ [field]: value });
      setKeyInput("");
      setEditing(null);
      return next;
    });
  }

  function importPlatform(overwrite: boolean) {
    run(async () => {
      try {
        const next = await fetchApi<VoiceProfile>(`${base}/import-platform${overwrite ? "?overwrite=true" : ""}`, { method: "POST" });
        setPending(null);
        return next;
      } catch (e: any) {
        if (e?.status === 409 && !overwrite) {
          setPending({ kind: "overwrite" });
          return;
        }
        throw e;
      }
    });
  }

  if (!profile) {
    return error ? <Alert type="danger">{error}</Alert> : <LoadingState message="Loading voice settings..." size="sm" />;
  }

  const slots: Record<KeySlotName, KeySlotView> = { engine: profile.engine || EMPTY_SLOT, tts: profile.tts || EMPTY_SLOT };
  const engine = profile.tts_engine;
  const engineLabel = engine ? (isAdminView ? ADMIN_ENGINE_LABEL : ORG_ENGINE_LABEL)[engine] : "Platform default";
  // The voice key only exists for engines that use a separate voice service
  const visibleSlots: KeySlotName[] = engine === "cartesia" || slots.tts.configured ? ["engine", "tts"] : ["engine"];
  const mayEditKeys = isAdminView ? canManage : canManage && profile.allow_org_edit;

  const slotRow = (name: KeySlotName) => {
    const slot = slots[name];
    const label = SLOT_LABEL[name];
    const label_cap = label.charAt(0).toUpperCase() + label.slice(1);
    return (
      <li key={name} className="p-3 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--color-heading)]">{label_cap}</div>
            <div className="text-xs font-mono text-[var(--color-muted)] break-all">
              {slot.configured ? <span>{slot.key_hint}</span> : <span>Not set</span>}
            </div>
          </div>
          {slot.configured && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={STATUS_VARIANT[slot.status] || "neutral"}>{slot.status}</Badge>
              {slot.source && <Badge variant="outline">{slot.source === "imported" ? "Imported" : "Own"}</Badge>}
            </div>
          )}
        </div>
        {slot.configured && <div className="text-[11px] text-[var(--color-muted)]">Last verified: {formatWhen(slot.last_verified_at)}</div>}

        {mayEditKeys && editing !== name && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} aria-label={`Replace ${label}`} onClick={() => { setEditing(name); setKeyInput(""); }}>
              Replace
            </Button>
            {isAdminView && slot.configured && (
              <>
                <Button variant="outline" size="sm" disabled={busy} aria-label={`Verify ${label}`} onClick={() => run(async () => fetchApi<VoiceProfile>(`${base}/verify`, { method: "POST" }))}>
                  Verify
                </Button>
                <Button variant="outline" size="sm" disabled={busy} aria-label={`Clear ${label}`} onClick={() => setPending({ kind: "clear", slot: name })}>
                  Clear
                </Button>
              </>
            )}
          </div>
        )}

        {mayEditKeys && editing === name && (
          <div className="space-y-2">
            <Input
              label={`New ${label}`}
              type="password"
              autoComplete="new-password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste the new key"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !keyInput.trim()} aria-label={`Save ${label}`} onClick={() => saveKey(name)}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setKeyInput(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {pending?.kind === "clear" && pending.slot === name && (
          <div role="alertdialog" aria-label="Confirm clear" className="p-2 rounded border border-[var(--color-border)] space-y-2">
            <p className="text-xs text-[var(--color-heading)]">Clear this key? The organization cannot take calls until a new valid key is added.</p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  run(async () => {
                    const next = await fetchApi<VoiceProfile>(`${base}/keys/${name}`, { method: "DELETE" });
                    setPending(null);
                    return next;
                  })
                }
              >
                Yes, clear key
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Keep key</Button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {error && <Alert type="danger" onDismiss={() => setError(null)}>{error}</Alert>}

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-[var(--color-muted)]">{isAdminView ? "Engine" : "Voice engine"}</dt>
          <dd className="font-semibold text-[var(--color-heading)]">{engineLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Credentials</dt>
          <dd className="font-semibold text-[var(--color-heading)]">{profile.credential_mode === "own" ? "Own keys" : "Platform keys"}</dd>
        </div>
        {isAdminView && (
          <div>
            <dt className="text-[var(--color-muted)]">Org admin can edit keys</dt>
            <dd>
              <label className="inline-flex items-center gap-2 text-[var(--color-heading)]">
                <input
                  type="checkbox"
                  checked={profile.allow_org_edit}
                  disabled={!canManage || busy}
                  onChange={(e) => run(() => put({ allow_org_edit: e.target.checked }))}
                />
                Allow
              </label>
            </dd>
          </div>
        )}
      </dl>

      {isAdminView && canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--color-heading)] flex items-center gap-2">
            Engine
            <select
              value={engine ?? ""}
              disabled={busy}
              onChange={(e) => e.target.value && setChange({ tts_engine: e.target.value })}
              className="h-8 px-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-heading)]"
            >
              {!engine && <option value="">Not chosen</option>}
              <option value="aura">Aura</option>
              <option value="cartesia">Cartesia</option>
            </select>
          </label>
          <label className="text-xs text-[var(--color-heading)] flex items-center gap-2">
            Credential mode
            <select
              value={profile.credential_mode}
              disabled={busy}
              onChange={(e) => setChange({ credential_mode: e.target.value })}
              className="h-8 px-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-heading)]"
            >
              <option value="platform">Platform</option>
              <option value="own">Own</option>
            </select>
          </label>
        </div>
      )}

      {change && (
        <div role="alertdialog" aria-label="Confirm change" className="p-2 rounded border border-[var(--color-border)] space-y-2">
          <p className="text-xs text-[var(--color-heading)]">
            Change the {"tts_engine" in change ? "voice engine" : "credential mode"}? Switching can affect live agents and calls in progress for this organization.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => { const body = change; setChange(null); run(() => put(body)); }}>
              Confirm change
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChange(null)}>Cancel change</Button>
          </div>
        </div>
      )}

      <ul className="space-y-2">{visibleSlots.map(slotRow)}</ul>

      {isAdminView && canManage && (
        <div className="space-y-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => importPlatform(false)}>
            Import from superadmin
          </Button>
          {pending?.kind === "overwrite" && (
            <div role="alertdialog" aria-label="Confirm overwrite" className="p-2 rounded border border-[var(--color-border)] space-y-2">
              <p className="text-xs text-[var(--color-heading)]">This replaces the organization's own key</p>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" disabled={busy} onClick={() => importPlatform(true)}>
                  Replace key
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isAdminView && !mayEditKeys && (
        <p className="text-[11px] text-[var(--color-muted)]">Voice keys are managed by your platform administrator.</p>
      )}
    </div>
  );
}
