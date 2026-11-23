import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Every request to the sample endpoint is real text-to-speech that the voice vendor bills by characters,
// so nothing may call it except an explicit "Preview Voice" click.
const fetchApi = vi.fn();
vi.mock("../../api-client", () => ({ fetchApi: (...a: any[]) => fetchApi(...a), LIVE: { cache: "no-store" } }));

import { Step3VoiceLanguage } from "../../components/agent-creator/Step3VoiceLanguage";

const SAMPLE = "Hello! I am your AI voice assistant powered by Sonic. How can I help you today?";
const voices = Array.from({ length: 6 }, (_, i) => ({
  id: `0000000${i}-aaaa-bbbb-cccc-dddddddddddd`, name: `Voice ${i}`, language: "en", gender: "Female",
  style: "Warm", description: "d", sampleText: SAMPLE, engine: "sonic",
}));

let sampleRequests: any[] = [];

function setup(profile: any, agent: any) {
  sampleRequests = [];
  fetchApi.mockReset();
  fetchApi.mockImplementation((p: string) => (String(p).startsWith("/voice-profile") ? Promise.resolve(profile) : Promise.resolve({})));
  vi.stubGlobal("fetch", vi.fn((url: string, init?: any) => {
    const u = String(url);
    if (u.includes("cartesia-voices")) return Promise.resolve({ ok: true, json: async () => ({ data: voices }) });
    if (u.includes("sample-speech")) {
      sampleRequests.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, blob: async () => new Blob(["audio"]) });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  }));
  (URL as any).createObjectURL = () => "blob:preview";
  vi.stubGlobal("Audio", class { playbackRate = 1; onended: any; onerror: any; play() { return Promise.resolve(); } pause() {} });
  const setAgentData = vi.fn();
  return { setAgentData, ...render(<Step3VoiceLanguage agentData={agent} setAgentData={setAgentData} />) };
}

const ownCartesia = { configured: true, tts_engine: "cartesia", credential_mode: "own", allow_org_edit: false };
const legacy = { configured: false, tts_engine: null, credential_mode: "platform", allow_org_edit: false };
const newAgent = () => ({ agent_id: "", voice: { voice: "flux-hannah-en", provider: "deepgram" }, language: "en" });
const sonicAgent = () => ({ agent_id: "a1", voice: { voice: voices[0].id, provider: "cartesia", model: "sonic-3.6" }, language: "en" });

describe("voice previews only cost credits when the user asks to hear one", () => {
  beforeEach(() => { sampleRequests = []; });

  it("opening the voice step requests no synthesis (new agent in an own-key Cartesia org)", async () => {
    setup(ownCartesia, newAgent());
    await waitFor(() => expect(fetchApi).toHaveBeenCalledWith("/voice-profile", expect.anything()));
    await new Promise((r) => setTimeout(r, 300));
    expect(sampleRequests).toHaveLength(0);
  });

  it("opening the voice step requests no synthesis (legacy org, saved Sonic agent)", async () => {
    setup(legacy, sonicAgent());
    await new Promise((r) => setTimeout(r, 300));
    expect(sampleRequests).toHaveLength(0);
  });

  async function openList() {
    await waitFor(() => expect(screen.getAllByText(/Voice 0/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button").find((b) => /Voice 0/.test(b.textContent || ""))!);
    return screen.findAllByText(/Cillian|Bronwen|Declan|Maren|Skylar|Daniel/);
  }
  const hoverWithAncestors = (el: Element) => {
    let node: Element | null = el;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) fireEvent.mouseEnter(node);
  };

  it("opening the voice list and moving over every row requests no synthesis", async () => {
    setup(legacy, sonicAgent());
    const rows = await openList();
    expect(rows.length).toBeGreaterThan(2);
    rows.forEach(hoverWithAncestors);
    await new Promise((r) => setTimeout(r, 200));
    expect(sampleRequests).toHaveLength(0);
  });

  it("picking a voice requests no synthesis", async () => {
    setup(legacy, sonicAgent());
    const rows = await openList();
    fireEvent.click(rows[0]);
    await new Promise((r) => setTimeout(r, 200));
    expect(sampleRequests).toHaveLength(0);
  });

  it("switching language requests no synthesis", async () => {
    setup(legacy, sonicAgent());
    await waitFor(() => expect(screen.getAllByText(/Voice 0/).length).toBeGreaterThan(0));
    const hi = screen.queryAllByText(/Hindi/i)[0];
    if (hi) fireEvent.click(hi);
    await new Promise((r) => setTimeout(r, 200));
    expect(sampleRequests).toHaveLength(0);
  });

  it("pressing Preview Voice requests exactly one synthesis, and a second press of the same voice reuses it", async () => {
    setup(legacy, sonicAgent());
    const preview = await screen.findByRole("button", { name: /Preview Voice/i });
    fireEvent.click(preview);
    await waitFor(() => expect(sampleRequests).toHaveLength(1));
    expect(Array.from(sampleRequests[0].text as string).length).toBeLessThanOrEqual(40);
    fireEvent.click(await screen.findByRole("button", { name: /Stop Preview|Preview Voice/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Preview Voice/i }));
    await new Promise((r) => setTimeout(r, 200));
    expect(sampleRequests).toHaveLength(1);
  });
});
