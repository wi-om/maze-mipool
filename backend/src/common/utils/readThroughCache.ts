import cache, { KeyTools } from "../service/cacheService";

export async function readThroughCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  return cache.cacheable(key, fetchFn, { expiration: ttlSeconds });
}

export function buildCacheKey(prefix: string, parts: Record<string, unknown> = {}): string {
  const hash = Object.keys(parts).length ? KeyTools.stableHash(parts) : "all";
  return `api:${prefix}:${hash}`;
}

export async function invalidateCachePrefix(prefix: string): Promise<void> {
  await KeyTools.delByPrefix(`api:${prefix}:`);
}
