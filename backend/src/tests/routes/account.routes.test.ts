import router from "../../modules/crm/routes/accounts/account.routes";
import {
  getAccountByClientid,
  registerAccount,
  getAllAccounts,
} from "../../modules/crm/controllers/account/account.controller";

jest.mock("../../modules/crm/controllers/account/account.controller", () => ({
  getAccountByClientid: jest.fn(),
  registerAccount: jest.fn(),
  getAllAccounts: jest.fn(),
}));

describe("routes/crm.accounts.account.routes", () => {
  const getHandlers = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers POST /register", () => {
    const handlers = getHandlers("/register", "post");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(registerAccount);
  });

  it("registers GET /", () => {
    const handlers = getHandlers("/", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getAllAccounts);
  });

  it("registers GET /by-clientid/:clientid", () => {
    const handlers = getHandlers("/by-clientid/:clientid", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getAccountByClientid);
  });
});

