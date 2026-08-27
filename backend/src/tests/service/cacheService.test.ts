import { createHash } from "node:crypto";

const redisClient = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  flushAll: jest.fn(),
  exists: jest.fn(),
  scanIterator: jest.fn(),
};

const ensureRedis = jest.fn();
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock("../../common/config/redisClient", () => ({
  __esModule: true,
  default: redisClient,
  ensureRedis,
  isRedisEnabled: () => true,
}));

jest.mock("../../common/utils/logger", () => ({ logger }));

import cache, { KeyTools } from "../../common/service/cacheService";

describe("common cacheService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureRedis.mockResolvedValue(undefined);
    redisClient.set.mockResolvedValue(undefined);
    redisClient.get.mockResolvedValue(null);
    redisClient.del.mockResolvedValue(1);
    redisClient.flushAll.mockResolvedValue("OK");
    redisClient.exists.mockResolvedValue(0);
  });

  describe("set/get/del/flushAll", () => {
    it("set stores JSON with expiration", async () => {
      await cache.set("k", { a: 1 }, 10);
      expect(redisClient.set).toHaveBeenCalledWith("k", JSON.stringify({ a: 1 }), { EX: 10 });
    });

    it("get returns parsed object on hit", async () => {
      redisClient.get.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
      await expect(cache.get("k")).resolves.toEqual({ a: 1 });
    });

    it("get returns null on miss", async () => {
      redisClient.get.mockResolvedValueOnce(null);
      await expect(cache.get("k")).resolves.toBeNull();
    });

    it("get returns null on JSON parse error", async () => {
      redisClient.get.mockResolvedValueOnce("not-json");
      await expect(cache.get("k")).resolves.toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it("del deletes key", async () => {
      await cache.del("k");
      expect(redisClient.del).toHaveBeenCalledWith("k");
    });

    it("flushAll flushes", async () => {
      await cache.flushAll();
      expect(redisClient.flushAll).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("All cache flushed");
    });
  });

  describe("cacheable", () => {
    it("returns cached value when present and does not call fetchFn", async () => {
      redisClient.get.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
      const fetchFn = jest.fn();
      await expect(cache.cacheable("k", fetchFn)).resolves.toEqual({ a: 1 });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("calls fetchFn and caches result on miss", async () => {
      redisClient.get.mockResolvedValueOnce(null);
      const fetchFn = jest.fn().mockResolvedValue({ b: 2 });
      await expect(cache.cacheable("k", fetchFn, { expiration: 5 })).resolves.toEqual({ b: 2 });
      expect(redisClient.set).toHaveBeenCalledWith("k", JSON.stringify({ b: 2 }), { EX: 5 });
    });
  });

  describe("exists", () => {
    it("returns true when redis exists=1", async () => {
      redisClient.exists.mockResolvedValueOnce(1);
      await expect(cache.exists("k")).resolves.toBe(true);
    });

    it("returns false on error", async () => {
      redisClient.exists.mockRejectedValueOnce(new Error("boom"));
      await expect(cache.exists("k")).resolves.toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("runWithReconnect behavior", () => {
    it("retries once if redis client is closed", async () => {
      let call = 0;
      redisClient.get.mockImplementation(async () => {
        call++;
        if (call === 1) {
          const e: any = new Error("client is closed");
          e.name = "ClientClosedError";
          throw e;
        }
        return JSON.stringify({ ok: true });
      });

      await expect(cache.get("k")).resolves.toEqual({ ok: true });
      expect(ensureRedis).toHaveBeenCalledTimes(2); // first attempt + reconnect
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("KeyTools.stableHash", () => {
    it("hash is stable for different key order", () => {
      const a = KeyTools.stableHash({ b: 2, a: 1 });
      const b = KeyTools.stableHash({ a: 1, b: 2 });
      expect(a).toBe(b);
    });

    it("matches sha256(stableStringify)", () => {
      const expected = createHash("sha256").update(JSON.stringify({ a: 1, b: 2 })).digest("hex");
      expect(KeyTools.stableHash({ b: 2, a: 1 })).toBe(expected);
    });
  });

  describe("KeyTools.delByPrefix", () => {
    it("iterates scanIterator and deletes keys", async () => {
      async function* gen() {
        yield "p:1";
        yield "p:2";
      }
      redisClient.scanIterator.mockReturnValueOnce(gen());
      await KeyTools.delByPrefix("p:");
      expect(redisClient.del).toHaveBeenCalledWith("p:1");
      expect(redisClient.del).toHaveBeenCalledWith("p:2");
    });
  });
});

