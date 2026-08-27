/**
 * Optional Redis client.
 * - No REDIS_HOST → in-memory cache
 * - REDIS_HOST set but unreachable (ENOTFOUND etc.) → disable Redis and fall back to memory
 * Call sites (readThroughCache / cache) stay unchanged.
 */
import { createClient, RedisClientType } from "redis";
import { sendOpsAlert } from "../service/opsAlerts";
import { logger } from "../utils/logger";

type EnhancedRedisClient = RedisClientType & {
  isConnected: () => Promise<boolean>;
  healthCheck: () => Promise<{
    status: "connected" | "disconnected" | "error";
    latency?: number;
    error?: Error;
  }>;
};

const host = String(process.env.REDIS_HOST || "").trim();
const port = parseInt(process.env.REDIS_PORT || "6379", 10);
const password = process.env.REDIS_PASSWORD;

/** Mutable: starts true when REDIS_HOST is set; flipped off on hard connect failures. */
let redisAvailable = Boolean(host);

export function isRedisEnabled(): boolean {
  return redisAvailable;
}

export function disableRedis(reason?: string): void {
  if (!redisAvailable) return;
  redisAvailable = false;
  const detail = reason || "unknown reason";
  logger.warn(`Redis disabled — falling back to in-memory cache: ${detail}`);
  void sendOpsAlert("redis_disabled", detail, {
    key: `redis_disabled:${host || "unknown"}`,
  });
  void (async () => {
    try {
      if (redisClient?.isOpen) await redisClient.quit();
    } catch {
      /* ignore */
    }
  })();
}

function isFatalRedisError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "");
  const code = String((err as { code?: string })?.code || "");
  return (
    /ENOTFOUND|ECONNREFUSED|ENETUNREACH|ETIMEDOUT|getaddrinfo/i.test(msg) ||
    /ENOTFOUND|ECONNREFUSED|ENETUNREACH|ETIMEDOUT/i.test(code)
  );
}

let redisClient: EnhancedRedisClient | null = null;

if (redisAvailable) {
  redisClient = createClient({
    socket: {
      host,
      port,
      tls: true,
      servername: host,
      // Stop reconnect loops when host is gone (common after Redis deleted in Azure).
      reconnectStrategy: (retries, cause) => {
        if (isFatalRedisError(cause) || retries >= 3) {
          disableRedis(
            isFatalRedisError(cause)
              ? String((cause as Error)?.message || cause)
              : `max reconnect attempts (${retries})`,
          );
          return false;
        }
        return Math.min(1000 + retries * 250, 5000);
      },
    },
    password,
  }) as EnhancedRedisClient;

  redisClient.isConnected = async () => {
    try {
      if (!isRedisEnabled() || !redisClient?.isOpen) return false;
      await redisClient.ping();
      return true;
    } catch {
      return false;
    }
  };

  redisClient.healthCheck = async () => {
    try {
      if (!isRedisEnabled()) {
        return { status: "disconnected" };
      }
      const start = Date.now();
      await ensureRedis();
      if (!isRedisEnabled() || !redisClient) {
        return { status: "disconnected" };
      }
      await redisClient.ping();
      return { status: "connected", latency: Date.now() - start };
    } catch (err) {
      return {
        status: "error",
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  };

  redisClient.on("connect", () => logger.info("Redis connecting..."));
  redisClient.on("ready", () => logger.info("Redis ready"));
  redisClient.on("end", () => logger.warn("Redis connection ended"));
  redisClient.on("reconnecting", () => {
    if (isRedisEnabled()) logger.info("Redis reconnecting...");
  });
  redisClient.on("error", (err) => {
    if (isFatalRedisError(err)) {
      disableRedis(err instanceof Error ? err.message : String(err));
      return;
    }
    if (isRedisEnabled()) logger.error(err, "Redis error");
  });

  ensureRedis();

  const gracefulShutdown = async () => {
    try {
      if (redisClient?.isOpen) {
        await redisClient.quit();
        logger.info("Redis quit gracefully");
      }
    } catch (err) {
      logger.error(err, "Error during Redis quit");
    }
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
} else {
  logger.info("Redis disabled (REDIS_HOST not set) — using in-memory cache");
}

/** Ensure we have a live connection before any command (no-op when Redis disabled). */
export async function ensureRedis(): Promise<void> {
  if (!isRedisEnabled() || !redisClient) return;
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      logger.info("Redis connected (ensureRedis)");
    }
  } catch (err) {
    logger.error(err, "Redis connect failed in ensureRedis");
    if (isFatalRedisError(err)) {
      disableRedis(err instanceof Error ? err.message : String(err));
    }
  }
}

export default redisClient as EnhancedRedisClient;
