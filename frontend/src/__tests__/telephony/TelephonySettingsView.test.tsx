import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchApi = vi.fn();
let superAdmin = false;
vi.mock("../../api-client", () => ({ fetchApi: (...args: any[]) => fetchApi(...args), LIVE: { cache: "no-store" } }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { organization_id: "org1" }, isSuperAdmin: superAdmin }),
}));
vi.mock("../../components/TwilioSettingsView", () => ({
  TwilioSettingsView: () => <div data-testid="twilio-form">Twilio form</div>,
}));

import { TelephonySettingsView } from "../../components/TelephonySettingsView";

function routes(provider: string, market: string, plivoConfig: any = null) {
  fetchApi.mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/telephony/provider" && (!options || !options.method || options.method === "GET")) {
      return Promise.resolve({ provider, market });
    }
    if (path === "/plivo/configuration") return Promise.resolve(plivoConfig);
    if (path === "/agents/available") return Promise.resolve({ my_agents: [], default_agents: [] });
    return Promise.resolve({ provider, market });
  });
}

describe("TelephonySettingsView", () => {
  beforeEach(() => {
    fetchApi.mockReset();
    superAdmin = false;
  });

  it("an international organization admin lands on the international settings with nothing to choose", async () => {
    routes("twilio", "international");
    render(<TelephonySettingsView />);
    expect(await screen.findByTestId("twilio-form")).toBeInTheDocument();
    expect(screen.queryByLabelText("Market")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Auth ID")).not.toBeInTheDocument();
  });

  it("a domestic organization admin lands on the domestic settings with nothing to choose", async () => {
    routes("plivo", "domestic");
    render(<TelephonySettingsView />);
    expect(await screen.findByLabelText("Auth ID")).toBeInTheDocument();
    expect(screen.queryByLabelText("Market")).not.toBeInTheDocument();
    expect(screen.queryByTestId("twilio-form")).not.toBeInTheDocument();
    expect(screen.getByText("Not set up yet")).toBeInTheDocument();
  });

  it("never flashes the wrong form while the market is still loading", async () => {
    let resolve: (v: any) => void = () => {};
    fetchApi.mockImplementation((path: string) => {
      if (path === "/telephony/provider") return new Promise((r) => (resolve = r));
      if (path === "/plivo/configuration") return Promise.resolve(null);
      return Promise.resolve({ my_agents: [], default_agents: [] });
    });
    render(<TelephonySettingsView />);
    expect(screen.queryByTestId("twilio-form")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Auth ID")).not.toBeInTheDocument();
    resolve({ provider: "plivo", market: "domestic" });
    expect(await screen.findByLabelText("Auth ID")).toBeInTheDocument();
    expect(screen.queryByTestId("twilio-form")).not.toBeInTheDocument();
  });

  it("a super admin can switch to Domestic before any credentials exist, and gets the form to fill in", async () => {
    superAdmin = true;
    routes("twilio", "international");
    render(<TelephonySettingsView />);
    await screen.findByTestId("twilio-form");
    routes("plivo", "domestic");
    fireEvent.change(screen.getByLabelText("Market"), { target: { value: "domestic" } });
    await waitFor(() => expect(screen.getByLabelText("Auth ID")).toBeInTheDocument());
    const put = fetchApi.mock.calls.find((c) => c[0] === "/telephony/provider" && c[1]?.method === "PUT");
    expect(JSON.parse(put![1].body)).toEqual({ market: "domestic" });
    expect(screen.queryByTestId("twilio-form")).not.toBeInTheDocument();
    expect(screen.getByText("Not set up yet")).toBeInTheDocument();
  });

  it("keeps the previous market and shows the error when a switch is refused", async () => {
    superAdmin = true;
    routes("twilio", "international");
    render(<TelephonySettingsView />);
    await screen.findByTestId("twilio-form");
    fetchApi.mockImplementation((path: string, options?: RequestInit) =>
      options?.method === "PUT" ? Promise.reject(new Error("This telephony provider is not available yet.")) : Promise.resolve({ provider: "twilio", market: "international" }),
    );
    fireEvent.change(screen.getByLabelText("Market"), { target: { value: "domestic" } });
    expect(await screen.findByText(/not available yet/)).toBeInTheDocument();
    expect(screen.getByTestId("twilio-form")).toBeInTheDocument();
    expect((screen.getByLabelText("Market") as HTMLSelectElement).value).toBe("international");
  });

  it("a super admin is offered Both and sees both networks' settings", async () => {
    superAdmin = true;
    routes("twilio", "both");
    render(<TelephonySettingsView />);
    expect(await screen.findByRole("option", { name: /Both/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Auth ID")).toBeInTheDocument());
    expect(screen.getByTestId("twilio-form")).toBeInTheDocument();
  });

  it("the domestic form shows only a masked token", async () => {
    routes("plivo", "domestic", {
      auth_id: "MAXXXX",
      auth_token_masked: "****************3456",
      phone_number: "+911800000001",
      status: "CONNECTED",
    });
    render(<TelephonySettingsView />);
    const token = (await screen.findByLabelText("Auth Token")) as HTMLInputElement;
    expect(token.type).toBe("password");
    expect(token.value).toBe("****************3456");
    expect(screen.getByText("+911800000001")).toBeInTheDocument();
    expect(screen.queryByText("Not set up yet")).not.toBeInTheDocument();
  });
});
