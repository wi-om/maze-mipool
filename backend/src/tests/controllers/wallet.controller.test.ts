import type { Response } from "express";

const fetchWalletTxns = jest.fn();
const fetchWalletTxnsByAcNo = jest.fn();

jest.mock("../../modules/crm/services/wallet/walletTxn.service", () => ({
  fetchWalletTxns: (...args: unknown[]) => fetchWalletTxns(...args),
  fetchWalletTxnsByAcNo: (...args: unknown[]) => fetchWalletTxnsByAcNo(...args),
}));

import { getWalletTxns, getWalletTxnsByAcNo } from "../../modules/crm/controllers/wallet/wallet.controller";

const jsonMock = jest.fn();
const statusMock = jest.fn().mockReturnThis();

const createRes = (): Response =>
  ({ status: statusMock, json: jsonMock } as unknown as Response);

describe("wallet.controller txn endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getWalletTxns", () => {
    it("returns paginated wallet transactions", async () => {
      fetchWalletTxns.mockResolvedValueOnce({
        data: [{ id: 1, acNo: "MI93691918", txnType: "CREDIT" }],
        pagination: { page: 1, limit: 20, totalRecords: 1, totalDays: 1, totalPages: 1 },
      });

      await getWalletTxns(
        { query: { page: "2", limit: "10", acNo: "MI93691918", txnType: "CREDIT" } } as any,
        createRes(),
      );

      expect(fetchWalletTxns).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        acNo: "MI93691918",
        txnType: "CREDIT",
        dateFrom: undefined,
        dateTo: undefined,
        search: undefined,
      });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Wallet transactions fetched",
          data: expect.any(Array),
          pagination: expect.objectContaining({ totalRecords: 1 }),
        }),
      );
    });
  });

  describe("getWalletTxnsByAcNo", () => {
    it("returns 400 when acNo missing", async () => {
      await getWalletTxnsByAcNo({ params: { acNo: "  " } } as any, createRes());
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(fetchWalletTxnsByAcNo).not.toHaveBeenCalled();
    });

    it("returns transactions for acNo", async () => {
      fetchWalletTxnsByAcNo.mockResolvedValueOnce([{ id: 1 }]);
      await getWalletTxnsByAcNo({ params: { acNo: "MI93691918" } } as any, createRes());
      expect(fetchWalletTxnsByAcNo).toHaveBeenCalledWith("MI93691918");
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });
});
