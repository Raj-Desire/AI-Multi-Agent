import React, { useEffect, useState } from "react";
import { fetchApi, LIVE } from "../api-client";
import { MARKET_LABELS, TelephonyMarket, TelephonyProvider } from "../types";
import { useAuth } from "../context/AuthContext";
import { Alert } from "./ui/Alert";
import { LoadingState } from "./ui/LoadingState";
import { TwilioSettingsView } from "./TwilioSettingsView";
import { PlivoSettingsForm } from "./PlivoSettingsForm";

type ProviderSetting = { provider: TelephonyProvider; market: TelephonyMarket };

/**
 * Phone & Voice settings.
 *
 * An organization's market (Domestic or International) is fixed when the organization is created, so an organization
 * admin simply lands on the settings for their own market, with nothing to choose. A platform operator (super admin)
 * can switch the market, including "Both" to use numbers from either network. Switching never deletes the other
 * network's saved settings.
 */
export function TelephonySettingsView() {
  const { isSuperAdmin } = useAuth();
  const [setting, setSetting] = useState<ProviderSetting | null>(null);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApi<ProviderSetting>("/telephony/provider", LIVE)
      .then((res) => {
        if (cancelled) return;
        const provider = res?.provider || "twilio";
        setSetting({ provider, market: res?.market || (provider === "plivo" ? "domestic" : "international") });
      })
      .catch(() => {
        // Settings cannot be read: fall back to International (the platform default) rather than showing nothing
        if (!cancelled) setSetting({ provider: "twilio", market: "international" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChange(next: TelephonyMarket) {
    if (!setting || next === setting.market) return;
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

  // Do not draw either form until the organization's market is known, so the wrong one never flashes up.
  if (!setting) {
    return (
      <div className="py-16">
        <LoadingState message="Loading phone settings..." subMessage="Checking your organization's market" size="lg" />
      </div>
    );
  }

  const markets: TelephonyMarket[] = ["domestic", "international", "both"];
  const showDomestic = setting.market === "domestic" || setting.market === "both";
  const showInternational = setting.market === "international" || setting.market === "both";

  return (
    <div className="space-y-6">
      {isSuperAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] border border-[var(--color-border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-heading)]">Market</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Domestic uses the domestic network, International the international one, and Both lets you pick a number from either for each call.
              Settings you saved for the other network are kept.
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
      )}

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
