import type { Response } from "express";

const logger = { info: jest.fn() };

jest.mock("@common", () => ({ logger }));

import { getBTCYield } from "../../modules/engine/controllers/yield/yield.controller";

describe("engine yield.controller", () => {
  it("returns //api running and logs access", () => {
    const jsonMock = jest.fn();
    const res = { json: jsonMock } as unknown as Response;
    getBTCYield({} as any, res);
    expect(jsonMock).toHaveBeenCalledWith({ message: "//api running" });
    expect(logger.info).toHaveBeenCalledWith("Yield API accessed");
  });
});

