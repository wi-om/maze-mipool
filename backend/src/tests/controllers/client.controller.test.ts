import type { Response } from "express";

const clientRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

jest.mock("@common", () => ({
  AppDataSource: { getRepository: jest.fn(() => clientRepo) },
  Client: {},
}));

import { registerClient, getClients } from "../../modules/crm/controllers/clients/client.controller";

const jsonMock = jest.fn();
const statusMock = jest.fn().mockReturnThis();

const createRes = (): Response =>
  ({ status: statusMock, json: jsonMock } as unknown as Response);

describe("crm client.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("registerClient", () => {
    it("returns 400 when ClientID missing", async () => {
      await registerClient({ body: { AdminEmail: "a@b.com" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: "ClientID and AdminEmail are required" });
      expect(clientRepo.create).not.toHaveBeenCalled();
    });

    it("returns 400 when AdminEmail missing", async () => {
      await registerClient({ body: { ClientID: "c1" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("creates client with generated 10-digit MIPSAcNo", async () => {
      const mockMath = jest.spyOn(Math, "random").mockReturnValue(0); // -> 1000000000
      clientRepo.create.mockImplementationOnce((x: any) => x);
      clientRepo.save.mockResolvedValueOnce(undefined);

      await registerClient({ body: { ClientID: "c1", AdminEmail: "a@b.com" } } as any, createRes());

      expect(clientRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ClientID: "c1",
          AdminEmail: "a@b.com",
          MIPSAcNo: "1000000000",
          CreatedOn: expect.any(Date),
          ModifiedOn: expect.any(Date),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Client registered successfully" })
      );
      mockMath.mockRestore();
    });

    it("returns 500 on repository error", async () => {
      clientRepo.create.mockImplementationOnce(() => {
        throw new Error("create failed");
      });
      await registerClient({ body: { ClientID: "c1", AdminEmail: "a@b.com" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });

    it("returns 500 when save throws", async () => {
      clientRepo.create.mockImplementationOnce((x: any) => x);
      clientRepo.save.mockRejectedValueOnce(new Error("save fail"));
      await registerClient({ body: { ClientID: "c1", AdminEmail: "a@b.com" } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });

  describe("getClients", () => {
    it("returns 200 with data wrapper", async () => {
      clientRepo.find.mockResolvedValueOnce([{ ClientID: "c1" }]);
      await getClients({} as any, createRes());
      expect(clientRepo.find).toHaveBeenCalledWith({ order: { CreatedOn: "DESC" } });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ data: [{ ClientID: "c1" }] });
    });

    it("returns 500 on find error", async () => {
      clientRepo.find.mockRejectedValueOnce(new Error("fail"));
      await getClients({} as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: "Internal Server Error" });
    });
  });
});

