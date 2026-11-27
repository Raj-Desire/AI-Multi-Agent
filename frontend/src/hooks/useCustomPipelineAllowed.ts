import { useEffect, useState } from "react";
import { fetchApi, LIVE } from "../api-client";
import type { VoiceProfile } from "../types";

interface Options {
  /** Organization that owns the agent being edited. */
  agentOrgId?: string;
  /** Organization of the signed-in user. */
  viewerOrgId?: string;
  isSuperAdmin?: boolean;
}

/**
 * Whether the agent's organization may use the Economy engine. Unknown (loading or failed) is never "allowed".
 * Org admins read their own profile; a super admin editing another organization's agent reads that organization's.
 * `profile` is the viewer's own voice profile (null on the cross-organization path), so callers need no second request.
 */
export function useCustomPipelineAllowed({ agentOrgId, viewerOrgId, isSuperAdmin }: Options) {
  const crossOrg = !!isSuperAdmin && !!agentOrgId && !!viewerOrgId && agentOrgId !== viewerOrgId;
  const [allowed, setAllowed] = useState(false);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAllowed(false);
    setProfile(null);
    const path = crossOrg ? `/superadmin/voice-profiles/${agentOrgId}` : "/voice-profile";
    fetchApi<any>(path, LIVE)
      .then((p) => {
        if (cancelled || !p) return;
        if (crossOrg) setAllowed(p.voice_engine === "custom");
        else {
          setProfile(p);
          setAllowed(p.custom_pipeline_allowed === true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [crossOrg, agentOrgId]);

  return { allowed, profile };
}
