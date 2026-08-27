import type { Response } from "express";

const contractRepo = {
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
};

const accountRepo = {
  findOneBy: jest.fn(),
};

jest.mock("../../modules/crm/services/contract/contractSequence.service", () => ({
  syncContractsIdSequence: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@common", () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: any) => {
      if (entity && entity.__type === "Account") return accountRepo;
      return contractRepo;
    }),
  },
  Contract: {},
  Account: { __type: "Account" },
}));

import {
  registerContract,
  createContract,
  getContractStatus,
  updateContractStatus,
  getContract,
  getAllContracts,
} from "../../modules/crm/controllers/contract/contract.controller";

const jsonMock = jest.fn();
const statusMock = jest.fn().mockReturnThis();
const createRes = (): Response =>
  ({ status: statusMock, json: jsonMock } as unknown as Response);

describe("crm contract.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accountRepo.findOneBy.mockReset();
    contractRepo.create.mockImplementation((x: any) => x);
  });

  describe("registerContract", () => {
    it("returns 400 when AcNo missing", async () => {
      await registerContract({ body: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "AcNo is required" });
    });

    it("returns 400 when account does not exist", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce(null);
      await registerContract({ body: { AcNo: "AC1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Invalid AcNo: Account does not exist.",
      });
    });

    it("generates unique MipContractNo (retries on collision) and saves", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy.mockResolvedValueOnce({ MipContractNo: "X" }).mockResolvedValueOnce(null);
      contractRepo.save.mockResolvedValueOnce(undefined);

      await registerContract({ body: { AcNo: "AC1" } } as any, createRes());

      expect(contractRepo.findOneBy).toHaveBeenCalledTimes(2);
      expect(contractRepo.save).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Contract registered successfully in MIPS",
          created: true,
        })
      );
    });

    it("returns existing contract when MccTransactionId already registered", async () => {
      const existing = { Id: 5, AcNo: "AC1", MipContractNo: "MC-EXIST", MccTransactionId: "tx-99" };
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy.mockResolvedValueOnce(existing);

      await registerContract({
        body: { AcNo: "AC1", MccTransactionId: "tx-99" },
      } as any, createRes());

      expect(contractRepo.findOneBy).toHaveBeenCalledWith({ MccTransactionId: "tx-99" });
      expect(contractRepo.save).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Contract already registered for this MCC transaction",
        created: false,
        data: existing,
      });
    });

    it("stores MccTransactionId on new contract registration", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      contractRepo.save.mockResolvedValueOnce(undefined);

      await registerContract({
        body: { AcNo: "AC1", MccTransactionId: "tx-new" },
      } as any, createRes());

      expect(contractRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ MccTransactionId: "tx-new" })
      );
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    it("returns existing contract on MccTransactionId unique violation race", async () => {
      const existing = { Id: 6, AcNo: "AC1", MipContractNo: "MC-RACE", MccTransactionId: "tx-race" };
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);
      contractRepo.save.mockRejectedValueOnce({
        code: "23505",
        detail: 'Key ("MccTransactionId")=(tx-race) already exists.',
      });

      await registerContract({
        body: { AcNo: "AC1", MccTransactionId: "tx-race" },
      } as any, createRes());

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Contract already registered for this MCC transaction",
        created: false,
        data: existing,
      });
    });

    it("returns 500 when repo throws", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy.mockRejectedValueOnce(new Error("db"));
      await registerContract({ body: { AcNo: "AC1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });

    it("ignores blank MccTransactionId and creates contract", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy.mockResolvedValueOnce(null);
      contractRepo.save.mockResolvedValueOnce(undefined);

      await registerContract({
        body: { AcNo: "AC1", MccTransactionId: "   " },
      } as any, createRes());

      expect(contractRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ MccTransactionId: undefined })
      );
      expect(statusMock).toHaveBeenCalledWith(201);
    });
  });

  describe("createContract", () => {
    it("returns 400 when AcNo missing", async () => {
      await createContract({ body: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "AcNo is required." });
    });

    it("returns 400 when account does not exist for AcNo", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce(null);
      await createContract({ body: { AcNo: "ACX" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Invalid AcNo: Account does not exist.",
      });
      expect(contractRepo.create).not.toHaveBeenCalled();
    });

    it("creates contract with default Status=0 when Status is nullish", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy.mockResolvedValueOnce(null);
      contractRepo.save.mockResolvedValueOnce(undefined);

      await createContract({ body: { AcNo: "AC1", Status: undefined } } as any, createRes());

      expect(contractRepo.create).toHaveBeenCalledWith(expect.objectContaining({ Status: 0 }));
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Contract created successfully" })
      );
    });

    it("uses provided Status when given", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy.mockResolvedValueOnce(null);
      await createContract({ body: { AcNo: "AC1", Status: 3 } } as any, createRes());
      expect(contractRepo.create).toHaveBeenCalledWith(expect.objectContaining({ Status: 3 }));
    });

    it("returns 500 when save throws", async () => {
      accountRepo.findOneBy.mockResolvedValueOnce({ AcNo: "AC1" });
      contractRepo.findOneBy.mockResolvedValueOnce(null);
      contractRepo.save.mockRejectedValueOnce(new Error("save"));
      await createContract({ body: { AcNo: "AC1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });

  describe("getContractStatus", () => {
    it("returns 404 when contract not found", async () => {
      contractRepo.findOneBy.mockResolvedValueOnce(null);
      await getContractStatus({ params: { id: "1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Contract not found" });
    });

    it("returns statusText mapping for known statuses", async () => {
      contractRepo.findOneBy.mockResolvedValueOnce({ Id: 1, Status: 2 });
      await getContractStatus({ params: { id: "1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 2, statusText: "Active" })
      );
    });

    it("returns statusText=Unknown for unexpected status", async () => {
      contractRepo.findOneBy.mockResolvedValueOnce({ Id: 1, Status: 999 });
      await getContractStatus({ params: { id: "1" } } as any, createRes());
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ statusText: "Unknown" })
      );
    });
  });

  describe("updateContractStatus", () => {
    it("returns 400 for non-number status", async () => {
      await updateContractStatus({ params: { id: "1" }, body: { status: "1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Invalid status code" });
    });

    it("returns 400 for status out of range", async () => {
      await updateContractStatus({ params: { id: "1" }, body: { status: 5 } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 404 when contract not found", async () => {
      contractRepo.findOneBy.mockResolvedValueOnce(null);
      await updateContractStatus({ params: { id: "1" }, body: { status: 1 } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Contract not found" });
    });

    it("updates status and returns statusText", async () => {
      const contract = { Id: 1, Status: 0, ModifiedOn: new Date(0) };
      contractRepo.findOneBy.mockResolvedValueOnce(contract);
      contractRepo.save.mockResolvedValueOnce(contract);

      await updateContractStatus({ params: { id: "1" }, body: { status: 4 } } as any, createRes());

      expect(contract.Status).toBe(4);
      expect(contractRepo.save).toHaveBeenCalledWith(contract);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 4, statusText: "Cancelled" })
      );
    });

    it("returns 500 on repo error", async () => {
      contractRepo.findOneBy.mockRejectedValueOnce(new Error("db"));
      await updateContractStatus({ params: { id: "1" }, body: { status: 1 } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });

  describe("getContract", () => {
    it("returns 404 when not found", async () => {
      contractRepo.findOne.mockResolvedValueOnce(null);
      await getContract({ params: { id: "1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
    });

    it("returns 200 with contract when found and requests relations", async () => {
      const contract = { Id: 1 };
      contractRepo.findOne.mockResolvedValueOnce(contract);
      await getContract({ params: { id: "1" } } as any, createRes());
      expect(contractRepo.findOne).toHaveBeenCalledWith({
        where: { Id: 1 },
        relations: ["account"],
      });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(contract);
    });

    it("returns 500 on error", async () => {
      contractRepo.findOne.mockRejectedValueOnce(new Error("fail"));
      await getContract({ params: { id: "1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe("getAllContracts", () => {
    it("returns 200 with contracts and relations", async () => {
      contractRepo.find.mockResolvedValueOnce([{ Id: 1 }]);
      await getAllContracts({} as any, createRes());
      expect(contractRepo.find).toHaveBeenCalledWith({ relations: ["account"] });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith([{ Id: 1 }]);
    });

    it("returns 500 on error", async () => {
      contractRepo.find.mockRejectedValueOnce(new Error("fail"));
      await getAllContracts({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });
});

