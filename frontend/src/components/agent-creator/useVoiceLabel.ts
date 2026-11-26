import { useEffect, useState } from "react";
import { AURA_VOICES, POPULAR_SONIC_VOICES } from "./constants";

// An agent only stores a voice id. Names come from the voice catalog, so every page that shows the
// voice resolves the id through this one lookup (the catalog is fetched once and shared).
let catalog: Map<string, string> | null = null;
let inflight: Promise<Map<string, string>> | null = null;

function loadCatalog(): Promise<Map<string, string>> {
  if (catalog) return Promise.resolve(catalog);
  if (!inflight) {
    inflight = (async () => {
      const map = new Map<string, string>();
      try {
        const token = localStorage.getItem("desire_token");
        const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
        const url = apiBase.endsWith("/api/v1") ? `${apiBase}/voice/cartesia-voices` : `${apiBase}/api/v1/voice/cartesia-voices`;
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (res.ok) {
          const body = await res.json();
          for (const v of body?.data ?? []) if (v?.id && v?.name) map.set(v.id, v.name);
        }
        if (map.size) catalog = map;
      } catch {
        /* fall back to the built-in lists */
      }
      inflight = null;
      return map;
    })();
  }
  return inflight;
}

const looksLikeId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);

function builtIn(id: string): string | undefined {
  return (
    (AURA_VOICES as any[]).find((v) => v.id === id)?.name ||
    (POPULAR_SONIC_VOICES as any[]).find((v) => v.id === id)?.name
  );
}

export function useVoiceLabel(voiceId?: string | null): string {
  const id = voiceId || "";
  const [name, setName] = useState<string | undefined>(() => builtIn(id) || catalog?.get(id));
  useEffect(() => {
    let alive = true;
    const known = builtIn(id) || catalog?.get(id);
    if (known) { setName(known); return; }
    if (!id || !looksLikeId(id)) { setName(undefined); return; }
    loadCatalog().then((m) => { if (alive) setName(m.get(id)); });
    return () => { alive = false; };
  }, [id]);
  if (name) return name;
  return id && looksLikeId(id) ? "Custom voice" : id;
}
