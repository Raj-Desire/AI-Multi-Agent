import React from "react";
import { useVoiceLabel } from "./useVoiceLabel";

/** Shows a voice's name for a stored voice id (usable inside list renders where hooks are not). */
export function VoiceLabel({ id }: { id?: string | null }) {
  return <>{useVoiceLabel(id)}</>;
}
