import router from "../../modules/crm/routes/clients/client.routes";
import {
  registerClient,
  getClients,
} from "../../modules/crm/controllers/clients/client.controller";

jest.mock("../../modules/crm/controllers/clients/client.controller", () => ({
  registerClient: jest.fn(),
  getClients: jest.fn(),
}));

describe("routes/crm.clients.client.routes", () => {
  const getHandlers = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route && entry.route.path === path && entry.route.methods[method]
    );
    expect(layer).toBeDefined();
    return layer.route.stack.map((s: any) => s.handle);
  };

  it("registers GET /", () => {
    const handlers = getHandlers("/", "get");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(getClients);
  });

  it("registers POST /register", () => {
    const handlers = getHandlers("/register", "post");
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(registerClient);
  });
});

