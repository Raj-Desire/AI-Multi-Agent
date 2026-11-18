import React, { useEffect, useState } from "react";
import { fetchApi, LIVE } from "../api-client";
import { TelephonyProvider } from "../types";
import { Alert } from "./ui/Alert";
import { TwilioSettingsView } from "./TwilioSettingsView";
import { PlivoSettingsForm } from "./PlivoSettingsForm";

const PROVIDERS: { value: TelephonyProvider; label: string }[] = [
  { value: "twilio", label: "Twilio" },
  { value: "plivo", label: "Plivo" },
];

/**
 * Phone & Voice settings: pick which telephony provider carries this organization's calls, then edit that provider's
 * credentials. Switching only changes the active provider; the other provider's saved settings are kept.
 */
export function TelephonySettingsView() {
  const [provider, setProvider] = useState<TelephonyProvider>("twilio");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApi<{ provider: TelephonyProvider }>("/telephony/provider", LIVE)
      .then((res) => {
        if (!cancelled && res?.provider) setProvider(res.provider);
      })
      .catch(() => {
        /* keep the default (Twilio) when the setting cannot be read */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChange(next: TelephonyProvider) {
    if (next === provider) return;
    setError(null);
    setSwitching(true);
    try {
      const res = await fetchApi<{ provider: TelephonyProvider }>("/telephony/provider", {
        method: "PUT",
        body: JSON.stringify({ provider: next }),
      });
      setProvider(res?.provider || next);
    } catch (e: any) {
      setError(e.message || "Could not change the telephony provider.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)]">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-heading)]">Telephony provider</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Choose which provider places and receives this organization's calls. Settings for the other provider are kept.
          </p>
        </div>
        <select
          aria-label="Telephony provider"
          value={provider}
          disabled={switching}
          onChange={(e) => handleChange(e.target.value as TelephonyProvider)}
          className="h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <Alert type="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {provider === "plivo" ? <PlivoSettingsForm /> : <TwilioSettingsView />}
    </div>
  );
}
