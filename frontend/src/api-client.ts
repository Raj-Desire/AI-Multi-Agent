const API_BASE = "http://localhost:8000/api/v1";

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("desire_token");
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const json = await res.json();
  
  if (!res.ok) {
    throw new Error(json.detail || json.error?.message || "API request failed");
  }

  if (json.success !== undefined) {
    return json.data;
  }

  return json;
}
