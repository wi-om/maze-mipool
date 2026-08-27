import router from "../../modules/auth/routes/auth/auth.routes";
import { verifyMipsToken, limiter } from "@common";
import { signup, login, verifyOtp, getMe } from "../../modules/auth/controllers/auth/auth.controller";

jest.mock("@common", () => ({
  verifyMipsToken: jest.fn((_req: any, _res: any, next: any) => next()),
  limiter: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock("../../modules/auth/controllers/auth/auth.controller", () => ({
  signup: jest.fn(),
  login: jest.fn(),
  verifyOtp: jest.fn(),
  getMe: jest.fn(),
}));

describe("routes/auth.routes", () => {
  const getHandlers = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers POST /signup with limiter", () => {
    const handlers = getHandlers("/signup", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(limiter);
    expect(handlers[1]).toBe(signup);
  });

  it("registers POST /login with limiter", () => {
    const handlers = getHandlers("/login", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(limiter);
    expect(handlers[1]).toBe(login);
  });

  it("registers POST /verify with limiter", () => {
    const handlers = getHandlers("/verify", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(limiter);
    expect(handlers[1]).toBe(verifyOtp);
  });

  it("registers GET /me with verifyMipsToken", () => {
    const handlers = getHandlers("/me", "get");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(getMe);
  });
});

