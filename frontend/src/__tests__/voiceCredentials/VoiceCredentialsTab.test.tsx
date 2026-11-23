import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchApi = vi.fn();
vi.mock("../../api-client", () => ({ fetchApi: (...args: any[]) => fetchApi(...args), LIVE: { cache: "no-store" } }));

import { VoiceCredentialsTab } from "../../components/VoiceCredentialsTab";

const slot = (over: any = {}) => ({ key_hint: "", status: "unverified", source: null, last_verified_at: null, configured: false, ...over });
const profile = (over: any = {}) => ({
  organization_id: "org1",
  configured: true,
  tts_engine: "cartesia",
  credential_mode: "own",
  allow_org_edit: false,
  engine: slot({ key_hint: "****abcd", status: "valid", source: "own", configured: true, last_verified_at: "2026-11-20T10:00:00Z" }),
  tts: slot({ key_hint: "****wxyz", status: "unverified", source: "own", configured: true }),
  ...over,
});

let current: any;
function setup(p: any) {
  current = p;
  fetchApi.mockImplementation(() => Promise.resolve(current));
}
const calls = (method: string) => fetchApi.mock.calls.filter((c) => c[1]?.method === method);

describe("VoiceCredentialsTab", () => {
  beforeEach(() => {
    fetchApi.mockReset();
  });

  it("renders masked hint and never the key", async () => {
    setup(profile());
    const { container } = render(<VoiceCredentialsTab organizationId="org1" canManage mode="superadmin" />);
    expect(await screen.findByText("****abcd")).toBeInTheDocument();
    container.querySelectorAll("input[type=password], input[type=text]").forEach((i) => expect((i as HTMLInputElement).value).toBe(""));
    expect(screen.getAllByText("Own").length).toBeGreaterThan(0);
    expect(screen.getByText("valid")).toBeInTheDocument();
  });

  it("import button shows Imported tag without revealing a key", async () => {
    setup(profile({ tts_engine: "aura", engine: slot(), tts: slot() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage mode="superadmin" />);
    const btn = await screen.findByRole("button", { name: "Import from superadmin" });
    current = profile({ tts_engine: "aura", engine: slot({ key_hint: "****plat", source: "imported", configured: true }), tts: slot() });
    fireEvent.click(btn);
    expect(await screen.findByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("****plat")).toBeInTheDocument();
    expect(calls("POST")[0][0]).toBe("/superadmin/voice-profiles/org1/import-platform");
  });

  it("import 409 asks to confirm overwrite then retries with overwrite=true", async () => {
    setup(profile());
    fetchApi.mockImplementation((path: string) => {
      if (path.endsWith("/import-platform")) {
        const err: any = new Error("exists");
        err.status = 409;
        return Promise.reject(err);
      }
      return Promise.resolve(current);
    });
    render(<VoiceCredentialsTab organizationId="org1" canManage mode="superadmin" />);
    fireEvent.click(await screen.findByRole("button", { name: "Import from superadmin" }));
    expect(await screen.findByText("This replaces the organization's own key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace key" }));
    await waitFor(() =>
      expect(fetchApi.mock.calls.some((c) => String(c[0]).includes("/import-platform?overwrite=true"))).toBe(true)
    );
  });

  it("replace flips tag to Own and key input is cleared after save", async () => {
    setup(profile({ engine: slot({ key_hint: "****plat", source: "imported", configured: true }), tts: slot() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage mode="superadmin" />);
    expect(await screen.findByText("Imported")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace engine key" }));
    const input = screen.getByLabelText("New engine key") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "sk-secret-123" } });
    current = profile({ engine: slot({ key_hint: "****-123", source: "own", configured: true }), tts: slot() });
    fireEvent.click(screen.getByRole("button", { name: "Save engine key" }));
    await waitFor(() => expect(screen.queryByText("Imported")).not.toBeInTheDocument());
    expect(screen.getAllByText("Own").length).toBeGreaterThan(0);
    const put = calls("PUT")[0];
    expect(put[0]).toBe("/superadmin/voice-profiles/org1");
    expect(JSON.parse(put[1].body)).toEqual({ engine_key: "sk-secret-123" });
    expect(document.body.innerHTML).not.toContain("sk-secret-123");
    expect(screen.queryByLabelText("New engine key")).not.toBeInTheDocument();
  });

  it("clear asks confirmation", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage mode="superadmin" />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear engine key" }));
    expect(calls("DELETE")).toHaveLength(0);
    expect(screen.getByText(/Clear this key\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear key" }));
    await waitFor(() => expect(calls("DELETE")[0][0]).toBe("/superadmin/voice-profiles/org1/keys/engine"));
  });

  it("org admin without permission sees read-only", async () => {
    setup(profile({ allow_org_edit: false }));
    const { container } = render(<VoiceCredentialsTab organizationId="org1" canManage={false} mode="org-admin" />);
    expect(await screen.findByText("****abcd")).toBeInTheDocument();
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Replace/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();
    expect(fetchApi.mock.calls[0][0]).toBe("/voice-profile");
  });

  it("org admin with permission can replace a key via the org endpoint", async () => {
    setup(profile({ allow_org_edit: true }));
    render(<VoiceCredentialsTab organizationId="org1" canManage mode="org-admin" />);
    fireEvent.click(await screen.findByRole("button", { name: "Replace engine key" }));
    fireEvent.change(screen.getByLabelText("New engine key"), { target: { value: "k1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save engine key" }));
    await waitFor(() => expect(calls("PUT")[0][0]).toBe("/voice-profile"));
  });

  it("no org-facing text contains the vendor names", async () => {
    setup(profile({ allow_org_edit: true }));
    const { container } = render(<VoiceCredentialsTab organizationId="org1" canManage mode="org-admin" />);
    await screen.findByText("****abcd");
    const text = container.textContent || "";
    expect(text).toContain("Sonic Voice");
    for (const bad of ["Deepgram", "Cartesia", "Desire"]) expect(text).not.toContain(bad);
  });

  it("engine change asks for confirmation and cancel sends no request", async () => {
    setup(profile({ tts_engine: "aura" }));
    render(<VoiceCredentialsTab organizationId="org1" canManage mode="superadmin" />);
    fireEvent.change(await screen.findByLabelText("Engine"), { target: { value: "cartesia" } });
    expect(screen.getByRole("alertdialog", { name: "Confirm change" })).toBeInTheDocument();
    expect(screen.getByText(/live agents/i)).toBeInTheDocument();
    expect(calls("PUT")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel change" }));
    expect(calls("PUT")).toHaveLength(0);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Engine"), { target: { value: "cartesia" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(JSON.parse(calls("PUT")[0][1].body)).toEqual({ tts_engine: "cartesia" }));
  });

  it("credential mode change asks for confirmation", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage mode="superadmin" />);
    fireEvent.change(await screen.findByLabelText("Credential mode"), { target: { value: "platform" } });
    expect(screen.getByRole("alertdialog", { name: "Confirm change" })).toBeInTheDocument();
    expect(calls("PUT")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(JSON.parse(calls("PUT")[0][1].body)).toEqual({ credential_mode: "platform" }));
  });
});
