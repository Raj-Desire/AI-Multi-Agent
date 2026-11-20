import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchApi = vi.fn();
vi.mock("../../api-client", () => ({ fetchApi: (...args: any[]) => fetchApi(...args), LIVE: { cache: "no-store" } }));
vi.mock("../../components/SuperAdminVoiceRulesTab", () => ({ SuperAdminVoiceRulesTab: () => null }));
vi.mock("../../components/SuperAdminUsageCostTab", () => ({ SuperAdminUsageCostTab: () => null }));
vi.mock("../../components/SuperAdminTwilioUsageTab", () => ({ SuperAdminTwilioUsageTab: () => null }));
vi.mock("../../components/SuperAdminCreditsTab", () => ({ SuperAdminCreditsTab: () => null }));
vi.mock("../../components/SuperAdminActivityLogTab", () => ({ SuperAdminActivityLogTab: () => null }));

import { Step3VoiceLanguage } from "../../components/agent-creator/Step3VoiceLanguage";
import { SuperAdminPanel } from "../../components/SuperAdminPanel";

const slot = (over: any = {}) => ({ key_hint: "", status: "unverified", source: null, last_verified_at: null, configured: false, ...over });

function voiceRoutes(profile: any) {
  fetchApi.mockImplementation((path: string) => {
    if (path === "/voice-profile") return Promise.resolve(profile);
    return Promise.resolve({});
  });
}

describe("voice picker engine filtering", () => {
  beforeEach(() => {
    fetchApi.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })));
  });

  const agent: any = { voice: { voice: "flux-hannah-en", provider: "deepgram" }, language: "en" };
  const renderPicker = () => render(<Step3VoiceLanguage agentData={agent} setAgentData={() => {}} />);

  it("shows only the org's engine voices for an own-key org and both for a legacy org", async () => {
    voiceRoutes({ configured: true, tts_engine: "cartesia", credential_mode: "own", allow_org_edit: false, engine: slot(), tts: slot() });
    const own = renderPicker();
    await waitFor(() => expect(fetchApi).toHaveBeenCalledWith("/voice-profile", expect.anything()));
    await waitFor(() => expect(screen.getAllByText(/Sonic/i).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /Flux/i })).toBeNull();
    own.unmount();

    voiceRoutes({ configured: false, tts_engine: null, credential_mode: "platform", allow_org_edit: false, engine: slot(), tts: slot() });
    renderPicker();
    await waitFor(() => expect(fetchApi).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("button", { name: /Flux/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Sonic/i })[0]).toBeInTheDocument();
  });
});

describe("create-org form", () => {
  beforeEach(() => {
    fetchApi.mockReset();
    fetchApi.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/superadmin/organizations" && options?.method === "POST") return Promise.resolve({ email: "a@example.com" });
      if (path === "/superadmin/overview") return Promise.resolve({});
      return Promise.resolve([]);
    });
  });

  it("sends tts_engine and import_platform_keys", async () => {
    render(<SuperAdminPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Provision|Create Organization|New Organization/i }));
    fireEvent.change(screen.getByLabelText("Organization Brand Name"), { target: { value: "Acme Co" } });
    fireEvent.change(screen.getByLabelText("Admin Full Name"), { target: { value: "Sarah Jenkins" } });
    fireEvent.change(screen.getByLabelText("Admin Email Address"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("Admin Password"), { target: { value: "Str0ng!Passw0rd#1" } });
    fireEvent.click(screen.getByLabelText("Cartesia"));
    fireEvent.click(screen.getByLabelText("Import from superadmin"));
    fireEvent.click(screen.getByRole("button", { name: "Provision Organization" }));
    await waitFor(() => expect(fetchApi.mock.calls.some((c) => c[1]?.method === "POST")).toBe(true));
    const post = fetchApi.mock.calls.find((c) => c[1]?.method === "POST")!;
    const body = JSON.parse(post[1].body);
    expect(body.tts_engine).toBe("cartesia");
    expect(body.import_platform_keys).toBe(true);
    expect(body.engine_key).toBeUndefined();
  });
});
