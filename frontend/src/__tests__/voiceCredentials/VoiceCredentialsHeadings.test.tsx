import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const fetchApi = vi.fn();
vi.mock("../../api-client", () => ({ fetchApi: (...args: any[]) => fetchApi(...args), LIVE: { cache: "no-store" } }));

import { VoiceCredentialsTab } from "../../components/VoiceCredentialsTab";

const slot = (over: any = {}) => ({ key_hint: "", status: "unverified", source: null, last_verified_at: null, configured: false, ...over });
const llm = (over: any = {}) => ({
  configured: false, endpoint: "", deployment: "", api_version: "", key_hint: "", has_key: false,
  status: "unverified", last_verified_at: null, ...over,
});
const profile = (over: any = {}) => ({
  organization_id: "org1", configured: true, tts_engine: "cartesia", credential_mode: "own", allow_org_edit: false,
  voice_engine: "managed",
  engine: slot({ key_hint: "****abcd", status: "valid", source: "own", configured: true }),
  tts: slot({ key_hint: "****wxyz", status: "unverified", source: "own", configured: true }),
  llm: llm(),
  ...over,
});

let current: any;
function setup(p: any) {
  current = p;
  fetchApi.mockImplementation(() => Promise.resolve(current));
}

describe("VoiceCredentialsTab headings and status chips", () => {
  beforeEach(() => fetchApi.mockReset());

  it("each credential section has a heading naming what the key is for", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByRole("heading", { name: "Voice agent (listening and conversation engine)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Voice (speech) key: Cartesia" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Language model (Economy plan)" })).toBeInTheDocument();
  });

  it("every section shows one status chip: Not set, Saved or Verified", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    await screen.findByText("Verified"); // engine key valid
    expect(screen.getByText("Saved")).toBeInTheDocument(); // voice key unverified
    expect(screen.getByText("Not set")).toBeInTheDocument(); // language model empty
  });

  it("language model chip follows its status", async () => {
    setup(profile({ llm: llm({ configured: true, has_key: true, endpoint: "https://x", deployment: "d", status: "valid" }) }));
    const { container } = render(<VoiceCredentialsTab organizationId="org1" canManage />);
    await screen.findByRole("heading", { name: "Language model (Economy plan)" });
    const section = container.querySelector("section[aria-label='Language model']") as HTMLElement;
    expect(within(section).getByText("Verified")).toBeInTheDocument();
  });

  it("shows no Deepgram wording anywhere", async () => {
    setup(profile());
    const { container } = render(<VoiceCredentialsTab organizationId="org1" canManage />);
    await screen.findByText("Voice (speech) key: Cartesia");
    expect(container.textContent!.toLowerCase()).not.toContain("deepgram");
  });
});

describe("Import from superadmin reports what was imported", () => {
  beforeEach(() => fetchApi.mockReset());

  it("states that language model settings are included and names the sections imported", async () => {
    setup(profile({ engine: slot(), tts: slot() }));
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    expect(await screen.findByText(/language model settings into this organization/i)).toBeInTheDocument();
    current = profile({
      llm: llm({ configured: true, has_key: true, endpoint: "https://x", deployment: "d", key_hint: "...1234" }),
      import_report: { imported: ["engine_key", "llm"], llm_message: null },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import from superadmin" }));
    expect(await screen.findByText(/Imported: voice agent key, language model settings\./)).toBeInTheDocument();
  });

  it("reports neutrally when the platform has no language model settings", async () => {
    setup(profile());
    render(<VoiceCredentialsTab organizationId="org1" canManage />);
    const btn = await screen.findByRole("button", { name: "Import from superadmin" });
    current = profile({
      import_report: { imported: ["engine_key"], llm_message: "The language model is not configured for the platform; nothing was imported for it." },
    });
    fireEvent.click(btn);
    expect(await screen.findByText(/language model is not configured for the platform/i)).toBeInTheDocument();
    expect(screen.queryByText(/deepgram|azure/i)).toBeNull();
  });
});
