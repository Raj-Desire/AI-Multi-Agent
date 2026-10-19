import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemePreview } from "../../components/ui/ThemePreview";
import { DEFAULT_ORG_THEME } from "../../context/ThemeContext";

describe("ThemePreview Multi-Section Switcher", () => {
  it("switches across preview sections seamlessly and reflects theme identity", () => {
    const customTheme = {
      ...DEFAULT_ORG_THEME,
      identity: { ...DEFAULT_ORG_THEME.identity, org_name: "Preview Telecom" },
    };

    render(<ThemePreview theme={customTheme} />);

    // Brand name rendered in mock sidebar and header
    expect(screen.getAllByText("Preview Telecom").length).toBeGreaterThan(0);

    // Switch to AI Dialer
    const dialerBtn = screen.getByRole("button", { name: /dialer/i });
    fireEvent.click(dialerBtn);
    expect(screen.getByText(/dialpad/i)).toBeInTheDocument();

    // Switch to Campaigns & Leads
    const campaignsBtn = screen.getByRole("button", { name: /campaigns/i });
    fireEvent.click(campaignsBtn);
    expect(screen.getByText(/active campaigns/i)).toBeInTheDocument();

    // Switch to Knowledge Base
    const knowledgeBtn = screen.getByRole("button", { name: /knowledge/i });
    fireEvent.click(knowledgeBtn);
    expect(screen.getByText(/business profile/i)).toBeInTheDocument();
  });
});
