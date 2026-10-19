import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "../../context/ThemeContext";
import { AuthProvider } from "../../context/AuthContext";

// Views to test
import { DashboardView } from "../../components/DashboardView";
import { AIAgentDialerView } from "../../components/AIAgentDialerView";
import { VoiceAgentView } from "../../components/VoiceAgentView";
import { AgentManagementView } from "../../components/AgentManagementView";
import { LeadIntelligenceView } from "../../components/lead-intelligence/LeadIntelligenceView";
import { CampaignsView } from "../../components/campaigns/CampaignsView";
import { ProspectsView } from "../../components/prospects/ProspectsView";
import { BusinessProfileView } from "../../components/BusinessProfileView";
import { UsageDashboardView } from "../../components/UsageDashboardView";
import { TwilioSettingsView } from "../../components/TwilioSettingsView";
import { AdminPanel } from "../../components/AdminPanel";
import { SuperAdminPanel } from "../../components/SuperAdminPanel";
import { LoginPage } from "../../components/LoginPage";
import { Sidebar } from "../../components/Sidebar";

// Mock API client
vi.mock("../../api-client", () => ({
  fetchApi: vi.fn().mockImplementation((endpoint: string) => {
    if (endpoint.includes("/credits/my-org") || endpoint.includes("/usage")) {
      return Promise.resolve({
        organization_id: "test-org",
        total_credits_minutes: 2000,
        used_credits_minutes: 500,
        remaining_minutes: 1500,
        status: "healthy",
        breakdown: { stt_minutes: 200, tts_minutes: 150, llm_minutes: 100, telephony_minutes: 50 },
        call_events_count: 42,
        low_credit_threshold_minutes: 300,
      });
    }
    if (endpoint.includes("/organization/theme")) {
      return Promise.resolve({
        organization_id: "test-org",
        identity: {
          org_name: "Apex Voice Systems",
          logo_url: null,
          show_nav_logo: true,
          show_nav_title: true,
        },
        colors: {
          primary: "#e11d48",
          primary_hover: "#be123c",
          secondary: "#0ea5e9",
          accent: "#8b5cf6",
          background: "#ffffff",
          surface: "#ffffff",
          sidebar: "#f8f9fa",
          sidebar_text: "#0f172a",
          heading: "#0f172a",
          text: "#1e293b",
          border: "#e2e8f0",
        },
        appearance: { ui_style: "default", border_radius: "md" },
        typography: { font_family: "Inter" },
      });
    }
    if (endpoint.includes("/leads") || endpoint.includes("/prospects") || endpoint.includes("/campaigns")) {
      return Promise.resolve({
        leads: [],
        prospects: [],
        campaigns: [],
        total: 0,
        summary: { total_leads: 10, interested: 4, callback_requested: 2, avg_lead_score: 82 },
      });
    }
    if (endpoint.includes("/agents")) {
      return Promise.resolve([]);
    }
    if (endpoint.includes("/users")) {
      return Promise.resolve([]);
    }
    return Promise.resolve({});
  }),
  API_ORIGIN: "http://localhost:8000",
}));

// Mock Auth
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u-123",
      username: "admin_user",
      role: "superadmin",
      organization_id: "test-org",
      org_name: "Apex Voice Systems",
    },
    isLoading: false,
    isAdmin: true,
    isSuperAdmin: true,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderWithTheme = (component: React.ReactNode) => {
  localStorage.setItem(
    "desire_cached_org_theme_test-org",
    JSON.stringify({
      organization_id: "test-org",
      identity: {
        org_name: "Apex Voice Systems",
        logo_url: null,
        show_nav_logo: true,
        show_nav_title: true,
      },
      colors: {
        primary: "#e11d48",
        secondary: "#0ea5e9",
        accent: "#8b5cf6",
        background: "#ffffff",
        surface: "#ffffff",
        sidebar: "#f8f9fa",
        sidebar_text: "#0f172a",
        heading: "#0f172a",
        text: "#1e293b",
        border: "#e2e8f0",
      },
      appearance: { ui_style: "default", border_radius: "md" },
      typography: { font_family: "Inter" },
    })
  );

  return render(
    <BrowserRouter>
      <ThemeProvider>{component}</ThemeProvider>
    </BrowserRouter>
  );
};

describe("Comprehensive Page Theme Coverage Suite (All 14 Views)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. DashboardView mounts cleanly and adheres to theme", () => {
    const { container } = renderWithTheme(<DashboardView onNavigateSettings={() => {}} />);
    expect(container).toBeDefined();
    // Zero hardcoded indigo classes
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("2. AIAgentDialerView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(
      <AIAgentDialerView onNavigateSettings={() => {}} onNavigateAgents={() => {}} />
    );
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("3. VoiceAgentView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<VoiceAgentView />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("4. AgentManagementView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<AgentManagementView />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("5. LeadIntelligenceView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<LeadIntelligenceView />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("6. CampaignsView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<CampaignsView />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("7. ProspectsView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<ProspectsView />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("8. BusinessProfileView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<BusinessProfileView />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("9. UsageDashboardView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<UsageDashboardView />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("10. TwilioSettingsView mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<TwilioSettingsView />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("11. AdminPanel mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<AdminPanel />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("12. SuperAdminPanel mounts cleanly with theme tokens", () => {
    const { container } = renderWithTheme(<SuperAdminPanel />);
    expect(container).toBeDefined();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("13. LoginPage mounts cleanly and displays theme branding", () => {
    const { container } = renderWithTheme(<LoginPage />);
    expect(container).toBeDefined();
    expect(screen.getByText("Apex Voice Systems")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });

  it("14. Sidebar mounts cleanly and displays theme branding", () => {
    const { container } = renderWithTheme(<Sidebar activeTab="dashboard" onTabChange={() => {}} />);
    expect(container).toBeDefined();
    expect(screen.getByText("Apex Voice Systems")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/\b(bg|text|border)-indigo-[0-9]{2,3}\b/);
  });
});
