import type { Response } from "express";
import jwt from "jsonwebtoken";

type AuthUser = { id: number; email: string };

jest.mock("@common", () => {
  const userRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  (globalThis as any).__msApiUserRepo = userRepo;
  return {
    AppDataSource: {
      getRepository: jest.fn(() => userRepo),
    },
    MipsUser: {},
  };
});

jest.mock("../../modules/auth/service/auth.service", () => {
  const authServiceMocks = {
    generateOtp: jest.fn().mockResolvedValue(undefined),
    verifyOtp: jest.fn(),
  };
  (globalThis as any).__msApiAuthServiceMocks = authServiceMocks;
  return {
    AuthService: jest.fn(function () {
      return authServiceMocks;
    }),
  };
});

jest.mock("jsonwebtoken", () => ({
  __esModule: true,
  default: {
    sign: jest.fn(() => "mock.jwt.token"),
  },
}));

import {
  getMe,
  signup,
  login,
  verifyOtp as verifyOtpHandler,
} from "../../modules/auth/controllers/auth/auth.controller";

const userRepo = (globalThis as any).__msApiUserRepo as {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

const authServiceMocks = (globalThis as any).__msApiAuthServiceMocks as {
  generateOtp: jest.Mock;
  verifyOtp: jest.Mock;
};

type TestAuthRequest = { body: Record<string, unknown>; user?: AuthUser };

const jsonMock = jest.fn();
const statusMock = jest.fn().mockReturnThis();

const createRes = (): Response =>
  ({
    status: statusMock,
    json: jsonMock,
  }) as unknown as Response;

const createReq = (body: Record<string, unknown> = {}, user?: AuthUser): TestAuthRequest =>
  user !== undefined ? { body, user } : { body };

describe("auth.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authServiceMocks.generateOtp.mockResolvedValue(undefined);
    authServiceMocks.verifyOtp.mockReset();
  });

  describe("module init", () => {
    it("throws if JWT_SECRET is missing when module is evaluated", () => {
      const original = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      jest.resetModules();

      expect(() => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("../../modules/auth/controllers/auth/auth.controller");
        });
      }).toThrow("JWT_SECRET is not defined in environment variables!");

      process.env.JWT_SECRET = original;
    });
  });

  describe("getMe", () => {
    it("returns 401 when req.user is missing", async () => {
      const req = createReq({}, undefined) as any;
      delete (req as any).user;

      await getMe(req, createRes());

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it("returns 404 when user id from token is not in database", async () => {
      userRepo.findOne.mockResolvedValueOnce(null);
      const req = createReq({}, { id: 99, email: "x@test.com" }) as any;

      await getMe(req, createRes());

      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 99 } });
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "User not found" });
    });

    it("returns 200 with user when found", async () => {
      const dbUser = { id: 1, name: "A", email: "a@test.com" };
      userRepo.findOne.mockResolvedValueOnce(dbUser);
      const req = createReq({}, { id: 1, email: "a@test.com" }) as any;

      await getMe(req, createRes());

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ user: dbUser });
    });

    it("returns 500 when findOne throws", async () => {
      userRepo.findOne.mockRejectedValueOnce(new Error("db down"));
      const req = createReq({}, { id: 1, email: "a@test.com" }) as any;

      await getMe(req, createRes());

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "db down" });
    });
  });

  describe("signup", () => {
    it("returns 400 when name is missing", async () => {
      await signup(createReq({ email: "e@test.com" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Name and email are required" });
    });

    it("returns 400 when email is missing", async () => {
      await signup(createReq({ name: "N" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Name and email are required" });
    });

    it("returns 400 when both name and email are missing", async () => {
      await signup(createReq({}) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 when name is empty string", async () => {
      await signup(createReq({ name: "", email: "e@test.com" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 when email is empty string", async () => {
      await signup(createReq({ name: "N", email: "" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 when user already exists", async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: 1, email: "dup@test.com" });
      await signup(createReq({ name: "N", email: "dup@test.com" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "User already exists" });
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it("returns 201 and created user on success", async () => {
      userRepo.findOne.mockResolvedValueOnce(null);
      const created = { id: 42, name: "New", email: "new@test.com" };
      userRepo.create.mockReturnValueOnce(created);
      userRepo.save.mockResolvedValueOnce(created);

      await signup(createReq({ name: "New", email: "new@test.com" }) as any, createRes());

      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { email: "new@test.com" } });
      expect(userRepo.create).toHaveBeenCalledWith({ name: "New", email: "new@test.com" });
      expect(userRepo.save).toHaveBeenCalledWith(created);
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "User created successfully",
        user: created,
      });
    });

    it("returns 500 when findOne throws", async () => {
      userRepo.findOne.mockRejectedValueOnce(new Error("query failed"));
      await signup(createReq({ name: "N", email: "e@test.com" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "query failed" });
    });

    it("returns 500 when save throws", async () => {
      userRepo.findOne.mockResolvedValueOnce(null);
      userRepo.create.mockReturnValueOnce({ name: "N", email: "e@test.com" });
      userRepo.save.mockRejectedValueOnce(new Error("unique constraint"));

      await signup(createReq({ name: "N", email: "e@test.com" }) as any, createRes());

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "unique constraint" });
    });

    it("returns 500 when create throws", async () => {
      userRepo.findOne.mockResolvedValueOnce(null);
      userRepo.create.mockImplementationOnce(() => {
        throw new Error("create failed");
      });

      await signup(createReq({ name: "N", email: "e@test.com" }) as any, createRes());

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "create failed" });
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("returns 400 when email is missing", async () => {
      await login(createReq({}) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Email is required" });
    });

    it("returns 400 when email is empty string", async () => {
      await login(createReq({ email: "" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(authServiceMocks.generateOtp).not.toHaveBeenCalled();
    });

    it("returns 404 when user not found", async () => {
      userRepo.findOne.mockResolvedValueOnce(null);
      await login(createReq({ email: "ghost@test.com" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "User not found" });
      expect(authServiceMocks.generateOtp).not.toHaveBeenCalled();
    });

    it("returns 200 and sends OTP when user exists", async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: 1, email: "ok@test.com" });
      await login(createReq({ email: "ok@test.com" }) as any, createRes());
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { email: "ok@test.com" } });
      expect(authServiceMocks.generateOtp).toHaveBeenCalledWith("ok@test.com");
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ message: "OTP sent to email" });
    });

    it("returns 500 when generateOtp rejects", async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: 1, email: "ok@test.com" });
      authServiceMocks.generateOtp.mockRejectedValueOnce(new Error("smtp error"));
      await login(createReq({ email: "ok@test.com" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "smtp error" });
    });

    it("returns 500 when findOne throws", async () => {
      userRepo.findOne.mockRejectedValueOnce(new Error("db error"));
      await login(createReq({ email: "x@test.com" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "db error" });
    });

    it("returns 200 with JWT on password login", async () => {
      const hash = "a".repeat(64);
      const user = { id: 3, name: "U", email: "u@test.com", Password: hash };
      userRepo.findOne.mockResolvedValueOnce(user);
      await login(createReq({ email: "u@test.com", Password: hash }) as any, createRes());
      expect(authServiceMocks.generateOtp).not.toHaveBeenCalled();
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 3, email: "u@test.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" },
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Login successful",
          token: "mock.jwt.token",
          user: expect.not.objectContaining({ Password: expect.anything() }),
        }),
      );
    });

    it("issues 2d JWT when rememberMe is true (legacy)", async () => {
      const hash = "a".repeat(64);
      userRepo.findOne.mockResolvedValueOnce({
        id: 3,
        email: "u@test.com",
        Password: hash,
      });
      await login(
        createReq({ email: "u@test.com", Password: hash, rememberMe: true }) as any,
        createRes(),
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 3, email: "u@test.com" },
        process.env.JWT_SECRET,
        { expiresIn: "2d" },
      );
    });

    it("issues Nd JWT for allowed sessionDays", async () => {
      const hash = "a".repeat(64);
      userRepo.findOne.mockResolvedValueOnce({
        id: 3,
        email: "u@test.com",
        Password: hash,
      });
      await login(
        createReq({ email: "u@test.com", Password: hash, sessionDays: 7 }) as any,
        createRes(),
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 3, email: "u@test.com" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );
    });

    it("falls back to 1d for invalid sessionDays", async () => {
      const hash = "a".repeat(64);
      userRepo.findOne.mockResolvedValueOnce({
        id: 3,
        email: "u@test.com",
        Password: hash,
      });
      await login(
        createReq({ email: "u@test.com", Password: hash, sessionDays: 99 }) as any,
        createRes(),
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 3, email: "u@test.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" },
      );
    });

    it("returns 401 when password hash does not match", async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: 1,
        email: "u@test.com",
        Password: "a".repeat(64),
      });
      await login(
        createReq({ email: "u@test.com", Password: "b".repeat(64) }) as any,
        createRes(),
      );
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("returns 400 when Password is not valid SHA256 hex", async () => {
      await login(createReq({ email: "u@test.com", Password: "not-a-hash" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe("verifyOtp", () => {
    it("returns 400 when email is missing", async () => {
      await verifyOtpHandler(createReq({ otp: "123456" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Email and OTP are required" });
    });

    it("returns 400 when otp is missing", async () => {
      await verifyOtpHandler(createReq({ email: "a@test.com" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 when both email and otp are missing", async () => {
      await verifyOtpHandler(createReq({}) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 when otp is empty string", async () => {
      await verifyOtpHandler(createReq({ email: "a@test.com", otp: "" }) as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(authServiceMocks.verifyOtp).not.toHaveBeenCalled();
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it("returns 400 when OTP is invalid or expired", async () => {
      authServiceMocks.verifyOtp.mockResolvedValueOnce(false);
      await verifyOtpHandler(
        createReq({ email: "a@test.com", otp: "000000" }) as any,
        createRes()
      );
      expect(authServiceMocks.verifyOtp).toHaveBeenCalledWith("a@test.com", "000000");
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Invalid or expired OTP" });
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it("returns 404 when OTP valid but user missing (edge case)", async () => {
      authServiceMocks.verifyOtp.mockResolvedValueOnce(true);
      userRepo.findOne.mockResolvedValueOnce(null);
      await verifyOtpHandler(
        createReq({ email: "orphan@test.com", otp: "111111" }) as any,
        createRes()
      );
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "User not found" });
    });

    it("returns 200 with user and JWT on success", async () => {
      authServiceMocks.verifyOtp.mockResolvedValueOnce(true);
      const user = { id: 7, name: "U", email: "u@test.com" };
      userRepo.findOne.mockResolvedValueOnce(user);

      await verifyOtpHandler(
        createReq({ email: "u@test.com", otp: "654321" }) as any,
        createRes()
      );

      expect(authServiceMocks.verifyOtp).toHaveBeenCalledWith("u@test.com", "654321");
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { email: "u@test.com" } });
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 7, email: "u@test.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );
      expect(jwt.sign).toHaveBeenCalledTimes(1);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Login successful",
        user,
        token: "mock.jwt.token",
      });
    });

    it("returns 500 when verifyOtp throws", async () => {
      authServiceMocks.verifyOtp.mockRejectedValueOnce(new Error("otp service down"));
      await verifyOtpHandler(
        createReq({ email: "a@test.com", otp: "123456" }) as any,
        createRes()
      );
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "otp service down" });
    });

    it("returns 500 when findOne throws after OTP verified", async () => {
      authServiceMocks.verifyOtp.mockResolvedValueOnce(true);
      userRepo.findOne.mockRejectedValueOnce(new Error("read fail"));
      await verifyOtpHandler(
        createReq({ email: "a@test.com", otp: "123456" }) as any,
        createRes()
      );
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "read fail" });
    });

    it("returns 500 when jwt.sign throws", async () => {
      authServiceMocks.verifyOtp.mockResolvedValueOnce(true);
      userRepo.findOne.mockResolvedValueOnce({ id: 1, email: "u@test.com" });
      (jwt.sign as jest.Mock).mockImplementationOnce(() => {
        throw new Error("sign failed");
      });

      await verifyOtpHandler(
        createReq({ email: "u@test.com", otp: "123456" }) as any,
        createRes()
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "sign failed" });
    });
  });
});
