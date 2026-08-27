import type { Request, Response } from "express";

const triggerBackgroundRewardsCatchUp = jest.fn();
const getCronFailuresToday = jest.fn();
const incrementCronFailuresToday = jest.fn();
const wasPriorityEmailSentToday = jest.fn();
const markPriorityEmailSentToday = jest.fn();

jest.mock("../../modules/engine/service/backgroundRewardsCatchUp", () => ({
  triggerBackgroundRewardsCatchUp: (...args: unknown[]) =>
    triggerBackgroundRewardsCatchUp(...args),
}));

jest.mock("../../modules/engine/service/cronFailureTracker", () => ({
  getCronFailuresToday: (...args: unknown[]) => getCronFailuresToday(...args),
  incrementCronFailuresToday: (...args: unknown[]) => incrementCronFailuresToday(...args),
  isCronFailureLimitReached: (n: number) => n >= 5,
  wasPriorityEmailSentToday: (...args: unknown[]) => wasPriorityEmailSentToday(...args),
  markPriorityEmailSentToday: (...args: unknown[]) => markPriorityEmailSentToday(...args),
  getMaxCronFailuresPerDay: () => 5,
}));

jest.mock("../../modules/engine/service/rewardsCatchUpAlerts", () => ({
  sendRewardsCatchUpAlert: jest.fn(),
}));

import { rewardsCronJobHandler } from "../../modules/engine/controllers/rewards/rewardsCron.controller";

const createRes = (): Response & { statusCode: number; jsonMock: jest.Mock } => {
  const res = {
    statusCode: 200,
    jsonMock: jest.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.jsonMock(body);
      return this;
    },
  };
  return res as any;
};

const createReq = (): Request => ({}) as Request;

describe("rewardsCronJobHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCronFailuresToday.mockResolvedValue({ count: 0, dubaiDate: "2026-06-02" });
    wasPriorityEmailSentToday.mockResolvedValue(false);
    markPriorityEmailSentToday.mockResolvedValue(undefined);
  });

  it("returns max_failures_reached when failures >= 5", async () => {
    getCronFailuresToday.mockResolvedValue({ count: 5, dubaiDate: "2026-06-02" });
    const res = createRes();
    await rewardsCronJobHandler(createReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "max_failures_reached", stopRetry: true })
    );
    expect(triggerBackgroundRewardsCatchUp).not.toHaveBeenCalled();
  });

  it("returns success when catch-up succeeds", async () => {
    triggerBackgroundRewardsCatchUp.mockResolvedValue({
      status: "success",
      eligibleEndDate: "2026-06-01",
      lastCalculatedBefore: null,
      gapDays: 1,
      processed: [{ date: "2026-06-01", status: "success" }],
      durationMs: 100,
    });
    const res = createRes();
    await rewardsCronJobHandler(createReq(), res);
    expect(res.jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success", stopRetry: false })
    );
  });

  it("increments failures on partial", async () => {
    triggerBackgroundRewardsCatchUp.mockResolvedValue({
      status: "partial",
      eligibleEndDate: "2026-06-01",
      lastCalculatedBefore: null,
      gapDays: 1,
      processed: [{ date: "2026-06-01", status: "failed", error: "x" }],
      durationMs: 100,
    });
    incrementCronFailuresToday.mockResolvedValue(2);
    const res = createRes();
    await rewardsCronJobHandler(createReq(), res);
    expect(incrementCronFailuresToday).toHaveBeenCalled();
    expect(res.jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ failuresToday: 2, stopRetry: false })
    );
  });
});
