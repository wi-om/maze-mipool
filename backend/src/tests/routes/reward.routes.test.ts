import router from "../../modules/engine/routes/rewards/reward.routes";
import {
  getRewardsByClientId,
  getRewardsHandler,
  getRewardStatsHandler,
} from "../../modules/engine/controllers/rewards/reward.controller";
import {
  getCLRewardsHandler,
  getCMWalletHandler,
  getCLUptimeHandler,
} from "../../modules/engine/controllers/rewards/clReward.controller";

jest.mock("../../modules/engine/controllers/rewards/reward.controller", () => ({
  getRewardsByClientId: jest.fn(),
  getRewardsHandler: jest.fn(),
  getRewardStatsHandler: jest.fn(),
}));

jest.mock("../../modules/engine/controllers/rewards/clReward.controller", () => ({
  getCLRewardsHandler: jest.fn(),
  getCMWalletHandler: jest.fn(),
  getCLUptimeHandler: jest.fn(),
}));

describe("routes/engine.rewards.reward.routes", () => {
  const getHandlers = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers GET /cl/uptime", () => {
    const handlers = getHandlers("/cl/uptime", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getCLUptimeHandler);
  });

  it("registers GET /cl", () => {
    const handlers = getHandlers("/cl", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getCLRewardsHandler);
  });

  it("registers GET /wallet", () => {
    const handlers = getHandlers("/wallet", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getCMWalletHandler);
  });

  it("registers GET /stats", () => {
    const handlers = getHandlers("/stats", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getRewardStatsHandler);
  });

  it("registers GET /", () => {
    const handlers = getHandlers("/", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getRewardsHandler);
  });

  it("registers GET /client/:clientid", () => {
    const handlers = getHandlers("/client/:clientid", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getRewardsByClientId);
  });
});
