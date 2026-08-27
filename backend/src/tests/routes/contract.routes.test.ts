import router from "../../modules/crm/routes/contract/contract.routes";
import { verifyMipsToken } from "@common";
import {
  createContract,
  getContractStatus,
  updateContractStatus,
  getContract,
  getAllContracts,
  registerContract,
} from "../../modules/crm/controllers/contract/contract.controller";
import {
  getAllCLContracts,
  createCLContract,
  updateCLContract,
  getCLContractSummary,
  deleteCLContract,
} from "../../modules/crm/controllers/contract/cl-contract.controller";

jest.mock("@common", () => ({
  verifyMipsToken: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock("../../modules/crm/controllers/contract/contract.controller", () => ({
  createContract: jest.fn(),
  getContractStatus: jest.fn(),
  updateContractStatus: jest.fn(),
  getContract: jest.fn(),
  getAllContracts: jest.fn(),
  registerContract: jest.fn(),
}));

jest.mock("../../modules/crm/controllers/contract/cl-contract.controller", () => ({
  getAllCLContracts: jest.fn(),
  createCLContract: jest.fn(),
  updateCLContract: jest.fn(),
  getCLContractSummary: jest.fn(),
  deleteCLContract: jest.fn(),
}));

describe("routes/crm.contract.contract.routes", () => {
  const getHandlers = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers GET /cl with verifyMipsToken", () => {
    const handlers = getHandlers("/cl", "get");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(getAllCLContracts);
  });

  it("registers GET /cl/summary with verifyMipsToken", () => {
    const handlers = getHandlers("/cl/summary", "get");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(getCLContractSummary);
  });

  it("registers POST /cl with verifyMipsToken", () => {
    const handlers = getHandlers("/cl", "post");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(createCLContract);
  });

  it("registers PATCH /cl/:id with verifyMipsToken", () => {
    const handlers = getHandlers("/cl/:id", "patch");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(updateCLContract);
  });

  it("registers DELETE /cl/:id with verifyMipsToken", () => {
    const handlers = getHandlers("/cl/:id", "delete");
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(verifyMipsToken);
    expect(handlers[1]).toBe(deleteCLContract);
  });

  it("registers POST /create", () => {
    const handlers = getHandlers("/create", "post");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(createContract);
  });

  it("registers POST /register", () => {
    const handlers = getHandlers("/register", "post");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(registerContract);
  });

  it("registers GET /:id/status", () => {
    const handlers = getHandlers("/:id/status", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getContractStatus);
  });

  it("registers PATCH /:id/status", () => {
    const handlers = getHandlers("/:id/status", "patch");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(updateContractStatus);
  });

  it("registers GET /:id", () => {
    const handlers = getHandlers("/:id", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getContract);
  });

  it("registers GET /", () => {
    const handlers = getHandlers("/", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getAllContracts);
  });
});

