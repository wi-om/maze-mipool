import type { Response } from "express";

const settingsRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
};

jest.mock("@common", () => ({
  AppDataSource: { getRepository: jest.fn(() => settingsRepo) },
  SystemSetting: {},
  buildCacheKey: jest.fn((prefix: string) => `api:${prefix}:test`),
  readThroughCache: jest.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidateCachePrefix: jest.fn().mockResolvedValue(undefined),
}));

import {
  getSetting,
  updateSetting,
  getAllSettings,
} from "../../modules/crm/controllers/settings/settings.controller";

const jsonMock = jest.fn();
const statusMock = jest.fn().mockReturnThis();
const createRes = (): Response =>
  ({ status: statusMock, json: jsonMock } as unknown as Response);

describe("crm settings.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSetting", () => {
    it("returns 404 when setting not found", async () => {
      settingsRepo.findOne.mockResolvedValueOnce(null);
      await getSetting({ params: { key: "k" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Setting not found" });
    });

    it("returns 200 with setting when found", async () => {
      const setting = { Key: "k", Value: "v" };
      settingsRepo.findOne.mockResolvedValueOnce(setting);
      await getSetting({ params: { key: "k" } } as any, createRes());
      expect(settingsRepo.findOne).toHaveBeenCalledWith({ where: { Key: "k" } });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(setting);
    });

    it("returns 500 with error.message on exception", async () => {
      settingsRepo.findOne.mockRejectedValueOnce(new Error("db"));
      await getSetting({ params: { key: "k" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "db" });
    });
  });

  describe("updateSetting", () => {
    it("returns 400 when key missing", async () => {
      await updateSetting({ body: { value: 1 }, user: { email: "e@e.com" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Key and Value are required" });
    });

    it("returns 400 when value is undefined", async () => {
      await updateSetting({ body: { key: "k" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("updates existing setting and uses req.user.email", async () => {
      const existing = { Key: "k", Value: "old", UpdatedBy: "x" };
      settingsRepo.findOne.mockResolvedValueOnce(existing);
      settingsRepo.save.mockResolvedValueOnce(existing);

      await updateSetting(
        { body: { key: "k", value: 123 }, user: { email: "me@test.com" } } as any,
        createRes()
      );

      expect(existing.Value).toBe("123");
      expect(existing.UpdatedBy).toBe("me@test.com");
      expect(settingsRepo.save).toHaveBeenCalledWith(existing);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Setting updated successfully", setting: existing })
      );
      expect(settingsRepo.create).not.toHaveBeenCalled();
    });

    it("creates new setting when missing and uses updatedBy=system when no user", async () => {
      settingsRepo.findOne.mockResolvedValueOnce(null);
      const created = { Key: "k", Value: "v", UpdatedBy: "system" };
      settingsRepo.create.mockReturnValueOnce(created);
      settingsRepo.save.mockResolvedValueOnce(created);

      await updateSetting({ body: { key: "k", value: "v" } } as any, createRes());

      expect(settingsRepo.create).toHaveBeenCalledWith({ Key: "k", Value: "v", UpdatedBy: "system" });
      expect(settingsRepo.save).toHaveBeenCalledWith(created);
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it("stringifies non-string values", async () => {
      settingsRepo.findOne.mockResolvedValueOnce(null);
      settingsRepo.create.mockReturnValueOnce({ Key: "k", Value: "true", UpdatedBy: "system" });
      await updateSetting({ body: { key: "k", value: true } } as any, createRes());
      expect(settingsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ Value: "true" })
      );
    });

    it("returns 500 with error.message on repo error", async () => {
      settingsRepo.findOne.mockRejectedValueOnce(new Error("fail"));
      await updateSetting({ body: { key: "k", value: 1 } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "fail" });
    });

    it("returns 500 if save throws", async () => {
      settingsRepo.findOne.mockResolvedValueOnce({ Key: "k", Value: "x" });
      settingsRepo.save.mockRejectedValueOnce(new Error("save fail"));
      await updateSetting({ body: { key: "k", value: "y" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "save fail" });
    });
  });

  describe("getAllSettings", () => {
    it("returns 200 with settings", async () => {
      settingsRepo.find.mockResolvedValueOnce([{ Key: "k" }]);
      await getAllSettings({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith([{ Key: "k" }]);
    });

    it("returns 500 with error.message when find throws", async () => {
      settingsRepo.find.mockRejectedValueOnce(new Error("boom"));
      await getAllSettings({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "boom" });
    });
  });
});

