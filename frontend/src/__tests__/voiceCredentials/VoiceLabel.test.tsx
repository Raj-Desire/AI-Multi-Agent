import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VoiceLabel } from "../../components/agent-creator/VoiceLabel";

const ID = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";

describe("voice name instead of raw id", () => {
  it("shows the catalog name for a Cartesia voice id, never the id", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ data: [{ id: ID, name: "Skylar" }] }) })));
    render(<VoiceLabel id={ID} />);
    await waitFor(() => expect(screen.getByText(/^Skylar/)).toBeInTheDocument());
    expect(document.body.textContent).not.toContain(ID);
  });
});
