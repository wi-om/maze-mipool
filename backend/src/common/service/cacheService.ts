import { createHash } from "node:crypto";
import redisClient, { ensureRedis, isRedisEnabled } from "../config/redisClient";
import { logger } from "../utils/logger";

const DEFAULT_EXPIRATION = 3600; // 1 hour

type MemoryEntry = { value: string; expiresAt: number };
const memoryStore = new Map<string, MemoryEntry>();

function memorySet(key: string, value: string, expirationSeconds: number) {
  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, expirationSeconds) * 1000,
  });
}

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memoryDel(key: string) {
  memoryStore.delete(key);
}

function memoryFlushAll() {
  memoryStore.clear();
}

function memoryExists(key: string): boolean {
  return memoryGet(key) != null;
}

function memoryDelByPrefix(prefix: string) {
  for (const key of [...memoryStore.keys()]) {
    if (key.startsWith(prefix)) memoryStore.delete(key);
  }
}

function useMemory(): boolean {
  return !isRedisEnabled();
}

// Small helper: try once, if client is closed -> reconnect -> retry once
async function runWithReconnect<T>(fn: () => Promise<T>): Promise<T> {
  try {
    await ensureRedis();
    return await fn();
  } catch (err: any) {
    const isClosed =
      err?.name === "ClientClosedError" ||
      /client is closed/i.test(String(err?.message || ""));
    if (isClosed) {
      logger.warn("Redis client closed. Reconnecting and retrying once...");
      await ensureRedis();
      return await fn();
    }
    throw err;
  }
}

const cache = {
  async set(key: string, value: any, expiration: number = DEFAULT_EXPIRATION) {
    const stringValue = JSON.stringify(value);
    if (useMemory()) {
      memorySet(key, stringValue, expiration);
      logger.debug(`Memory cache set for key: ${key}`);
      return;
    }
    await runWithReconnect(async () => {
      await redisClient.set(key, stringValue, { EX: expiration });
      logger.debug(`Cache set for key: ${key}`);
    });
  },

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = useMemory()
        ? memoryGet(key)
        : await runWithReconnect(async () => redisClient.get(key));

      if (value) {
        logger.debug(`Cache hit for key: ${key}`);
        return JSON.parse(value) as T;
      }
      logger.debug(`Cache miss for key: ${key}`);
      return null;
    } catch (err) {
      logger.error(err, "Error getting cache");
      return null;
    }
  },

  async del(key: string) {
    if (useMemory()) {
      memoryDel(key);
      logger.debug(`Memory cache deleted for key: ${key}`);
      return;
    }
    await runWithReconnect(async () => {
      await redisClient.del(key);
      logger.debug(`Cache deleted for key: ${key}`);
    });
  },

  async flushAll() {
    if (useMemory()) {
      memoryFlushAll();
      logger.info("All memory cache flushed");
      return;
    }
    await runWithReconnect(async () => {
      await redisClient.flushAll();
      logger.info("All cache flushed");
    });
  },

  async cacheable<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: { expiration?: number; invalidateOnUpdate?: boolean } = {},
  ): Promise<T> {
    const { expiration = DEFAULT_EXPIRATION } = options;

    const cached = await this.get<T>(key);
    if (cached !== null) return cached as T;

    const freshData = await fetchFn();
    void this.set(key, freshData, expiration).catch((err) => {
      logger.error(err, `Cache set failed for key: ${key}`);
    });
    return freshData;
  },

  async exists(key: string): Promise<boolean> {
    try {
      if (useMemory()) return memoryExists(key);
      const result = await runWithReconnect(async () => redisClient.exists(key));
      return result === 1;
    } catch (err) {
      logger.error(err, "Error checking cache existence");
      return false;
    }
  },
};

// ---------- key tools ----------
function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return undefined;
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

function stableHash(obj: unknown) {
  return createHash("sha256").update(stableStringify(obj)).digest("hex");
}

async function delByPrefix(prefix: string) {
  if (useMemory()) {
    memoryDelByPrefix(prefix);
    return;
  }
  await ensureRedis();
  const iter = redisClient.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 });
  for await (const key of iter) {
    await redisClient.del(key as string);
  }
}

export const KeyTools = { stableHash, delByPrefix };
export default cache;
