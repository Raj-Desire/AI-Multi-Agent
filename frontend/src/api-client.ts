const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("desire_token");
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 10s default timeout controller to prevent UI hang
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

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

    if (json.success !== undefined) {
      return json.data;
    }

    return json;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Network request timed out. Please check your connection.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

