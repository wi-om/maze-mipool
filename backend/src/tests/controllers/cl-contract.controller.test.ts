import type { Response } from "express";

const clContractRepo = {
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findOneBy: jest.fn(),
  remove: jest.fn(),
};

const appQuery = jest.fn();

jest.mock("@common", () => ({
  AppDataSource: {
    getRepository: jest.fn(() => clContractRepo),
    query: (...args: any[]) => appQuery(...args),
  },
  CLContract: {},
  Account: {},
  Client: {},
}));

import {
  getAllCLContracts,
  getCLContractSummary,
  createCLContract,
  updateCLContract,
  deleteCLContract,
} from "../../modules/crm/controllers/contract/cl-contract.controller";

const jsonMock = jest.fn();
const statusMock = jest.fn().mockReturnThis();
const createRes = (): Response =>
  ({ status: statusMock, json: jsonMock } as unknown as Response);

describe("crm cl-contract.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clContractRepo.create.mockImplementation((x: any) => x);
  });

  describe("getAllCLContracts", () => {
    it("returns 200 with contracts and uses relations+order", async () => {
      clContractRepo.find.mockResolvedValueOnce([{ Id: 1 }]);
      await getAllCLContracts({ user: { id: 1 } } as any, createRes());
      expect(clContractRepo.find).toHaveBeenCalledWith({
        relations: ["Creator", "Modifier"],
        order: { CreatedOn: "DESC" },
      });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith([{ Id: 1 }]);
    });

    it("returns 500 on repo error", async () => {
      clContractRepo.find.mockRejectedValueOnce(new Error("fail"));
      await getAllCLContracts({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });

  describe("getCLContractSummary", () => {
    it("returns 200 with query results", async () => {
      appQuery.mockResolvedValueOnce([{ x: 1 }]);
      await getCLContractSummary({} as any, createRes());
      expect(appQuery).toHaveBeenCalledWith('SELECT * FROM \"CLActiveHashrateSummary\"');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith([{ x: 1 }]);
    });

    it("returns 500 on query error", async () => {
      appQuery.mockRejectedValueOnce(new Error("q"));
      await getCLContractSummary({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal server error" });
    });
  });

  describe("createCLContract", () => {
    it("returns 400 when AcNo or ClientID missing", async () => {
      await createCLContract({ body: {}, user: { id: 1 } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "AcNo and ClientID are required" });
    });

    it("creates contract with default dates + Status=1 when not provided", async () => {
      clContractRepo.save.mockResolvedValueOnce(undefined);

      const req = {
        body: { AcNo: "A", ClientID: "C", Hashrate: 1 },
        user: { id: 9 },
      } as any;

      await createCLContract(req, createRes());

      expect(clContractRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          AcNo: "A",
          ClientID: "C",
          Status: 1,
          CreatedBy: 9,
          ModifiedBy: 9,
          ContractStartDate: expect.any(Date),
          ContractEndDate: expect.any(Date),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: "CL Contract created successfully" })
      );
    });

    it("uses provided Status and parses provided dates", async () => {
      clContractRepo.save.mockResolvedValueOnce(undefined);
      await createCLContract(
        {
          body: {
            AcNo: "A",
            ClientID: "C",
            Status: 0,
            ContractStartDate: "2026-01-01",
            ContractEndDate: "2026-02-01",
          },
          user: { id: 1 },
        } as any,
        createRes()
      );
      expect(clContractRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          Status: 0,
          ContractStartDate: new Date("2026-01-01"),
          ContractEndDate: new Date("2026-02-01"),
        })
      );
    });

    it("returns 500 on repo error", async () => {
      clContractRepo.save.mockRejectedValueOnce(new Error("save"));
      await createCLContract(
        { body: { AcNo: "A", ClientID: "C" }, user: { id: 1 } } as any,
        createRes()
      );
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });

  describe("updateCLContract", () => {
    it("returns 400 when id missing", async () => {
      await updateCLContract({ params: {}, body: {}, user: { id: 1 } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Contract ID is required" });
    });

    it("returns 404 when contract not found", async () => {
      clContractRepo.findOneBy.mockResolvedValueOnce(null);
      await updateCLContract({ params: { id: "1" }, body: {}, user: { id: 1 } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "CL Contract not found" });
    });

    it("updates only provided fields and sets ModifiedBy", async () => {
      const contract: any = { Id: 1, Hashrate: 1, Remark: "x", Status: 1 };
      clContractRepo.findOneBy.mockResolvedValueOnce(contract);
      clContractRepo.save.mockResolvedValueOnce(contract);

      await updateCLContract(
        { params: { id: "1" }, body: { Hashrate: 2, SLA: "s" }, user: { id: 5 } } as any,
        createRes()
      );

      expect(contract.Hashrate).toBe(2);
      expect(contract.SLA).toBe("s");
      expect(contract.ModifiedBy).toBe(5);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: "CL Contract updated successfully", data: contract })
      );
    });

    it("returns 500 on error", async () => {
      clContractRepo.findOneBy.mockRejectedValueOnce(new Error("fail"));
      await updateCLContract({ params: { id: "1" }, body: {}, user: { id: 1 } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });

  describe("deleteCLContract", () => {
    it("returns 400 when id missing", async () => {
      await deleteCLContract({ params: {} } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Contract ID is required" });
    });

    it("returns 404 when not found", async () => {
      clContractRepo.findOneBy.mockResolvedValueOnce(null);
      await deleteCLContract({ params: { id: "1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: "CL Contract not found" });
    });

    it("removes contract and returns 200", async () => {
      const contract = { Id: 1 };
      clContractRepo.findOneBy.mockResolvedValueOnce(contract);
      clContractRepo.remove.mockResolvedValueOnce(undefined);
      await deleteCLContract({ params: { id: "1" } } as any, createRes());
      expect(clContractRepo.remove).toHaveBeenCalledWith(contract);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ message: "CL Contract deleted successfully" });
    });

    it("returns 500 on error", async () => {
      clContractRepo.findOneBy.mockRejectedValueOnce(new Error("fail"));
      await deleteCLContract({ params: { id: "1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal server error" });
    });
  });
});

