import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchApi = vi.fn();
vi.mock("../../api-client", () => ({ fetchApi: (...args: any[]) => fetchApi(...args), LIVE: { cache: "no-store" } }));

import { VoiceCredentialsTab } from "../../components/VoiceCredentialsTab";

const slot = (over: any = {}) => ({ key_hint: "", status: "unverified", source: null, last_verified_at: null, configured: false, ...over });
const llm = (over: any = {}) => ({
  configured: false, endpoint: "", deployment: "", api_version: "2024-08-01-preview",
  key_hint: "", has_key: false, status: "unverified", last_verified_at: null, ...over,
});
const configured = (over: any = {}) =>
  llm({ configured: true, endpoint: "https://a.example", deployment: "dep-a", key_hint: "...1111", has_key: true, ...over });
const profile = (over: any = {}) => ({
  organization_id: "org1",
  configured: true,
  tts_engine: "cartesia",
  credential_mode: "own",
  allow_org_edit: false,
  voice_engine: "managed",
  engine: slot({ key_hint: "****abcd", status: "valid", source: "own", configured: true }),
  tts: slot({ key_hint: "****wxyz", source: "own", configured: true }),
  llm: llm(),
  ...over,
});

let current: any;
function setup(p: any) {
  current = p;
  fetchApi.mockImplementation(() => Promise.resolve(current));
}
const calls = (method: string) => fetchApi.mock.calls.filter((c) => c[1]?.method === method);

describe("VoiceCredentialsTab language model section", () => {
  beforeEach(() => {
    fetchApi.mockReset();
  });

  it("renders the section with a saved state, never prefilled key, and no vendor names", async () => {
    setup(profile({ llm: configured() }));
    const { container } = render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByText("Language model (Economy plan)")).toBeInTheDocument();
    const key = screen.getByLabelText("Language model key") as HTMLInputElement;
    expect(key.type).toBe("password");
    expect(key.value).toBe("");
    expect(screen.getByText(/Key saved/)).toBeInTheDocument();
    expect((screen.getByLabelText("Endpoint") as HTMLInputElement).value).toBe("https://a.example");
    expect((screen.getByLabelText("Deployment name") as HTMLInputElement).value).toBe("dep-a");
    const text = (container.textContent || "").toLowerCase();
    for (const v of ["azure", "openai", "deepgram"]) expect(text).not.toContain(v);
  });

  it("save sends endpoint, deployment, version and omits an empty key", async () => {
    setup(profile({ llm: configured() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    fireEvent.change(await screen.findByLabelText("Deployment name"), { target: { value: "dep-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Save language model" }));
    await waitFor(() => expect(calls("PUT").length).toBe(1));
    const body = JSON.parse(calls("PUT")[0][1].body);
    expect(body).toEqual({ llm_endpoint: "https://a.example", llm_deployment: "dep-b", llm_api_version: "2024-08-01-preview" });
    expect("llm_api_key" in body).toBe(false);
  });

  it("save sends a typed key then clears the input", async () => {
    setup(profile({ llm: llm() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    fireEvent.change(await screen.findByLabelText("Endpoint"), { target: { value: "https://n.example" } });
    fireEvent.change(screen.getByLabelText("Deployment name"), { target: { value: "d" } });
    fireEvent.change(screen.getByLabelText("Language model key"), { target: { value: "secret-new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save language model" }));
    await waitFor(() => expect(calls("PUT").length).toBe(1));
    expect(JSON.parse(calls("PUT")[0][1].body).llm_api_key).toBe("secret-new");
    await waitFor(() => expect((screen.getByLabelText("Language model key") as HTMLInputElement).value).toBe(""));
  });

  it("verify is disabled until configured, then posts and shows success and the time", async () => {
    setup(profile({ llm: llm() }));
    const { unmount } = render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByRole("button", { name: "Verify language model" })).toBeDisabled();
    unmount();
    fetchApi.mockReset();
    setup(profile({ llm: configured() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    const btn = await screen.findByRole("button", { name: "Verify language model" });
    expect(btn).not.toBeDisabled();
    current = profile({
      llm: configured({ status: "valid", last_verified_at: "2026-11-20T10:00:00Z" }),
      llm_check: { ok: true, message: "The language model responded" },
    });
    fireEvent.click(btn);
    expect(await screen.findByText("The language model responded")).toBeInTheDocument();
    expect(calls("POST")[0][0]).toBe("/superadmin/voice-profiles/org1/llm/verify");
    expect(screen.getAllByText(/Last verified:/).length).toBeGreaterThan(1);
  });

  it("verify failure shows the neutral message", async () => {
    setup(profile({ llm: configured() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    const btn = await screen.findByRole("button", { name: "Verify language model" });
    current = profile({ llm: configured({ status: "invalid" }), llm_check: { ok: false, message: "The API key was rejected" } });
    fireEvent.click(btn);
    expect(await screen.findByText("The API key was rejected")).toBeInTheDocument();
  });

  it("warns on Economy when the model is not configured, or not verified, and not when valid", async () => {
    setup(profile({ voice_engine: "custom", llm: llm() }));
    const a = render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByText(/Economy needs these; calls will run Standard until set/)).toBeInTheDocument();
    a.unmount();
    fetchApi.mockReset();
    setup(profile({ voice_engine: "custom", llm: configured({ status: "unverified" }) }));
    const b = render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByText(/not verified yet/i)).toBeInTheDocument();
    b.unmount();
    fetchApi.mockReset();
    setup(profile({ voice_engine: "custom", llm: configured({ status: "valid" }) }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    await screen.findByText("Language model (Economy plan)");
    expect(screen.queryByText(/Economy needs these/)).toBeNull();
    expect(screen.queryByText(/not verified yet/i)).toBeNull();
  });

  it("no warning on the Standard plan", async () => {
    setup(profile({ voice_engine: "managed", llm: llm() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    await screen.findByText("Language model (Economy plan)");
    expect(screen.queryByText(/Economy needs these/)).toBeNull();
  });

  it("clearing asks for confirmation and calls DELETE llm", async () => {
    setup(profile({ llm: configured() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear language model" }));
    expect(calls("DELETE").length).toBe(0);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, clear language model" }));
    await waitFor(() => expect(calls("DELETE")[0][0]).toBe("/superadmin/voice-profiles/org1/llm"));
  });

  it("section is hidden when the viewer cannot manage", async () => {
    setup(profile({ llm: configured() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage={false} />);
    await screen.findByText("****abcd");
    expect(screen.queryByText("Language model (Economy plan)")).toBeNull();
  });
});
