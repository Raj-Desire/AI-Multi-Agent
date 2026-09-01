const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

// Fast client-side cache: { url: { data: any, timestamp: number } }
const _API_CACHE = new Map<string, { data: any; timestamp: number }>();
// In-flight Promise tracker to deduplicate simultaneous identical requests
const _IN_FLIGHT_REQUESTS = new Map<string, Promise<any>>();

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
    const baseSegment = path.split("/")[1] || "";
    if (baseSegment) {
      invalidateApiCache(`/${baseSegment}`);
    } else {
      invalidateApiCache();
    }
  } else {
    // 1. Check in-memory cache for instant return (<1ms)
    const cached = _API_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < DEFAULT_CACHE_TTL_MS) {
      return cached.data as T;
    }

    // 2. If identical GET request is already in-flight, return existing Promise (De-duplication)
    const existingInFlight = _IN_FLIGHT_REQUESTS.get(cacheKey);
    if (existingInFlight) {
      return existingInFlight as Promise<T>;
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

  const executeFetch = async (): Promise<T> => {
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
      if (method === "GET") {
        _IN_FLIGHT_REQUESTS.delete(cacheKey);
      }
    }
  };

  if (method === "GET") {
    const promise = executeFetch();
    _IN_FLIGHT_REQUESTS.set(cacheKey, promise);
    return promise;
  }

  return executeFetch();
}


