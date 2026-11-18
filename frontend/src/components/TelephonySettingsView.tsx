import React, { useEffect, useState } from "react";
import { fetchApi, LIVE } from "../api-client";
import { MARKET_LABELS, TelephonyMarket, TelephonyProvider } from "../types";
import { useAuth } from "../context/AuthContext";
import { Alert } from "./ui/Alert";
import { TwilioSettingsView } from "./TwilioSettingsView";
import { PlivoSettingsForm } from "./PlivoSettingsForm";

type ProviderSetting = { provider: TelephonyProvider; market: TelephonyMarket };

/**
 * Phone & Voice settings. The market decides which telephony network carries the organization's calls:
 * Domestic (customers in India) or International. A platform operator (super admin) can also choose "Both" to use
 * numbers from either network and pick one per call. Switching only changes the active market; the other network's
 * saved settings are kept.
 */
export function TelephonySettingsView() {
  const { isSuperAdmin } = useAuth();
  const [setting, setSetting] = useState<ProviderSetting>({ provider: "twilio", market: "international" });
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApi<ProviderSetting>("/telephony/provider", LIVE)
      .then((res) => {
        if (!cancelled && res?.provider) setSetting({ provider: res.provider, market: res.market || (res.provider === "plivo" ? "domestic" : "international") });
      })
      .catch(() => {
        /* keep the default (International) when the setting cannot be read */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChange(next: TelephonyMarket) {
    if (next === setting.market) return;
    setError(null);
    setSwitching(true);
    try {
      const res = await fetchApi<ProviderSetting>("/telephony/provider", {
        method: "PUT",
        body: JSON.stringify({ market: next }),
      });
      setSetting({ provider: res.provider, market: res.market || next });
    } catch (e: any) {
      setError(e.message || "Could not change the market.");
    } finally {
      setSwitching(false);
    }
  }

  const markets: TelephonyMarket[] = isSuperAdmin ? ["domestic", "international", "both"] : ["domestic", "international"];
  const showDomestic = setting.market === "domestic" || setting.market === "both";
  const showInternational = setting.market === "international" || setting.market === "both";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)]">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-heading)]">Market</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Domestic organizations call through the domestic network; international organizations through the international one.
            Settings for the other network are kept.
          </p>
        </div>
        <select
          aria-label="Market"
          value={setting.market}
          disabled={switching}
          onChange={(e) => handleChange(e.target.value as TelephonyMarket)}
          className="h-9 px-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
        >
          {markets.map((m) => (
            <option key={m} value={m}>
              {MARKET_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <Alert type="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {showDomestic && (
        <section aria-label="Domestic network settings" className="space-y-3">
          {setting.market === "both" && <h3 className="text-sm font-semibold text-[var(--color-heading)]">Domestic network</h3>}
          <PlivoSettingsForm />
        </section>
      )}
      {showInternational && (
        <section aria-label="International network settings" className="space-y-3">
          {setting.market === "both" && <h3 className="text-sm font-semibold text-[var(--color-heading)]">International network</h3>}
          <TwilioSettingsView />
        </section>
      )}
    </div>
  );
}
