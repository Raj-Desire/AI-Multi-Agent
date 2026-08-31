const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

// Fast client-side cache: { url: { data: any, timestamp: number } }
const _API_CACHE = new Map<string, { data: any; timestamp: number }>();
const DEFAULT_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export function invalidateApiCache(pathPrefix?: string) {
  if (!pathPrefix) {
    _API_CACHE.clear();
    return;
  }
  for (const key of _API_CACHE.keys()) {
    if (key.includes(pathPrefix)) {
      _API_CACHE.delete(key);
    }
  }
}

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const token = localStorage.getItem("desire_token");
  const cacheKey = `${token ? "auth_" : "anon_"}${path}`;

  // If this is a mutation (POST, PUT, DELETE, PATCH), invalidate related caches so subsequent GETs fetch fresh data
  if (method !== "GET") {
    // Invalidate related cache keys
    const baseSegment = path.split("/")[1] || "";
    if (baseSegment) {
      invalidateApiCache(`/${baseSegment}`);
    } else {
      invalidateApiCache();
    }
  } else {
    // Check in-memory cache for instant return (<1ms)
    const cached = _API_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < DEFAULT_CACHE_TTL_MS) {
      return cached.data as T;
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 25s default timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers,
    });

    let json: any;
    try {
      json = await res.json();
    } catch {
      json = { detail: `HTTP ${res.status} ${res.statusText}` };
    }
    
    if (!res.ok) {
      throw new Error(json.detail || json.error?.message || "API request failed");
    }

    const resultData = json.success !== undefined ? json.data : json;

    // Cache successful GET results
    if (method === "GET") {
      _API_CACHE.set(cacheKey, { data: resultData, timestamp: Date.now() });
    }

    return resultData as T;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Network request timed out. Please check your connection.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}


