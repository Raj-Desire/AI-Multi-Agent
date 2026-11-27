import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchApi = vi.fn();
vi.mock("../../api-client", () => ({ fetchApi: (...args: any[]) => fetchApi(...args), LIVE: { cache: "no-store" } }));

import { Step3VoiceLanguage } from "../../components/agent-creator/Step3VoiceLanguage";
import { VoiceEngineBadge } from "../../components/ui/VoiceEngineBadge";

const slot = () => ({ key_hint: "", status: "unverified", source: null, last_verified_at: null, configured: false });
const profile = (allowed: boolean) => ({ configured: false, tts_engine: null, credential_mode: "platform", allow_org_edit: false, engine: slot(), tts: slot(), custom_pipeline_allowed: allowed });
const CARTESIA = "6c756032-11c3-4be8-a120-74f9673fb700";
const cartesiaAgent = (extra: any = {}): any => ({ agent_id: "a1", organization_id: "org1", voice: { voice: CARTESIA, provider: "cartesia" }, language: "en", ...extra });
const auraAgent = (extra: any = {}): any => ({ agent_id: "a1", organization_id: "org1", voice: { voice: "flux-hannah-en", provider: "deepgram" }, language: "en", ...extra });

function routes(map: Record<string, any>) {
  fetchApi.mockImplementation((path: string) => (path in map ? (map[path] instanceof Error ? Promise.reject(map[path]) : Promise.resolve(map[path])) : Promise.resolve({})));
}
const select = () => screen.findByLabelText("Voice engine") as Promise<HTMLSelectElement>;
const economy = (s: HTMLSelectElement) => Array.from(s.options).find((o) => o.textContent === "Economy")!;

describe("voice engine selector", () => {
  beforeEach(() => {
    fetchApi.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })));
  });

  it("renders Standard and Economy, defaulting to Standard", async () => {
    routes({ "/voice-profile": profile(true) });
    render(<Step3VoiceLanguage agentData={cartesiaAgent()} setAgentData={() => {}} />);
    const s = await select();
    expect(Array.from(s.options).map((o) => o.textContent)).toEqual(["Standard", "Economy"]);
    expect(s.value).toBe("managed");
  });

  it("disables Economy with the org hint when the flag is false", async () => {
    routes({ "/voice-profile": profile(false) });
    render(<Step3VoiceLanguage agentData={cartesiaAgent()} setAgentData={() => {}} />);
    const s = await select();
    await screen.findByText("Not enabled for your organization");
    expect(economy(s).disabled).toBe(true);
  });

  it("treats a failed request as not allowed", async () => {
    routes({ "/voice-profile": new Error("boom") });
    render(<Step3VoiceLanguage agentData={cartesiaAgent()} setAgentData={() => {}} />);
    const s = await select();
    await screen.findByText("Not enabled for your organization");
    expect(economy(s).disabled).toBe(true);
  });

  it("treats a pending request as not allowed", async () => {
    fetchApi.mockImplementation(() => new Promise(() => {}));
    render(<Step3VoiceLanguage agentData={cartesiaAgent()} setAgentData={() => {}} />);
    const s = await select();
    expect(economy(s).disabled).toBe(true);
  });

  it("enables Economy for an allowed org with a Cartesia voice and saves custom", async () => {
    routes({ "/voice-profile": profile(true) });
    let latest = cartesiaAgent();
    const setAgentData = vi.fn((u: any) => { latest = typeof u === "function" ? u(latest) : u; });
    render(<Step3VoiceLanguage agentData={latest} setAgentData={setAgentData} />);
    const s = await select();
    await waitFor(() => expect(economy(s).disabled).toBe(false));
    expect(screen.queryByText("Not enabled for your organization")).toBeNull();
    fireEvent.change(s, { target: { value: "custom" } });
    expect(latest.voice_engine).toBe("custom");
  });

  it("disables Economy for a non-Cartesia voice even when the org is allowed", async () => {
    routes({ "/voice-profile": profile(true) });
    render(<Step3VoiceLanguage agentData={auraAgent()} setAgentData={() => {}} />);
    const s = await select();
    await screen.findByText("Not available for this voice");
    expect(economy(s).disabled).toBe(true);
  });

  it("keeps a stored custom value selected but disabled when no longer allowed, without rewriting it", async () => {
    routes({ "/voice-profile": profile(false) });
    const setAgentData = vi.fn();
    render(<Step3VoiceLanguage agentData={cartesiaAgent({ voice_engine: "custom" })} setAgentData={setAgentData} />);
    const s = await select();
    await screen.findByText("Not enabled for your organization");
    expect(s.value).toBe("custom");
    expect(economy(s).disabled).toBe(true);
    expect(setAgentData).not.toHaveBeenCalled();
  });

  it("super admin on another organization's agent reads that organization's flag", async () => {
    routes({ "/superadmin/voice-profiles/org2": { custom_pipeline_enabled: true }, "/voice-profile": profile(false) });
    render(<Step3VoiceLanguage agentData={cartesiaAgent({ organization_id: "org2" })} setAgentData={() => {}} isSuperAdmin viewerOrganizationId="org1" />);
    const s = await select();
    await waitFor(() => expect(economy(s).disabled).toBe(false));
    expect(fetchApi).toHaveBeenCalledWith("/superadmin/voice-profiles/org2", expect.anything());
    expect(fetchApi).not.toHaveBeenCalledWith("/voice-profile", expect.anything());
  });

  it("super admin on their own organization's agent uses /voice-profile", async () => {
    routes({ "/voice-profile": profile(true) });
    render(<Step3VoiceLanguage agentData={cartesiaAgent()} setAgentData={() => {}} isSuperAdmin viewerOrganizationId="org1" />);
    const s = await select();
    await waitFor(() => expect(economy(s).disabled).toBe(false));
    expect(fetchApi).not.toHaveBeenCalledWith("/superadmin/voice-profiles/org1", expect.anything());
  });

  it("never shows vendor names in the new UI", async () => {
    routes({ "/voice-profile": profile(false) });
    const { container } = render(<Step3VoiceLanguage agentData={auraAgent({ voice_engine: "custom" })} setAgentData={() => {}} />);
    const s = await select();
    const region = (s.closest("[data-testid='voice-engine-section']") as HTMLElement).textContent || "";
    expect(region).not.toMatch(/deepgram|cartesia|openai|azure/i);
    expect(container).toBeTruthy();
  });
});

describe("VoiceEngineBadge", () => {
  it("shows Standard and Economy from the call record", () => {
    const { rerender } = render(<VoiceEngineBadge engine="managed" />);
    expect(screen.getByText("Standard")).toBeInTheDocument();
    rerender(<VoiceEngineBadge engine="custom" />);
    expect(screen.getByText("Economy")).toBeInTheDocument();
  });
  it("shows nothing when absent or unknown", () => {
    const { container, rerender } = render(<VoiceEngineBadge engine={null} />);
    expect(container.textContent).toBe("");
    rerender(<VoiceEngineBadge engine={undefined} />);
    expect(container.textContent).toBe("");
    rerender(<VoiceEngineBadge engine="something" />);
    expect(container.textContent).toBe("");
  });
});
