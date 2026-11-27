import React from "react";
import { Badge } from "./Badge";

/** Which voice engine ran a call: "managed" is shown as Standard, "custom" as Economy. Nothing for old calls. */
export function VoiceEngineBadge({ engine, className = "" }: { engine?: string | null; className?: string }) {
  if (engine !== "managed" && engine !== "custom") return null;
  return (
    <Badge variant={engine === "custom" ? "info" : "neutral"} size="sm" className={className} title="Voice engine">
      {engine === "custom" ? "Economy" : "Standard"}
    </Badge>
  );
}
