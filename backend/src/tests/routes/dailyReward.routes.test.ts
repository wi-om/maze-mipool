import router from "../../modules/engine/routes/rewards/dailyReward.routes";
import {
  calculateDailyRewardsHandler,
  getDailyRewardsHandler,
  calculateBulkDailyRewardsHandler,
  checkDailyRewardsExistHandler,
  checkMipsDataAvailabilityHandler,
  getLatestUnitRewardHandler,
  getUnitRewardsHistoryHandler,
  getCLContractRangeEligibilityHandler,
} from "../../modules/engine/controllers/rewards/dailyReward.controller";
import { rewardsCronJobHandler } from "../../modules/engine/controllers/rewards/rewardsCron.controller";
import { verifyCronSecret } from "../../common/middlewares/verifyCronSecret";

jest.mock("../../modules/engine/controllers/rewards/dailyReward.controller", () => ({
  calculateDailyRewardsHandler: jest.fn(),
  getDailyRewardsHandler: jest.fn(),
  calculateBulkDailyRewardsHandler: jest.fn(),
  checkDailyRewardsExistHandler: jest.fn(),
  checkMipsDataAvailabilityHandler: jest.fn(),
  getLatestUnitRewardHandler: jest.fn(),
  getUnitRewardsHistoryHandler: jest.fn(),
  getCLContractRangeEligibilityHandler: jest.fn(),
}));

jest.mock("../../modules/engine/controllers/rewards/rewardsCron.controller", () => ({
  rewardsCronJobHandler: jest.fn(),
}));

jest.mock("../../common/middlewares/verifyCronSecret", () => ({
  verifyCronSecret: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

describe("routes/engine.rewards.dailyReward.routes", () => {
  const getHandlers = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers POST /calculate", () => {
    const handlers = getHandlers("/calculate", "post");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(calculateDailyRewardsHandler);
  });

  it("registers POST /bulk", () => {
    const handlers = getHandlers("/bulk", "post");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(calculateBulkDailyRewardsHandler);
  });

  it("registers GET /check-existence", () => {
    const handlers = getHandlers("/check-existence", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(checkDailyRewardsExistHandler);
  });

  it("registers GET /unit-history", () => {
    const handlers = getHandlers("/unit-history", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getUnitRewardsHistoryHandler);
  });

  it("registers GET /check-mips", () => {
    const handlers = getHandlers("/check-mips", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(checkMipsDataAvailabilityHandler);
  });

  it("registers GET /cl-eligibility", () => {
    const handlers = getHandlers("/cl-eligibility", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getCLContractRangeEligibilityHandler);
  });

  it("registers GET /latest-unit-reward", () => {
    const handlers = getHandlers("/latest-unit-reward", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getLatestUnitRewardHandler);
  });

  it("registers GET /", () => {
    const handlers = getHandlers("/", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getDailyRewardsHandler);
  });

  it("registers POST /cron with verifyCronSecret and handler", () => {
    const handlers = getHandlers("/cron", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyCronSecret);
    expect(handlers[1]).toBe(rewardsCronJobHandler);
  });
});

