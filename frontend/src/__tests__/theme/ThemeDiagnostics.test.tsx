import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeDiagnosticsTab } from "../../components/theme/ThemeDiagnosticsTab";
import { DEFAULT_ORG_THEME } from "../../context/ThemeContext";

describe("ThemeDiagnosticsTab", () => {
  it("renders all 14 page audits and calculates overall health score", () => {
    render(<ThemeDiagnosticsTab theme={DEFAULT_ORG_THEME} />);

    expect(screen.getByText(/Theme Health & Diagnostics/i)).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("AI Agent Dialer")).toBeInTheDocument();
    expect(screen.getByText("Voice Agent Studio")).toBeInTheDocument();

    const runBtn = screen.getByRole("button", { name: /run diagnostic verification/i });
    fireEvent.click(runBtn);

    expect(screen.getByText(/14 \/ 14 Pages Verified Compliant/i)).toBeInTheDocument();
  });
});
