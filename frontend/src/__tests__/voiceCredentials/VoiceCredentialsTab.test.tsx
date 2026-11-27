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
  voice_engine: "managed",
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
    const { container } = render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByText("****abcd")).toBeInTheDocument();
    container.querySelectorAll("input[type=password], input[type=text]").forEach((i) => expect((i as HTMLInputElement).value).toBe(""));
    expect(screen.getAllByText("Own").length).toBeGreaterThan(0);
    expect(screen.getByText("valid")).toBeInTheDocument();
  });

  it("import button shows Imported tag without revealing a key", async () => {
    setup(profile({ tts_engine: "aura", engine: slot(), tts: slot() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
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
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Import from superadmin" }));
    expect(await screen.findByText("This replaces the organization's own key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace key" }));
    await waitFor(() =>
      expect(fetchApi.mock.calls.some((c) => String(c[0]).includes("/import-platform?overwrite=true"))).toBe(true)
    );
  });

  it("replace flips tag to Own and key input is cleared after save", async () => {
    setup(profile({ engine: slot({ key_hint: "****plat", source: "imported", configured: true }), tts: slot() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
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

  it("key input is cleared after a failed save", async () => {
    setup(profile({ engine: slot(), tts: slot() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Replace engine key" }));
    const input = screen.getByLabelText("New engine key") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-secret-fail" } });
    fetchApi.mockImplementation((_u: string, o: any) =>
      o?.method === "PUT" ? Promise.reject(Object.assign(new Error("boom"), { status: 500 })) : Promise.resolve(current));
    fireEvent.click(screen.getByRole("button", { name: "Save engine key" }));
    await waitFor(() => expect(calls("PUT").length).toBe(1));
    await waitFor(() => expect((screen.getByLabelText("New engine key") as HTMLInputElement).value).toBe(""));
    expect(document.body.innerHTML).not.toContain("sk-secret-fail");
  });

  it("clear asks confirmation", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear engine key" }));
    expect(calls("DELETE")).toHaveLength(0);
    expect(screen.getByText(/Clear this key\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear key" }));
    await waitFor(() => expect(calls("DELETE")[0][0]).toBe("/superadmin/voice-profiles/org1/keys/engine"));
  });

  it("has no organization-editing toggle and never calls the organization route", async () => {
    setup(profile({ allow_org_edit: true }));
    const { container } = render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByText("****abcd")).toBeInTheDocument();
    expect(container.querySelectorAll("input[type='checkbox']")).toHaveLength(0);
    expect(screen.queryByText(/org admin can edit keys/i)).not.toBeInTheDocument();
    for (const c of fetchApi.mock.calls) expect(String(c[0])).toMatch(/^\/superadmin\/voice-profiles\/org1/);
  });

  it("shows a Voice plan select with Standard and Economy and a hint for each", async () => {
    setup(profile({ voice_engine: "custom" }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    const sel = (await screen.findByLabelText("Voice plan")) as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["Standard", "Economy"]);
    expect(sel.value).toBe("custom");
    expect(screen.getByText(/managed real-time voice assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/lower-cost own pipeline/i)).toBeInTheDocument();
    expect(document.body.textContent || "").not.toMatch(/deepgram|openai|azure/i);
  });

  it("changing the plan asks for confirmation, cancel sends nothing, confirm saves voice_engine", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    const sel = (await screen.findByLabelText("Voice plan")) as HTMLSelectElement;
    expect(sel.value).toBe("managed");
    fireEvent.change(sel, { target: { value: "custom" } });
    expect(calls("PUT")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel change" }));
    expect(calls("PUT")).toHaveLength(0);
    fireEvent.change(sel, { target: { value: "custom" } });
    current = profile({ voice_engine: "custom" });
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    expect(JSON.parse(calls("PUT")[0][1].body)).toEqual({ voice_engine: "custom" });
    expect(calls("PUT")[0][0]).toBe("/superadmin/voice-profiles/org1");
  });

  it("hides the Voice plan select when the viewer cannot manage", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage={false} />);
    await screen.findByText("****abcd");
    expect(screen.queryByLabelText("Voice plan")).toBeNull();
  });

  it("engine change asks for confirmation and cancel sends no request", async () => {
    setup(profile({ tts_engine: "aura" }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
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
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    fireEvent.change(await screen.findByLabelText("Credential mode"), { target: { value: "platform" } });
    expect(screen.getByRole("alertdialog", { name: "Confirm change" })).toBeInTheDocument();
    expect(calls("PUT")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(JSON.parse(calls("PUT")[0][1].body)).toEqual({ credential_mode: "platform" }));
  });

  it("engine dropdown shows the chosen engine while confirming and the dialog names both engines", async () => {
    setup(profile({ tts_engine: "aura" }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    const select = (await screen.findByLabelText("Engine")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "cartesia" } });
    expect((screen.getByLabelText("Engine") as HTMLSelectElement).value).toBe("cartesia");
    const dialog = screen.getByRole("alertdialog", { name: "Confirm change" });
    expect(dialog.textContent).toMatch(/from Aura to Cartesia/i);
    expect(dialog.textContent).toMatch(/voice key/i);
    fireEvent.click(screen.getByRole("button", { name: "Cancel change" }));
    expect((screen.getByLabelText("Engine") as HTMLSelectElement).value).toBe("aura");
  });

  it("credential mode dialog names both modes", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    fireEvent.change(await screen.findByLabelText("Credential mode"), { target: { value: "platform" } });
    expect(screen.getByRole("alertdialog", { name: "Confirm change" }).textContent).toMatch(/from Own keys to Platform keys/i);
  });

  it("keys have plain names and a one-line explanation", async () => {
    setup(profile({ tts_engine: "cartesia" }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByText("Voice engine key")).toBeInTheDocument();
    expect(screen.getByText("Cartesia voice key")).toBeInTheDocument();
    expect(screen.getByText(/listens to callers and runs the ai agent/i)).toBeInTheDocument();
    expect(screen.getByText(/makes the speaking voice/i)).toBeInTheDocument();
  });
});
