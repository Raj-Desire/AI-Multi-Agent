const API_BASE = "http://localhost:8000/api/v1";

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": "org_demo_001",
      "X-User-Id": "usr_demo_001",
      ...(options.headers || {}),
    },
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || json.detail || "API request failed");
  }

  return json.data;
}
