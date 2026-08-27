import axios, { AxiosError } from "axios";

const cacheGet = jest.fn().mockResolvedValue(null);
const cacheSet = jest.fn().mockResolvedValue(undefined);
const cacheable = jest.fn(async (_key: string, fn: any) => fn());
const stableHash = jest.fn(() => "h");
const checkHashrateAlerts = jest.fn();
const withSpan = jest.fn(
  async (_name: string, _attrs: unknown, fn: (span: { setAttribute: jest.Mock }) => Promise<unknown>) =>
    fn({ setAttribute: jest.fn() })
);

const mockMipsGet = jest.fn();

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({ get: (...args: any[]) => mockMipsGet(...args) })),
  },
  AxiosError: class AxiosError extends Error {
    response: any;
    code: any;
    config: any;
    request: any;
    constructor(message: string, code?: any, config?: any, request?: any, response?: any) {
      super(message);
      this.response = response;
      this.code = code;
      this.config = config;
      this.request = request;
    }
  },
}));

const settingsRepo = {
  find: jest.fn().mockResolvedValue([{ Key: "sampling_hashrate", Value: "250" }]),
  findOne: jest.fn(),
};
const contractRepo = { createQueryBuilder: jest.fn(() => ({ innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ total: "0" }) })) };
const clContractRepo = { createQueryBuilder: jest.fn(() => ({ where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ total: "0" }) })) };

jest.mock("@common", () => ({
  env: {
    MIPS_BASE_URL: "http://mips",
    MIPS_API_KEY: "K1",
    MIPS_REWARDS_KEY: "K2",
    MIPS_PAYOUTS_KEY: "K3",
  },
  cache: { cacheable: cacheable as any, get: cacheGet, set: cacheSet },
  KeyTools: { stableHash: stableHash as any },
  alertService: { checkHashrateAlerts: checkHashrateAlerts as any },
  withSpan: withSpan as any,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  AppDataSource: {
    getRepository: jest.fn((entity: any) => {
      if (entity && entity.__type === "SystemSetting") return settingsRepo;
      if (entity && entity.__type === "Contract") return contractRepo;
      if (entity && entity.__type === "CLContract") return clContractRepo;
      return {};
    }),
  },
  Contract: { __type: "Contract" },
  CLContract: { __type: "CLContract" },
  Account: {},
  SystemSetting: { __type: "SystemSetting" },
}));

import { fetchMipsPayouts, fetchMipsRewards, fetchMipsWorkers } from "../../modules/engine/service/mips.service";

describe("services mips.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheGet.mockResolvedValue(null);
    cacheSet.mockResolvedValue(undefined);
    settingsRepo.find.mockResolvedValue([{ Key: "sampling_hashrate", Value: "250" }]);
  });

  describe("fetchMipsPayouts", () => {
    it("returns data on success", async () => {
      mockMipsGet.mockResolvedValueOnce({ data: { ok: true } });
      await expect(fetchMipsPayouts(10, 0)).resolves.toEqual({ ok: true });
    });

    it("rethrows 404 errors (expected upstream)", async () => {
      const err = new AxiosError("not found") as any;
      err.response = { status: 404 };
      mockMipsGet.mockRejectedValueOnce(err);
      await expect(fetchMipsPayouts()).rejects.toBe(err);
    });

    it("throws AxiosError JSON wrapper for non-404", async () => {
      const err = new AxiosError("boom") as any;
      err.response = { status: 500, data: { x: 1 } };
      mockMipsGet.mockRejectedValueOnce(err);
      try {
        await fetchMipsPayouts();
        throw new Error("expected throw");
      } catch (e: any) {
        const payload = JSON.parse(e.message);
        expect(payload.attempted.mode).toBe("query");
        expect(payload.status).toBe(500);
        expect(payload.data).toEqual({ x: 1 });
      }
    });
  });

  describe("fetchMipsRewards", () => {
    it("uses query auth first and calls alertService", async () => {
      mockMipsGet.mockResolvedValueOnce({ data: { income: [] } });
      await expect(fetchMipsRewards(5, 0)).resolves.toEqual({ income: [] });
      expect(checkHashrateAlerts).toHaveBeenCalledWith({ income: [] });
      expect(mockMipsGet).toHaveBeenCalledWith("/btc/rewards", expect.objectContaining({ params: expect.any(Object) }));
    });

    it("falls back to header auth when query fails", async () => {
      mockMipsGet.mockRejectedValueOnce(new Error("qfail"));
      mockMipsGet.mockResolvedValueOnce({ data: { income: [1] } });
      await expect(fetchMipsRewards(5, 0)).resolves.toEqual({ income: [1] });
      expect(mockMipsGet).toHaveBeenCalledTimes(2);
    });

    it("throws AxiosError JSON wrapper with attempts when both fail", async () => {
      const err = new AxiosError("bad") as any;
      err.response = { status: 502, data: { m: 1 } };
      mockMipsGet.mockRejectedValueOnce(new Error("qfail"));
      mockMipsGet.mockRejectedValueOnce(err);

      await expect(fetchMipsRewards()).rejects.toBeInstanceOf(Error);
      try {
        await fetchMipsRewards();
      } catch (e: any) {
        const payload = JSON.parse(e.message);
        expect(payload.attempts).toHaveLength(2);
      }
    });
  });

  describe("fetchMipsWorkers", () => {
    it("returns lastRes when no key has data", async () => {
      mockMipsGet.mockResolvedValue({
        data: { total_count: { active: 0 }, total_hashrate: { hashrate: 0 } },
      });

      const res = await fetchMipsWorkers();
      expect(res).toEqual(expect.objectContaining({ total_count: expect.anything() }));
      expect(mockMipsGet).toHaveBeenCalled();
    });

    it("fires parallel upstream requests for each API key", async () => {
      mockMipsGet.mockResolvedValue({
        data: { total_count: { active: 1 }, total_hashrate: { hashrate: 100, hashrate1h: 1, hashrate24h: 1 } },
      });

      await fetchMipsWorkers();
      expect(mockMipsGet.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(settingsRepo.find).toHaveBeenCalledTimes(1);
    });
  });
});

