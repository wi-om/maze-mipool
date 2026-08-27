import type { Response } from "express";

const mipsService = {
  fetchMipsWorkers: jest.fn(),
  fetchMipsPayouts: jest.fn(),
  fetchMipsRewards: jest.fn(),
};

jest.mock("../../modules/engine/service/mips.service", () => mipsService);

import { getWorkers, getPayouts, getRewards } from "../../modules/engine/controllers/worker/workers.controller";

const jsonMock = jest.fn();
const statusMock = jest.fn().mockReturnThis();
const createRes = (): Response => ({ status: statusMock, json: jsonMock } as any);

describe("engine workers.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getWorkers", () => {
    it("returns 200 with data", async () => {
      mipsService.fetchMipsWorkers.mockResolvedValueOnce({ ok: true });
      await getWorkers({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ ok: true });
    });

    it("uses err.response.status and err.response.data when present", async () => {
      mipsService.fetchMipsWorkers.mockRejectedValueOnce({ response: { status: 403, data: { x: 1 } } });
      await getWorkers({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Failed to fetch workers from MIPS",
        detail: { x: 1 },
      });
    });

    it("falls back to 500 and message", async () => {
      mipsService.fetchMipsWorkers.mockRejectedValueOnce(new Error("boom"));
      await getWorkers({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Failed to fetch workers from MIPS",
        detail: "boom",
      });
    });
  });

  describe("getPayouts", () => {
    it("passes default limit/offset and returns 200", async () => {
      mipsService.fetchMipsPayouts.mockResolvedValueOnce({ rows: [] });
      await getPayouts({ query: {} } as any, createRes());
      expect(mipsService.fetchMipsPayouts).toHaveBeenCalledWith(30, 0);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ rows: [] });
    });

    it("parses limit/offset from query", async () => {
      mipsService.fetchMipsPayouts.mockResolvedValueOnce({ rows: [] });
      await getPayouts({ query: { limit: "10", offset: "5" } } as any, createRes());
      expect(mipsService.fetchMipsPayouts).toHaveBeenCalledWith(10, 5);
    });

    it("parses JSON in error.message when possible", async () => {
      mipsService.fetchMipsPayouts.mockRejectedValueOnce(new Error(JSON.stringify({ status: 418, why: "teapot" })));
      await getPayouts({ query: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(418);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Failed to fetch payouts from MIPS", detail: { status: 418, why: "teapot" } })
      );
    });

    it("falls back to 502 when error.message is not JSON", async () => {
      mipsService.fetchMipsPayouts.mockRejectedValueOnce(new Error("bad gateway"));
      await getPayouts({ query: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(502);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Failed to fetch payouts from MIPS", detail: "bad gateway" })
      );
    });
  });

  describe("getRewards", () => {
    it("passes default limit/offset and returns 200", async () => {
      mipsService.fetchMipsRewards.mockResolvedValueOnce({ income: [] });
      await getRewards({ query: {} } as any, createRes());
      expect(mipsService.fetchMipsRewards).toHaveBeenCalledWith(500, 0);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ income: [] });
    });

    it("uses status from parsed JSON error", async () => {
      mipsService.fetchMipsRewards.mockRejectedValueOnce(new Error(JSON.stringify({ status: 429 })));
      await getRewards({ query: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(429);
    });
  });
});

