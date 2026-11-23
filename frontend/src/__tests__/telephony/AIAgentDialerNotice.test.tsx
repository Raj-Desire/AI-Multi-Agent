import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const fetchApi = vi.fn();
vi.mock("../../api-client", () => ({ fetchApi: (...a: any[]) => fetchApi(...a), LIVE: { cache: "no-store" } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", organization_id: "org1", role: "admin" } }) }));

import { AIAgentDialerView } from "../../components/AIAgentDialerView";

const agents = { my_agents: [{ agent_id: "agt_1", name: "Receptionist", status: "ACTIVE" }], default_agents: [] };

function routes(numbers: any[], twilio: any = null) {
  fetchApi.mockImplementation((p: string) => {
    const path = String(p ?? "");
    if (path.startsWith("/twilio/configuration")) return Promise.resolve(twilio);
    if (path.startsWith("/telephony/numbers")) return Promise.resolve(numbers);
    if (path.startsWith("/agents/available")) return Promise.resolve(agents);
    return Promise.resolve([]);
  });
}

const renderDialer = () =>
  render(
    <MemoryRouter>
      <AIAgentDialerView onNavigateSettings={() => {}} onNavigateAgents={() => {}} />
    </MemoryRouter>
  );

describe("AI dialer phone number notice", () => {
  beforeEach(() => fetchApi.mockReset());

  it("an organization with a Plivo number and no Twilio setup sees no notice and can place a call", async () => {
    routes([{ number: "+911800555001", provider: "plivo" }]);
    renderDialer();
    await waitFor(() => expect(fetchApi).toHaveBeenCalledWith("/telephony/numbers"));
    await screen.findByDisplayValue("+911800555001");
    expect(screen.queryByText(/connection required/i)).toBeNull();
    expect(screen.queryByText(/no phone number is set up/i)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("+1 (555) 000-0000"), { target: { value: "+919999999999" } });
    const start = await screen.findByRole("button", { name: /Start AI Call/i });
    await waitFor(() => expect(start).not.toBeDisabled());
  });

  it("an organization with no number anywhere sees a neutral notice that names no provider", async () => {
    routes([]);
    renderDialer();
    const notice = await screen.findByText(/no phone number is set up/i);
    const text = notice.closest("[role]")?.textContent || document.body.textContent || "";
    expect(text).not.toMatch(/twilio|plivo/i);
    expect(screen.getByRole("button", { name: /set up phone number/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/twilio|plivo/i);
  });

  it("does not flash the notice while the numbers are still loading", async () => {
    let release: (v: any) => void = () => {};
    fetchApi.mockImplementation((p: string) => {
      const path = String(p ?? "");
      if (path.startsWith("/telephony/numbers")) return new Promise((r) => { release = r; });
      if (path.startsWith("/twilio/configuration")) return Promise.resolve(null);
      if (path.startsWith("/agents/available")) return Promise.resolve(agents);
      return Promise.resolve([]);
    });
    renderDialer();
    await waitFor(() => expect(fetchApi).toHaveBeenCalledWith("/agents/available"));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/no phone number is set up/i)).toBeNull();
    release([{ number: "+911800555002", provider: "plivo" }]);
    await screen.findByDisplayValue("+911800555002");
    expect(screen.queryByText(/no phone number is set up/i)).toBeNull();
  });
});
