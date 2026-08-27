import type { Request, Response } from "express";
import { verifyCronSecret } from "../../common/middlewares/verifyCronSecret";

describe("verifyCronSecret", () => {
  const next = jest.fn();
  let statusCode = 200;
  let body: unknown;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(b: unknown) {
      body = b;
      return this;
    },
  } as Response;

  beforeEach(() => {
    jest.clearAllMocks();
    statusCode = 200;
    body = undefined;
    delete process.env.REWARDS_CRON_SECRET;
  });

  it("returns 503 when secret not configured", () => {
    verifyCronSecret({ headers: {} } as Request, res, next);
    expect(statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header missing", () => {
    process.env.REWARDS_CRON_SECRET = "test-secret";
    verifyCronSecret({ headers: {} } as Request, res, next);
    expect(statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when secret matches", () => {
    process.env.REWARDS_CRON_SECRET = "test-secret";
    verifyCronSecret(
      { headers: { "x-cron-secret": "test-secret" } } as unknown as Request,
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });
});
