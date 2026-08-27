import type { Response } from "express";

const payoutRepo = {
  find: jest.fn(),
};
const accountRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
};
const userRepo = {
  find: jest.fn(),
};

jest.mock("@common", () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: any) => {
      if (entity && entity.__type === "Payout") return payoutRepo;
      return accountRepo;
    }),
  },
  UserAppDataSource: {
    getRepository: jest.fn(() => userRepo),
  },
  Payout: { __type: "Payout" },
  Account: {},
  User: {},
  buildCacheKey: jest.fn((prefix: string) => `api:${prefix}:test`),
  readThroughCache: jest.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidateCachePrefix: jest.fn().mockResolvedValue(undefined),
}));

import {
  serializePayoutsForApi,
  getAllPayouts,
  getPayoutsByClientId,
} from "../../modules/engine/controllers/payouts/payout.controller";

const statusMock = jest.fn().mockReturnThis();
const jsonMock = jest.fn();
const createRes = (): Response => ({ status: statusMock, json: jsonMock } as any);

describe("engine payout.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("serializePayoutsForApi", () => {
    it("returns [] when empty input", async () => {
      expect(await serializePayoutsForApi([] as any)).toEqual([]);
    });

    it("attaches account payload by AcNo trim map", async () => {
      accountRepo.find.mockResolvedValueOnce([{ AcNo: "AC1", Parent: "c1", ClientID: "C1" }]);
      const data = await serializePayoutsForApi([
        {
          Id: 1,
          AcNo: "AC1   ",
          mipContractNo: "m",
          Status: "S",
          ToAddr: "T",
          account: null,
        } as any,
      ] as any);
      expect(data[0].account).toEqual({ Parent: "c1", ClientID: "C1" });
    });
  });

  describe("getAllPayouts", () => {
    it("returns all payouts when no search", async () => {
      payoutRepo.find.mockResolvedValueOnce([
        { Id: 1, AcNo: "AC1", mipContractNo: "m", Status: "S", ToAddr: "T", account: null },
      ]);
      accountRepo.find.mockResolvedValueOnce([]);
      await getAllPayouts({ query: {} } as any, createRes());
      expect(payoutRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { CreatedOn: "DESC" } })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock.mock.calls[0][0].data).toHaveLength(1);
    });

    it("falls back to mipContractNo Like when no users match", async () => {
      userRepo.find.mockResolvedValueOnce([]);
      payoutRepo.find.mockResolvedValueOnce([]);
      await getAllPayouts({ query: { search: "ABC" } } as any, createRes());
      expect(payoutRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: [{ mipContractNo: expect.anything() }] })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it("returns empty when users match but no accounts", async () => {
      userRepo.find.mockResolvedValueOnce([{ clientid: "c1" }]);
      accountRepo.find.mockResolvedValueOnce([]);
      await getAllPayouts({ query: { search: "c1" } } as any, createRes());
      expect(jsonMock).toHaveBeenCalledWith({ message: "No payouts found for search", data: [] });
    });
  });

  describe("getPayoutsByClientId", () => {
    it("returns 400 when clientid missing", async () => {
      await getPayoutsByClientId({ params: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 404 when account missing", async () => {
      accountRepo.findOne.mockResolvedValueOnce(null);
      await getPayoutsByClientId({ params: { clientid: "c1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
    });

    it("returns payouts for AcNo", async () => {
      accountRepo.findOne.mockResolvedValueOnce({ AcNo: "AC1" });
      payoutRepo.find.mockResolvedValueOnce([]);
      await getPayoutsByClientId({ params: { clientid: "c1" } } as any, createRes());
      expect(payoutRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AcNo: "AC1" }, relations: ["account"] })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });
});
