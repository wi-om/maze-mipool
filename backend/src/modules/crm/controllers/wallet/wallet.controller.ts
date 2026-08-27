import { Request, Response } from "express";
import {
  setWalletAddress,
  checkWalletAddress,
  getActiveWalletByClientid,
  getWalletHistoryByClientid,
  listWalletsByClientid,
  listEuWallets,
} from "../../services/wallet/wallet.service";
import { getWalletLedgerByClientid } from "../../services/wallet/walletLedger.service";
import {
  fetchWalletTxns,
  fetchWalletTxnsByAcNo,
} from "../../services/wallet/walletTxn.service";

function handleWalletError(err: unknown, res: Response) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e?.status ?? 500;
  const message = e?.message ?? "Internal Server Error";
  return res.status(status).json({
    message,
    code: e?.code,
  });
}

export const setWallet = async (req: Request, res: Response) => {
  try {
    const { clientid, address, ip, changedBy, mode } = req.body ?? {};
    if (!clientid) {
      return res.status(400).json({ message: "clientid is required" });
    }
    if (!address || typeof address !== "string") {
      return res.status(400).json({ message: "address is required" });
    }

    const result = await setWalletAddress({
      clientid,
      address,
      ip,
      changedBy,
      mode: mode === "reactivate" ? "reactivate" : "create",
    });

    const statusCode =
      result.action === "created" ? 201 : 200;

    return res.status(statusCode).json({
      message: "Wallet address saved successfully",
      data: result,
    });
  } catch (err) {
    return handleWalletError(err, res);
  }
};

export const checkWallet = async (req: Request, res: Response) => {
  try {
    const { clientid } = req.params;
    const address = req.query.address as string;
    if (!clientid) {
      return res.status(400).json({ message: "clientid is required" });
    }
    if (!address) {
      return res.status(400).json({ message: "address query param is required" });
    }

    const data = await checkWalletAddress(clientid, address);
    return res.status(200).json(data);
  } catch (err) {
    return handleWalletError(err, res);
  }
};

export const getActiveWallet = async (req: Request, res: Response) => {
  try {
    const { clientid } = req.params;
    if (!clientid) {
      return res.status(400).json({ message: "clientid is required" });
    }
    const data = await getActiveWalletByClientid(clientid);
    return res.status(200).json(data);
  } catch (err) {
    return handleWalletError(err, res);
  }
};

export const getWalletHistory = async (req: Request, res: Response) => {
  try {
    const { clientid } = req.params;
    if (!clientid) {
      return res.status(400).json({ message: "clientid is required" });
    }
    const data = await getWalletHistoryByClientid(clientid);
    return res.status(200).json(data);
  } catch (err) {
    return handleWalletError(err, res);
  }
};

export const getEuWallets = async (_req: Request, res: Response) => {
  try {
    const data = await listEuWallets();
    return res.status(200).json({ message: "EU wallets fetched", data });
  } catch (err) {
    return handleWalletError(err, res);
  }
};

export const listWallets = async (req: Request, res: Response) => {
  try {
    const { clientid } = req.params;
    if (!clientid) {
      return res.status(400).json({ message: "clientid is required" });
    }
    const data = await listWalletsByClientid(clientid);
    return res.status(200).json(data);
  } catch (err) {
    return handleWalletError(err, res);
  }
};

export const getWalletLedger = async (req: Request, res: Response) => {
  try {
    const { clientid } = req.params;
    if (!clientid) {
      return res.status(400).json({ message: "clientid is required" });
    }
    const data = await getWalletLedgerByClientid(clientid);
    return res.status(200).json({ message: "Wallet ledger fetched", data });
  } catch (err) {
    return handleWalletError(err, res);
  }
};

export const getWalletTxns = async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, unknown>;
    const result = await fetchWalletTxns({
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 20,
      acNo: typeof q.acNo === "string" ? q.acNo : undefined,
      txnType: q.txnType === "CREDIT" || q.txnType === "DEBIT" ? q.txnType : undefined,
      dateFrom: typeof q.dateFrom === "string" ? q.dateFrom : undefined,
      dateTo: typeof q.dateTo === "string" ? q.dateTo : undefined,
      search: typeof q.search === "string" ? q.search : undefined,
    });
    return res.status(200).json({
      message: "Wallet transactions fetched",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    return handleWalletError(err, res);
  }
};

export const getWalletTxnsByAcNo = async (req: Request, res: Response) => {
  try {
    const { acNo } = req.params;
    if (!acNo?.trim()) {
      return res.status(400).json({ message: "acNo is required" });
    }
    const data = await fetchWalletTxnsByAcNo(acNo.trim());
    return res.status(200).json({ message: "Wallet transactions fetched", data });
  } catch (err) {
    return handleWalletError(err, res);
  }
};
