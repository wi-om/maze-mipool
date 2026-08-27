import type { Response } from "express";

const accountRepo = {
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

jest.mock("@common", () => ({
  AppDataSource: {
    getRepository: jest.fn(() => accountRepo),
  },
  Account: {},
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid"),
}));

import {
  registerAccount,
  getAccountByClientid,
  getAllAccounts,
} from "../../modules/crm/controllers/account/account.controller";

const jsonMock = jest.fn();
const statusMock = jest.fn().mockReturnThis();

const createRes = (): Response =>
  ({ status: statusMock, json: jsonMock } as unknown as Response);

describe("crm account.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("registerAccount", () => {
    it("returns 400 when Parent is missing", async () => {
      await registerAccount({ body: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Parent (clientid) is required" });
      expect(accountRepo.findOneBy).not.toHaveBeenCalled();
    });

    it("defaults Type to EU and Status to 1", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce(null);
      accountRepo.create.mockImplementationOnce((x: any) => x);
      accountRepo.save.mockResolvedValueOnce(undefined);

      const req = { body: { Parent: "client-1" } } as any;
      await registerAccount(req, createRes());

      expect(accountRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          Parent: "client-1",
          Type: "EU",
          Status: 1,
          Key: "mock-uuid",
          AcNo: expect.stringMatching(/^MI\d{8}$/),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Account registered successfully in MIPS" })
      );
    });

    it("returns 409 when duplicate Parent exists", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ Parent: "client-1" });
      await registerAccount({ body: { Parent: "client-1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Account with this Parent (clientid) already exists",
        data: { Parent: "client-1" },
      });
      expect(accountRepo.create).not.toHaveBeenCalled();
      expect(accountRepo.save).not.toHaveBeenCalled();
    });

    it("uses provided Type and Status when given", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce(null);
      accountRepo.create.mockImplementationOnce((x: any) => x);

      await registerAccount(
        { body: { Parent: "client-2", Type: "X", Status: 0 } } as any,
        createRes()
      );

      expect(accountRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ Type: "X", Status: 0 })
      );
    });

    it("returns 500 on repository error", async () => {
      accountRepo.findOneBy.mockRejectedValueOnce(new Error("db fail"));
      await registerAccount({ body: { Parent: "client-1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });

    it("returns 500 when save throws", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce(null);
      accountRepo.create.mockImplementationOnce((x: any) => x);
      accountRepo.save.mockRejectedValueOnce(new Error("save fail"));

      await registerAccount({ body: { Parent: "client-1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });

  describe("getAccountByClientid", () => {
    it("returns 404 when no account found", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce(null);
      await getAccountByClientid({ params: { clientid: "c1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "No account found for this clientid" });
    });

    it("returns account info when found", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ ID: 1, AcNo: "MI12345678", Parent: "c1" });
      await getAccountByClientid({ params: { clientid: "c1" } } as any, createRes());
      expect(jsonMock).toHaveBeenCalledWith({ id: 1, acNo: "MI12345678", parent: "c1" });
    });
  });

  describe("getAllAccounts", () => {
    it("returns 200 with accounts ordered by CreatedOn desc", async () => {
      accountRepo.find.mockResolvedValueOnce([{ AcNo: "A" }]);
      await getAllAccounts({} as any, createRes());
      expect(accountRepo.find).toHaveBeenCalledWith({ order: { CreatedOn: "DESC" } });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith([{ AcNo: "A" }]);
    });

    it("returns 500 with error.message when find throws", async () => {
      accountRepo.find.mockRejectedValueOnce(new Error("boom"));
      await getAllAccounts({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ error: "boom" });
    });
  });
});

