import router from "../../modules/crm/routes/settings/settings.routes";
import { verifyMipsToken } from "@common";
import {
  getSetting,
  updateSetting,
  getAllSettings,
} from "../../modules/crm/controllers/settings/settings.controller";

jest.mock("@common", () => ({
  verifyMipsToken: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock("../../modules/crm/controllers/settings/settings.controller", () => ({
  getSetting: jest.fn(),
  updateSetting: jest.fn(),
  getAllSettings: jest.fn(),
}));

describe("routes/crm.settings.settings.routes", () => {
  const getHandlers = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers GET / with verifyMipsToken", () => {
    const handlers = getHandlers("/", "get");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(getAllSettings);
  });

  it("registers GET /:key with verifyMipsToken", () => {
    const handlers = getHandlers("/:key", "get");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(getSetting);
  });

  it("registers POST /update with verifyMipsToken", () => {
    const handlers = getHandlers("/update", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(updateSetting);
  });
});

