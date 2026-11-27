import React, { useCallback, useEffect, useState } from "react";
import { fetchApi, LIVE } from "../api-client";
import type { KeySlotName, KeySlotView, LlmConfigView, VoiceEngineId, VoiceProfile } from "../types";
import { Alert } from "./ui/Alert";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { LoadingState } from "./ui/LoadingState";

export interface VoiceCredentialsTabProps {
  organizationId: string;
  canManage: boolean;
}

const EMPTY_SLOT: KeySlotView = { key_hint: "", status: "unverified", source: null, last_verified_at: null, configured: false };

// Super admin only screen, so it names the engine.
const ADMIN_ENGINE_LABEL: Record<VoiceEngineId, string> = { aura: "Aura", cartesia: "Cartesia" };

// Used for button/aria names (kept stable).
const SLOT_LABEL: Record<KeySlotName, string> = { engine: "engine key", tts: "voice key" };

// Visible names and one-line explanations.
const SLOT_TITLE: Record<KeySlotName, string> = {
  engine: "Voice agent (listening and conversation engine)",
  tts: "Voice (speech) key: Cartesia",
};
const SLOT_HELP: Record<KeySlotName, string> = {
  engine: "Key for the engine that listens to callers. On Standard it also runs the conversation. Always required.",
  tts: "Key for the speaking voice. Required because this organization uses Cartesia.",
};
const MODE_LABEL = { own: "Own keys", platform: "Platform keys" } as const;
const STATUS_VARIANT = { valid: "success", invalid: "danger", unverified: "warning" } as const;

/** One status chip for every credential section: Not set, Saved (not yet verified), Verified, or Invalid. */
function StatusChip({ configured, status }: { configured: boolean; status: "valid" | "invalid" | "unverified" }) {
  if (!configured) return <Badge variant="neutral">Not set</Badge>;
  const label = status === "valid" ? "Verified" : status === "invalid" ? "Invalid" : "Saved";
  return <Badge variant={STATUS_VARIANT[status] || "neutral"}>{label}</Badge>;
}

function formatWhen(value: string | null): string {
  if (!value) return "Never verified";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "Never verified" : d.toLocaleString();
}


const EMPTY_LLM: LlmConfigView = {
  configured: false, endpoint: "", deployment: "", api_version: "",
  key_hint: "", has_key: false, status: "unverified", last_verified_at: null,
};

/**
 * The organization's own language model settings (used by the Economy plan only). The key is write-only: never
 * prefilled, omitted from the save when left empty, and dropped from the input once the save finishes.
 */
function LanguageModelSection({
  base, profile, busy, run, onProfile,
}: {
  base: string;
  profile: VoiceProfile;
  busy: boolean;
  run: (action: () => Promise<VoiceProfile | void>) => Promise<void>;
  onProfile: (p: VoiceProfile) => void;
}) {
  const llm = profile.llm || EMPTY_LLM;
  const [endpoint, setEndpoint] = useState(llm.endpoint);
  const [deployment, setDeployment] = useState(llm.deployment);
  const [apiVersion, setApiVersion] = useState(llm.api_version);
  const [keyInput, setKeyInput] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setEndpoint(llm.endpoint);
    setDeployment(llm.deployment);
    setApiVersion(llm.api_version);
  }, [llm.endpoint, llm.deployment, llm.api_version]);

  function save() {
    const body: Record<string, string> = {
      llm_endpoint: endpoint.trim(),
      llm_deployment: deployment.trim(),
      llm_api_version: apiVersion.trim(),
    };
    if (keyInput.trim()) body.llm_api_key = keyInput.trim();
    run(async () => {
      try {
        setCheck(null);
        return await fetchApi<VoiceProfile>(base, { method: "PUT", body: JSON.stringify(body) });
      } finally {
        setKeyInput("");
      }
    });
  }

  function verify() {
    run(async () => {
      const next = await fetchApi<VoiceProfile>(`${base}/llm/verify`, { method: "POST" });
      setCheck(next.llm_check || null);
      return next;
    });
  }

  const economy = profile.voice_engine === "custom";
  const ready = !!endpoint.trim() && !!deployment.trim() && (llm.has_key || !!keyInput.trim());
  const dirty =
    endpoint.trim() !== llm.endpoint || deployment.trim() !== llm.deployment ||
    apiVersion.trim() !== llm.api_version || !!keyInput.trim();

  return (
    <section aria-label="Language model" className="p-3 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-[var(--color-heading)]">Language model (Economy plan)</h4>
          <div className="text-[11px] text-[var(--color-muted)]">
            The organization's own model settings. Economy calls use only these, so usage is billed and measured per organization.
          </div>
        </div>
        <StatusChip configured={llm.configured} status={llm.status} />
      </div>

      {economy && !llm.configured && (
        <Alert type="warning">Economy needs these; calls will run Standard until set.</Alert>
      )}
      {economy && llm.configured && llm.status !== "valid" && (
        <Alert type="warning">
          {llm.status === "invalid"
            ? "The last check of these settings failed. Fix them, then verify."
            : "These settings are not verified yet. Use Verify to check them."}
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Endpoint" type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://your-resource.example.com" />
        <Input label="Deployment name" type="text" value={deployment} onChange={(e) => setDeployment(e.target.value)} />
        <Input label="API version (optional)" type="text" value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} placeholder="2024-08-01-preview" />
        <Input
          label="Language model key"
          type="password"
          autoComplete="new-password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={llm.has_key ? "Leave empty to keep the saved key" : "Paste the key"}
        />
      </div>
      <div className="text-[11px] font-mono text-[var(--color-muted)] break-all">
        {llm.has_key ? <span>Key saved ({llm.key_hint})</span> : <span>No key saved</span>}
      </div>
      {llm.configured && <div className="text-[11px] text-[var(--color-muted)]">Last verified: {formatWhen(llm.last_verified_at)}</div>}

      {check && <Alert type={check.ok ? "success" : "danger"}>{check.message}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !ready || !dirty} aria-label="Save language model" onClick={save}>
          Save
        </Button>
        <Button variant="outline" size="sm" disabled={busy || !llm.configured || dirty} aria-label="Verify language model" onClick={verify}>
          Verify
        </Button>
        {(llm.configured || llm.has_key) && (
          <Button variant="outline" size="sm" disabled={busy} aria-label="Clear language model" onClick={() => setConfirmClear(true)}>
            Clear
          </Button>
        )}
      </div>

      {confirmClear && (
        <div role="alertdialog" aria-label="Confirm clear language model" className="p-2 rounded border border-[var(--color-border)] space-y-2">
          <p className="text-xs text-[var(--color-heading)]">Remove these settings? Economy calls for this organization will run Standard until new ones are saved.</p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              aria-label="Yes, clear language model"
              onClick={() =>
                run(async () => {
                  const next = await fetchApi<VoiceProfile>(`${base}/llm`, { method: "DELETE" });
                  setConfirmClear(false);
                  setCheck(null);
                  return next;
                })
              }
            >
              Yes, clear
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>Keep settings</Button>
          </div>
        </div>
      )}
    </section>
  );
}

const IMPORT_LABEL: Record<string, string> = { engine_key: "voice agent key", tts_key: "voice (speech) key", llm: "language model settings" };

function describeImport(p: VoiceProfile): string | null {
  const report = p.import_report;
  if (!report) return null;
  const parts: string[] = [];
  parts.push(report.imported.length ? `Imported: ${report.imported.map((k) => IMPORT_LABEL[k] || k).join(", ")}.` : "Nothing was imported.");
  if (report.llm_message) parts.push(report.llm_message);
  return parts.join(" ");
}

type Pending = { kind: "clear"; slot: KeySlotName } | { kind: "overwrite" } | null;

/**
 * An organization's voice credentials. Keys are write-only: the API only ever returns a masked hint, inputs are never
 * prefilled, and the typed value is dropped as soon as the save finishes.
 */
export function VoiceCredentialsTab({ organizationId, canManage }: VoiceCredentialsTabProps) {
  const base = `/superadmin/voice-profiles/${organizationId}`;
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<KeySlotName | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [change, setChange] = useState<Record<string, string> | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);

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
      try {
        const next = await put({ [field]: value });
        setEditing(null);
        return next;
      } finally {
        setKeyInput("");
      }
    });
  }

  function importPlatform(overwrite: boolean) {
    run(async () => {
      try {
        const next = await fetchApi<VoiceProfile>(`${base}/import-platform${overwrite ? "?overwrite=true" : ""}`, { method: "POST" });
        setPending(null);
        setImportNote(describeImport(next));
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
  const engineLabel = engine ? ADMIN_ENGINE_LABEL[engine] : "Platform default";
  // The voice key only exists for engines that use a separate voice service
  const visibleSlots: KeySlotName[] = engine === "cartesia" || slots.tts.configured ? ["engine", "tts"] : ["engine"];
  const mayEditKeys = canManage;

  const slotRow = (name: KeySlotName) => {
    const slot = slots[name];
    const label = SLOT_LABEL[name];
    return (
      <li key={name} className="p-3 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-[var(--color-heading)]">{SLOT_TITLE[name]}</h4>
            <div className="text-[11px] text-[var(--color-muted)]">{SLOT_HELP[name]}</div>
            <div className="text-xs font-mono text-[var(--color-muted)] break-all">
              {slot.configured ? <span>{slot.key_hint}</span> : <span>No key saved</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip configured={slot.configured} status={slot.status} />
            {slot.configured && slot.source && <Badge variant="outline">{slot.source === "imported" ? "Imported" : "Own"}</Badge>}
          </div>
        </div>
        {slot.configured && <div className="text-[11px] text-[var(--color-muted)]">Last verified: {formatWhen(slot.last_verified_at)}</div>}

        {mayEditKeys && editing !== name && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} aria-label={`Replace ${label}`} onClick={() => { setEditing(name); setKeyInput(""); }}>
              Replace
            </Button>
            {slot.configured && (
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

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[var(--color-muted)]">Engine</dt>
          <dd className="font-semibold text-[var(--color-heading)]">{engineLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Credentials</dt>
          <dd className="font-semibold text-[var(--color-heading)]">{MODE_LABEL[profile.credential_mode]}{profile.credential_mode === "own" ? " (the organization's own accounts)" : " (billed to you)"}</dd>
        </div>
      </dl>

      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--color-heading)] flex items-center gap-2">
            Engine
            <select
              value={change?.tts_engine ?? engine ?? ""}
              disabled={busy}
              onChange={(e) => e.target.value && e.target.value !== engine && setChange({ tts_engine: e.target.value })}
              className="h-8 px-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-heading)]"
            >
              {!engine && <option value="">Not chosen</option>}
              <option value="aura">Aura</option>
              <option value="cartesia">Cartesia</option>
            </select>
          </label>
          <label className="text-xs text-[var(--color-heading)] flex items-center gap-2">
            Voice plan
            <select
              value={profile.voice_engine ?? "managed"}
              disabled={busy}
              onChange={(e) => e.target.value !== (profile.voice_engine ?? "managed") && setChange({ voice_engine: e.target.value })}
              className="h-8 px-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-heading)]"
            >
              <option value="managed">Standard</option>
              <option value="custom">Economy</option>
            </select>
          </label>
          <label className="text-xs text-[var(--color-heading)] flex items-center gap-2">
            Credential mode
            <select
              value={change?.credential_mode ?? profile.credential_mode}
              disabled={busy}
              onChange={(e) => e.target.value !== profile.credential_mode && setChange({ credential_mode: e.target.value })}
              className="h-8 px-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-heading)]"
            >
              <option value="platform">Platform</option>
              <option value="own">Own</option>
            </select>
          </label>
        </div>
      )}

      {canManage && (
        <ul className="text-[11px] text-[var(--color-muted)] space-y-0.5">
          <li>Standard: managed real-time voice assistant.</li>
          <li>Economy: lower-cost own pipeline, needs a Cartesia voice setup (no Aura voices).</li>
        </ul>
      )}

      {change && (
        <div role="alertdialog" aria-label="Confirm change" className="p-2 rounded border border-[var(--color-border)] space-y-2">
          <p className="text-xs text-[var(--color-heading)]">
            {"voice_engine" in change
              ? `Change the voice plan to ${change.voice_engine === "custom" ? "Economy" : "Standard"}? Every agent and campaign of this organization will use it.`
              : "tts_engine" in change
              ? `Change the voice engine from ${engine ? ADMIN_ENGINE_LABEL[engine] : "Platform default"} to ${ADMIN_ENGINE_LABEL[change.tts_engine as VoiceEngineId]}?`
              : `Change credentials from ${MODE_LABEL[profile.credential_mode]} to ${MODE_LABEL[change.credential_mode as "own" | "platform"]}?`}
            {" "}Switching can affect live agents and calls in progress for this organization.
            {"tts_engine" in change && change.tts_engine === "cartesia" && " This organization will also need a Cartesia voice key before it can take calls."}
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

      {canManage && <LanguageModelSection base={base} profile={profile} busy={busy} run={run} onProfile={setProfile} />}

      {canManage && (
        <div className="space-y-2">
          <div className="text-[11px] text-[var(--color-muted)]">
            Copies the platform's voice keys and language model settings into this organization. Only what is set at the platform is copied, and each organization keeps its own copy.
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => importPlatform(false)}>
            Import from superadmin
          </Button>
          {importNote && <Alert type="info" onDismiss={() => setImportNote(null)}>{importNote}</Alert>}
          {pending?.kind === "overwrite" && (
            <div role="alertdialog" aria-label="Confirm overwrite" className="p-2 rounded border border-[var(--color-border)] space-y-2">
              <p className="text-xs text-[var(--color-heading)]">This replaces the organization's own keys and language model settings</p>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" disabled={busy} onClick={() => importPlatform(true)}>
                  Replace and import
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
