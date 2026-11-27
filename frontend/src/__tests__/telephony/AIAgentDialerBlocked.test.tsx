import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const fetchApi = vi.fn();
vi.mock("../../api-client", () => ({ fetchApi: (...a: any[]) => fetchApi(...a), LIVE: { cache: "no-store" } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", organization_id: "org1", role: "admin" } }) }));

import { AIAgentDialerView } from "../../components/AIAgentDialerView";

const BLOCKED = "Voice plan setup incomplete for this organization. Ask your administrator to finish the model setup.";
const agents = { my_agents: [{ agent_id: "agt_1", name: "Receptionist", status: "ACTIVE" }], default_agents: [] };

describe("AI dialer when the voice plan setup is incomplete", () => {
  beforeEach(() => fetchApi.mockReset());

  it("shows the API's neutral error text and no vendor name", async () => {
    fetchApi.mockImplementation((p: string) => {
      const path = String(p ?? "");
      if (path.startsWith("/voice/test-call")) return Promise.reject(new Error(BLOCKED));
      if (path.startsWith("/telephony/numbers")) return Promise.resolve([{ number: "+911800555001", provider: "plivo" }]);
      if (path.startsWith("/twilio/configuration")) return Promise.resolve(null);
      if (path.startsWith("/agents/available")) return Promise.resolve(agents);
      return Promise.resolve([]);
    });
    render(
      <MemoryRouter>
        <AIAgentDialerView onNavigateSettings={() => {}} onNavigateAgents={() => {}} />
      </MemoryRouter>
    );
    await screen.findByDisplayValue("+911800555001");
    fireEvent.change(screen.getByPlaceholderText("+1 (555) 000-0000"), { target: { value: "+919999999999" } });
    const start = await screen.findByRole("button", { name: /Start AI Call/i });
    await waitFor(() => expect(start).not.toBeDisabled());
    fireEvent.click(start);
    const msg = await screen.findByText(/Voice plan setup incomplete/i);
    expect(msg.textContent).toContain(BLOCKED);
    expect(document.body.textContent).not.toMatch(/deepgram|azure|openai|cartesia|twilio|plivo/i);
  });
});
