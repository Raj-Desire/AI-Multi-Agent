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

describe("voice engine selector is gone (the plan is an organisation setting)", () => {
  beforeEach(() => {
    fetchApi.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })));
  });

  it.each([
    ["a super admin", { isSuperAdmin: true }],
    ["an org admin", { isSuperAdmin: false }],
    ["a plain user", {}],
  ])("is absent for %s, for Cartesia and Aura agents alike", async (_n, props: any) => {
    routes({ "/voice-profile": profile(true) });
    for (const agent of [cartesiaAgent({ voice_engine: "custom" }), auraAgent()]) {
      const setAgentData = vi.fn();
      const { container, unmount } = render(<Step3VoiceLanguage agentData={agent} setAgentData={setAgentData} {...props} />);
      await waitFor(() => expect(fetchApi).toHaveBeenCalled());
      expect(screen.queryByLabelText("Voice engine")).toBeNull();
      expect(container.querySelector("[data-testid='voice-engine-section']")).toBeNull();
      expect(screen.queryByText("Economy")).toBeNull();
      expect(screen.queryByText("Not enabled for your organization")).toBeNull();
      expect(screen.queryByText("Not available for this voice")).toBeNull();
      expect(setAgentData).not.toHaveBeenCalled();
      unmount();
    }
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
