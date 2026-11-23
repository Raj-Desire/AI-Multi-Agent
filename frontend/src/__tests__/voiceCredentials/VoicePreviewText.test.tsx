import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const fetchApi = vi.fn(() => Promise.resolve({}));
vi.mock("../../api-client", () => ({ fetchApi: (...a: any[]) => (fetchApi as any)(...a), LIVE: { cache: "no-store" } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("../../components/agent-creator/ConversationalWorkflowCanvas", () => ({ ConversationalWorkflowCanvas: () => null }));
vi.mock("../../components/agent-creator/PromptVersionHistoryModal", () => ({ PromptVersionHistoryModal: () => null }));
vi.mock("../../components/agent-creator/PromptRegressionTester", () => ({ PromptRegressionTester: () => null }));

import { PREVIEW_TEXTS, previewTextFor, ALL_SONIC_SUPPORTED_LANGUAGES, NATIVE_DEFAULT_GREETINGS } from "../../components/agent-creator/Step3VoiceLanguage";
import { AURA_VOICES, POPULAR_SONIC_VOICES } from "../../components/agent-creator/constants";
import { Step6PromptInstructions } from "../../components/agent-creator/Step6PromptInstructions";

const chars = (s: string) => Array.from(s).length;
const MAX = 40;

describe("voice preview text is short (the vendor bills per character)", () => {
  it("every language the voices can speak has a preview text of at most 40 characters", () => {
    const langs = new Set<string>([
      ...ALL_SONIC_SUPPORTED_LANGUAGES.map((l) => l.lang),
      ...POPULAR_SONIC_VOICES.map((v: any) => v.language),
      ...AURA_VOICES.map((v: any) => v.language),
      ...Object.keys(NATIVE_DEFAULT_GREETINGS),
    ]);
    const missing = [...langs].filter((l) => !PREVIEW_TEXTS[l]);
    expect(missing).toEqual([]);
    for (const [lang, text] of Object.entries(PREVIEW_TEXTS)) {
      expect(text.trim().length, lang).toBeGreaterThan(0);
      expect(chars(text), `${lang}: ${text}`).toBeLessThanOrEqual(MAX);
    }
  });

  it("previewTextFor falls back to the English text for an unknown language", () => {
    expect(previewTextFor("xx")).toBe(PREVIEW_TEXTS.en);
    expect(previewTextFor(undefined)).toBe(PREVIEW_TEXTS.en);
    expect(chars(PREVIEW_TEXTS.en)).toBeLessThanOrEqual(MAX);
  });

  it("agent greetings keep their full wording (only previews are shortened)", () => {
    expect(chars(NATIVE_DEFAULT_GREETINGS.en)).toBeGreaterThan(MAX);
  });
});

describe("Step 6 does not synthesize audio on its own", () => {
  it("changing the greeting or voice requests no sample audio until Play is pressed", async () => {
    const sampleRequests: any[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: any) => {
      if (String(url).includes("sample-speech")) sampleRequests.push(JSON.parse(init.body));
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }));
    const agent: any = {
      agent_id: "a1", organization_id: "org1", name: "Acme Agent", role: "Receptionist", objective: "Help callers",
      greeting: "Hello, thanks for calling Acme Corporation. How can I help you today?",
      system_prompt: "You are helpful.", voice: { voice: "flux-hannah-en", provider: "deepgram", language: "en" }, language: "en",
    };
    const view = render(<Step6PromptInstructions agentData={agent} setAgentData={() => {}} />);
    await new Promise((r) => setTimeout(r, 2200));
    view.rerender(<Step6PromptInstructions agentData={{ ...agent, greeting: "Hi! Welcome to Acme. What can I do for you?" }} setAgentData={() => {}} />);
    await new Promise((r) => setTimeout(r, 2200));
    expect(sampleRequests).toHaveLength(0);
  }, 15000);
});
