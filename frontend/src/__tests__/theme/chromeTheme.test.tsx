import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "../../components/Sidebar";
import { ThemeProvider } from "../../context/ThemeContext";
import { AuthProvider } from "../../context/AuthContext";
import { BrowserRouter } from "react-router-dom";

// Mock fetchApi to return custom theme
vi.mock("../../api-client", () => ({
  fetchApi: vi.fn().mockImplementation((endpoint: string) => {
    if (endpoint.includes("/organization/theme")) {
      return Promise.resolve({
        organization_id: "test-org",
        identity: {
          org_name: "Apex Global Telecom",
          logo_url: "https://example.com/logo.png",
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
    return Promise.resolve({});
  }),
  API_ORIGIN: "http://localhost:8000",
}));

// Mock useAuth to return user
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", username: "admin", role: "admin", organization_id: "test-org", org_name: "Apex Global Telecom" },
    isLoading: false,
    isAdmin: true,
    isSuperAdmin: false,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Sidebar Theme Reactivity", () => {
  it("renders custom organization name and logo from theme", async () => {
    localStorage.setItem(
      "desire_cached_org_theme_test-org",
      JSON.stringify({
        organization_id: "test-org",
        identity: {
          org_name: "Apex Global Telecom",
          logo_url: "https://example.com/logo.png",
          show_nav_logo: true,
          show_nav_title: true,
        },
        colors: {
          primary: "#e11d48",
          surface: "#ffffff",
          sidebar: "#f8f9fa",
          sidebar_text: "#0f172a",
          border: "#e2e8f0",
        },
        appearance: { ui_style: "default", border_radius: "md" },
        typography: { font_family: "Inter" },
      })
    );

    render(
      <BrowserRouter>
        <ThemeProvider>
          <Sidebar activeTab="dashboard" onTabChange={() => {}} />
        </ThemeProvider>
      </BrowserRouter>
    );

    expect(await screen.findByText("Apex Global Telecom")).toBeInTheDocument();
    const logoImg = screen.getByAltText("Logo");
    expect(logoImg).toHaveAttribute("src", "https://example.com/logo.png");
  });
});
