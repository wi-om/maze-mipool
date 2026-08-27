import router from "../../modules/engine/routes/payouts/payout.routes";
import { verifyMipsToken } from "@common";
import {
  getAllPayouts,
  getPayoutsByClientId,
  getPayoutSummary,
  getPayoutClients,
  getPayoutPending,
  previewPayout,
  completePayout,
  importPayoutTxidFees,
  deductPayoutTxidFees,
} from "../../modules/engine/controllers/payouts/payout.controller";

jest.mock("@common", () => ({
  verifyMipsToken: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock("../../modules/engine/controllers/payouts/payout.controller", () => ({
  getAllPayouts: jest.fn(),
  getPayoutsByClientId: jest.fn(),
  getPayoutSummary: jest.fn(),
  getPayoutClients: jest.fn(),
  getPayoutPending: jest.fn(),
  previewPayout: jest.fn(),
  completePayout: jest.fn(),
  importPayoutTxidFees: jest.fn(),
  deductPayoutTxidFees: jest.fn(),
  getPayoutTxnSummary: jest.fn(),
  previewBlockchainPayout: jest.fn(),
  importBlockchainPayout: jest.fn(),
  compareBlockchainPayouts: jest.fn(),
  listBlockchainPayouts: jest.fn(),
  listPayoutAddressIssues: jest.fn(),
  getDailyReconciliation: jest.fn(),
}));

describe("routes/engine.payouts.payout.routes", () => {
  const getHandlers = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers GET /pending", () => {
    const handlers = getHandlers("/pending", "get");
    expect(handlers[0]).toBe(getPayoutPending);
  });

  it("registers GET /summary", () => {
    const handlers = getHandlers("/summary", "get");
    expect(handlers[0]).toBe(getPayoutSummary);
  });

  it("registers GET /clients", () => {
    const handlers = getHandlers("/clients", "get");
    expect(handlers[0]).toBe(getPayoutClients);
  });

  it("registers POST /preview with verifyMipsToken", () => {
    const handlers = getHandlers("/preview", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(previewPayout);
  });

  it("registers POST /complete with verifyMipsToken", () => {
    const handlers = getHandlers("/complete", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(completePayout);
  });

  it("registers POST /txid-fees/import with verifyMipsToken", () => {
    const handlers = getHandlers("/txid-fees/import", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(importPayoutTxidFees);
  });

  it("registers POST /txid-fees/deduct with verifyMipsToken", () => {
    const handlers = getHandlers("/txid-fees/deduct", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(deductPayoutTxidFees);
  });

  it("registers GET /", () => {
    const handlers = getHandlers("/", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getAllPayouts);
  });

  it("registers GET /client/:clientid", () => {
    const handlers = getHandlers("/client/:clientid", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getPayoutsByClientId);
  });
});
