import router from "../../modules/engine/routes/worker/mips.routes";
import {
  getPayouts,
  getRewards,
  getWorkers,
} from "../../modules/engine/controllers/worker/workers.controller";

jest.mock("../../modules/engine/controllers/worker/workers.controller", () => ({
  getWorkers: jest.fn(),
  getPayouts: jest.fn(),
  getRewards: jest.fn(),
}));

describe("routes/engine.worker.mips.routes", () => {
  const getHandlers = (path: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods.get
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers GET /btc/workers", () => {
    const handlers = getHandlers("/btc/workers");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getWorkers);
  });

  it("registers GET /btc/payouts", () => {
    const handlers = getHandlers("/btc/payouts");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getPayouts);
  });

  it("registers GET /btc/rewards", () => {
    const handlers = getHandlers("/btc/rewards");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getRewards);
  });
});

