import type { Response } from "express";

const logger = { error: jest.fn(), info: jest.fn() };

const fetchCLRewards = jest.fn();
const fetchCMWallet = jest.fn();

jest.mock("@common", () => ({
  logger,
  buildCacheKey: jest.fn((prefix: string) => `api:${prefix}:test`),
  readThroughCache: jest.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
}));

jest.mock("../../modules/engine/service/rewardList.service", () => ({
  fetchCLRewards,
  fetchCMWallet,
  parseClRewardsListParams: jest.requireActual("../../modules/engine/service/rewardList.service")
    .parseClRewardsListParams,
  parseDaysPaginatedParams: jest.requireActual("../../modules/engine/service/rewardList.service")
    .parseDaysPaginatedParams,
}));

import {
  getCLRewardsHandler,
  getCMWalletHandler,
} from "../../modules/engine/controllers/rewards/clReward.controller";
import {
  parseClRewardsListParams,
  parseDaysPaginatedParams,
} from "../../modules/engine/service/rewardList.service";

const statusMock = jest.fn().mockReturnThis();
const jsonMock = jest.fn();
const createRes = (): Response => ({ status: statusMock, json: jsonMock } as any);

describe("engine clReward.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("parseDaysPaginatedParams legacy mode", () => {
    it("uses legacy when page and limit are omitted", () => {
      expect(parseDaysPaginatedParams({})).toEqual(
        expect.objectContaining({ legacy: true }),
      );
      expect(parseDaysPaginatedParams({ dateFrom: "2026-01-01" })).toEqual(
        expect.objectContaining({ legacy: true }),
      );
    });

    it("uses pagination when page or limit is provided", () => {
      expect(parseClRewardsListParams({ page: "2" })).toEqual(
        expect.objectContaining({ legacy: false, page: 2 }),
      );
      expect(parseDaysPaginatedParams({ limit: "25" })).toEqual(
        expect.objectContaining({ legacy: false, limit: 25 }),
      );
    });

    it("uses pagination for summaryOnly even without page/limit", () => {
      expect(parseDaysPaginatedParams({ summaryOnly: "true" })).toEqual(
        expect.objectContaining({ legacy: false, summaryOnly: true }),
      );
    });
  });

  describe("getCLRewardsHandler", () => {
    it("returns paginated CL rewards with metadata", async () => {
      fetchCLRewards.mockResolvedValueOnce({
        data: [{ RewardOn: new Date("2026-01-01T00:00:00Z"), Amount: 1 }],
        pagination: {
          page: 1,
          limit: 10,
          totalDays: 1,
          totalRecords: 1,
          totalAmount: 1,
        },
      });

      await getCLRewardsHandler(
        { query: { dateFrom: "2026-01-01", dateTo: "2026-01-02", page: "1", limit: "10" } } as any,
        createRes(),
      );

      expect(fetchCLRewards).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: "2026-01-01",
          dateTo: "2026-01-02",
          page: 1,
          limit: 10,
          legacy: false,
        }),
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          data: [{ RewardOn: expect.any(Date), Amount: 1 }],
          pagination: expect.objectContaining({ totalDays: 1, totalRecords: 1 }),
        }),
      );
    });

    it("returns legacy response and may include pagination when service provides it", async () => {
      fetchCLRewards.mockResolvedValueOnce({
        data: [{ RewardOn: new Date("2026-01-01T00:00:00Z"), Amount: 1 }],
        pagination: {
          page: 1,
          limit: 1,
          totalDays: 1,
          totalRecords: 1,
          totalAmount: 1,
        },
      });

      await getCLRewardsHandler({ query: { dateFrom: "2026-01-01" } } as any, createRes());

      expect(fetchCLRewards).toHaveBeenCalledWith(expect.objectContaining({ legacy: true }));
      expect(jsonMock.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          message: "CL Rewards fetched successfully",
          data: [{ RewardOn: expect.any(Date), Amount: 1 }],
          pagination: expect.objectContaining({ totalRecords: 1, totalAmount: 1 }),
        }),
      );
    });

    it("returns 500 on error", async () => {
      fetchCLRewards.mockRejectedValueOnce(new Error("db"));
      await getCLRewardsHandler({ query: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe("getCMWalletHandler", () => {
    it("returns paginated wallet entries with metadata", async () => {
      fetchCMWallet.mockResolvedValueOnce({
        data: [{ rewardDate: "2026-01-01", RewardOn: "2026-01-01", Amount: 1 }],
        pagination: {
          page: 1,
          limit: 10,
          totalDays: 1,
          totalRecords: 1,
          totalAmount: 1,
          totalNetAmount: 0.5,
          totalSalesAmount: 0.1,
          latestBalance: 10,
        },
      });

      await getCMWalletHandler({ query: { page: "1", limit: "10" } } as any, createRes());

      expect(fetchCMWallet).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10, legacy: false }),
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          data: [expect.objectContaining({ RewardOn: "2026-01-01" })],
          pagination: expect.objectContaining({ latestBalance: 10 }),
        }),
      );
    });

    it("returns legacy wallet response without pagination metadata", async () => {
      fetchCMWallet.mockResolvedValueOnce({
        data: [{ rewardDate: "2026-01-01", RewardOn: "2026-01-01" }],
      });

      await getCMWalletHandler({ query: {} } as any, createRes());

      expect(fetchCMWallet).toHaveBeenCalledWith(expect.objectContaining({ legacy: true }));
      expect(jsonMock.mock.calls[0][0]).toEqual({
        message: "Wallet entries fetched successfully",
        data: [{ rewardDate: "2026-01-01", RewardOn: "2026-01-01" }],
      });
    });

    it("returns 500 on error", async () => {
      fetchCMWallet.mockRejectedValueOnce(new Error("db"));
      await getCMWalletHandler({ query: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });
});
