/**
 * Minimal stale-while-revalidate cache for page data.
 * Reopening a page shows the previous result immediately while fresh data loads in the background.
 * Lives in memory for the browser session only.
 */
const store = new Map<string, unknown>();

export function hasCached(key: string): boolean {
  return store.has(key);
}

/**
 * Calls onData with the cached value first (if any), then with the fresh value.
 * Returns true when a cached value was available. A null/undefined fetch result never overwrites the cache.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T | null | undefined>,
  onData: (data: T) => void
): Promise<boolean> {
  const hit = store.has(key);
  if (hit) onData(store.get(key) as T);
  const fresh = await fetcher();
  if (fresh !== null && fresh !== undefined) {
    store.set(key, fresh);
    onData(fresh);
  }
  return hit;
}
