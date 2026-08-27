import { DateTime } from "luxon";

const otpRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
};

const sendEmail = jest.fn();

jest.mock("@common", () => ({
  AppDataSource: {
    getRepository: jest.fn(() => otpRepo),
    transaction: jest.fn(async (fn: (mgr: any) => Promise<void>) => {
      const mgr = {
        getRepository: jest.fn(() => otpRepo),
      };
      return fn(mgr);
    }),
  },
  MipsOtp: {},
  sendEmail,
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { AuthService } from "../../modules/auth/service/auth.service";

describe("services AuthService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateOtp", () => {
    it("creates otp entity with 6 digits and expiry ~10 minutes and sends email", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));

      // Make OTP deterministic: random=0 -> 100000
      const spy = jest.spyOn(Math, "random").mockReturnValue(0);

      otpRepo.create.mockImplementationOnce((x: any) => x);
      otpRepo.delete.mockResolvedValueOnce(undefined);
      otpRepo.save.mockResolvedValueOnce(undefined);
      sendEmail.mockResolvedValueOnce(undefined);

      const svc = new AuthService();
      await svc.generateOtp("a@test.com");

      expect(otpRepo.delete).toHaveBeenCalledWith({ email: "a@test.com" });

      expect(otpRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "a@test.com",
          otp: "100000",
          expiresAt: expect.any(Date),
        })
      );

      const expiresAt = (otpRepo.create.mock.calls[0][0] as any).expiresAt as Date;
      // Luxon uses local zone by default; assert absolute time delta instead.
      expect(expiresAt.getTime()).toBe(new Date("2026-01-01T00:10:00Z").getTime());

      expect(otpRepo.save).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledWith(
        "a@test.com",
        "MIPS Authentication OTP",
        expect.stringContaining("100000"),
        { waitForDelivery: false },
      );

      spy.mockRestore();
      jest.useRealTimers();
    });

    it("throws if save fails and does not send email", async () => {
      otpRepo.delete.mockResolvedValueOnce(undefined);
      otpRepo.create.mockImplementationOnce((x: any) => x);
      otpRepo.save.mockRejectedValueOnce(new Error("db"));

      const svc = new AuthService();
      await expect(svc.generateOtp("a@test.com")).rejects.toThrow("db");
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("resolves when OTP is saved even if background sendEmail fails", async () => {
      otpRepo.delete.mockResolvedValueOnce(undefined);
      otpRepo.create.mockImplementationOnce((x: any) => x);
      otpRepo.save.mockResolvedValueOnce(undefined);
      sendEmail.mockRejectedValueOnce(new Error("smtp"));

      const svc = new AuthService();
      await expect(svc.generateOtp("a@test.com")).resolves.toBeUndefined();
      expect(otpRepo.save).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled();
    });
  });

  describe("verifyOtp", () => {
    it("returns false when otp record not found", async () => {
      otpRepo.findOne.mockResolvedValueOnce(null);
      const svc = new AuthService();
      await expect(svc.verifyOtp("a@test.com", "123456")).resolves.toBe(false);
      expect(otpRepo.delete).not.toHaveBeenCalled();
    });

    it("returns false when otp is expired", async () => {
      otpRepo.findOne.mockResolvedValueOnce(null);
      const svc = new AuthService();
      await expect(svc.verifyOtp("a@test.com", "123456")).resolves.toBe(false);
      expect(otpRepo.delete).not.toHaveBeenCalled();
    });

    it("returns true and deletes otp when valid", async () => {
      otpRepo.findOne.mockResolvedValueOnce({
        id: 7,
        expiresAt: new Date("2999-01-01T00:00:00Z"),
      });
      otpRepo.delete.mockResolvedValueOnce(undefined);
      const svc = new AuthService();
      await expect(svc.verifyOtp("a@test.com", "123456")).resolves.toBe(true);
      expect(otpRepo.delete).toHaveBeenCalledWith(7);
    });

    it("propagates errors from repository", async () => {
      otpRepo.findOne.mockRejectedValueOnce(new Error("db"));
      const svc = new AuthService();
      await expect(svc.verifyOtp("a@test.com", "123456")).rejects.toThrow("db");
    });
  });
});

