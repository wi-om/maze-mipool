import { Request, Response } from "express";
import {
  commitManualPayout,
  getPendingClients,
  getPendingPayoutBundle,
  getPendingSummary,
  previewManualPayout,
} from "../../service/manualPayout.service";
import { validatePayoutTxid } from "../../service/payoutTxid.util";
import { validatePaidThroughDate } from "../../service/payoutWorkDate.util";
import {
  normalizeTxidFeeUpdates,
  parseTxidFeeCsv,
  importAndDeductPayoutTxidFees,
  applyPayoutTxidFeeDeduction,
  syncPayoutFeesFromPeriod,
  type TxidFeeDeductionMode,
} from "../../service/payoutTxidFee";
import { AppDataSource } from "@common";
import { UserAppDataSource } from "@common";
import { buildCacheKey, readThroughCache, invalidateCachePrefix } from "@common";
import { Payout } from "@common";
import { Account } from "@common";
import { User } from "@common";
import { In, Like } from "typeorm";
import {
  importBlockchainTxBatchToDb,
  importBlockchainTxToDb,
  previewBlockchainTx,
  parseTxidsFromText,
  buildCompareResult,
  fetchBlockchainPayoutList,
  fetchPayoutAddressIssues,
  fetchDailyReconciliation,
} from "@blockchainData";

/** Plain JSON row so clients always receive Parent/ClientID (TypeORM may omit joined `account` on serialize). */
export type PayoutApiRow = {
  Id: number;
  AcNo: string;
  mipContractNo: string;
  Amount?: number | string | null;
  txid?: string | null;
  txidFee?: number | string | null;
  txidFeeDeducted?: boolean;
  CreatedOn?: Date | string | null;
  paidThroughDate?: string | Date | null;
  Status: string;
  ToAddr: string;
  account: { Parent: string | null; ClientID: string | null } | null;
};

function accountPayload(a: Account | null | undefined): { Parent: string | null; ClientID: string | null } | null {
  if (!a) return null;
  return {
    Parent: a.Parent ?? null,
    ClientID: a.ClientID ?? null,
  };
}

/**
 * Attach `account` from DB by AcNo. Relation `find({ relations })` does not always appear in JSON for Payout.
 */
export async function serializePayoutsForApi(payouts: Payout[]): Promise<PayoutApiRow[]> {
  if (!payouts.length) return [];
  // Use AcNo as returned from Payouts row (char(12) may be space-padded in DB)
  const acNos = [...new Set(payouts.map((p) => p.AcNo).filter((x): x is string => Boolean(x)))];
  const accountRepo = AppDataSource.getRepository(Account);
  const accounts = await accountRepo.find({
    where: { AcNo: In(acNos) },
    select: ["AcNo", "Parent", "ClientID"],
  });
  const byAcNo = new Map<string, Account>();
  for (const a of accounts) {
    const raw = a.AcNo ?? "";
    byAcNo.set(raw, a);
    byAcNo.set(raw.trim(), a);
  }

  return payouts.map((p) => {
    const raw = p.AcNo ?? "";
    const acc = p.account ?? byAcNo.get(raw) ?? byAcNo.get(raw.trim());
    return {
      Id: p.Id,
      AcNo: p.AcNo,
      mipContractNo: p.mipContractNo,
      Amount: p.Amount,
      txid: p.txid,
      txidFee: p.txidFee,
      txidFeeDeducted: p.txidFeeDeducted ?? false,
      CreatedOn: p.CreatedOn,
      paidThroughDate: p.paidThroughDate ?? null,
      Status: p.Status,
      ToAddr: p.ToAddr,
      account: accountPayload(acc),
    };
  });
}

export const getAllPayouts = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string || "").trim();
    const payoutRepo = AppDataSource.getRepository(Payout);

    if (!search) {
      const cacheKey = buildCacheKey("payouts", { view: "all" });
      const data = await readThroughCache(cacheKey, 60, async () => {
        const payouts = await payoutRepo.find({
          order: { CreatedOn: "DESC" },
        });
        return serializePayoutsForApi(payouts);
      });
      return res.status(200).json({ message: "All payouts fetched", data });
    }

    console.log("[payouts-search] Searching for:", search);

    // Search by email, phone, or clientid in User table (UserAppDataSource = mcdb)
    const userRepo = UserAppDataSource.getRepository(User);
    const matchingUsers = await userRepo.find({
      where: [
        { email: search },
        { mobile: search },
        { clientid: search },
      ],
      select: ["clientid", "email", "mobile"],
    });

    console.log("[payouts-search] Matching users found:", matchingUsers.length, matchingUsers);

    const clientIds = matchingUsers
      .map((u) => u.clientid)
      .filter((id) => !!id);

    console.log("[payouts-search] Client IDs to look up:", clientIds);

    if (clientIds.length === 0) {
      // No users matched — also try matching directly against contract number
      console.log("[payouts-search] No users found, falling back to mipContractNo search");
      const directPayouts = await payoutRepo.find({
        where: [
          { mipContractNo: Like(`%${search}%`) },
        ],
        relations: ["account"],
        order: { CreatedOn: "DESC" },
      });
      console.log("[payouts-search] Direct contract payouts found:", directPayouts.length);
      const data = await serializePayoutsForApi(directPayouts);
      return res.status(200).json({ message: "Payouts fetched", data });
    }

    // Find Account records — NOTE: Account.Parent stores the clientid (not Account.ClientID)
    const accountRepo = AppDataSource.getRepository(Account);
    const matchingAccounts = await accountRepo.find({
      where: clientIds.map((cid) => ({ Parent: cid })),
      select: ["AcNo", "Parent", "ClientID"],
    });

    console.log("[payouts-search] Matching accounts found:", matchingAccounts.length, matchingAccounts);

    const acNos = matchingAccounts.map((a) => a.AcNo).filter((a) => !!a);

    console.log("[payouts-search] AcNos to search payouts:", acNos);

    if (acNos.length === 0) {
      return res.status(200).json({ message: "No payouts found for search", data: [] });
    }

    // Find payouts for matching AcNo values
    const payouts = await payoutRepo.find({
      where: { AcNo: In(acNos) },
      relations: ["account"],
      order: { CreatedOn: "DESC" },
    });

    console.log("[payouts-search] Payouts found:", payouts.length);

    const data = await serializePayoutsForApi(payouts);
    return res.status(200).json({ message: "Payouts fetched", data });
  } catch (err: any) {
    console.error("[payouts-search] Error:", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};


function parsePaidThroughQuery(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const validated = validatePaidThroughDate(String(value));
  if (!validated.ok) {
    throw Object.assign(new Error(validated.error), { status: 400 });
  }
  return validated.value;
}

/** GET /api/payouts/pending — summary + clients in one batched load */
export const getPayoutPending = async (req: Request, res: Response) => {
  try {
    const paidThroughDate = parsePaidThroughQuery(req.query.paidThroughDate);
    const cacheKey = buildCacheKey("payouts:pending", {
      paidThroughDate: paidThroughDate ?? "default",
    });
    const data = await readThroughCache(cacheKey, 30, () => getPendingPayoutBundle(paidThroughDate));
    return res.status(200).json({ message: "Payout pending data", data });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[payout-pending]", err);
    return res.status(status).json({ error: err.message });
  }
};

/** GET /api/payouts/summary → manualPayout.getPendingSummary() */
export const getPayoutSummary = async (req: Request, res: Response) => {
  try {
    const paidThroughDate = parsePaidThroughQuery(req.query.paidThroughDate);
    const cacheKey = buildCacheKey("payouts:summary", {
      paidThroughDate: paidThroughDate ?? "default",
    });
    const data = await readThroughCache(cacheKey, 30, () => getPendingSummary(paidThroughDate));
    return res.status(200).json({ message: "Payout summary", data });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[payout-summary]", err);
    return res.status(status).json({ error: err.message });
  }
};

/** GET /api/payouts/clients → manualPayout.getPendingClients() */
export const getPayoutClients = async (req: Request, res: Response) => {
  try {
    const paidThroughDate = parsePaidThroughQuery(req.query.paidThroughDate);
    const data = await getPendingClients(paidThroughDate);
    return res.status(200).json({ message: "Payout clients", data });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[payout-clients]", err);
    return res.status(status).json({ error: err.message });
  }
};

/** POST /api/payouts/preview → manualPayout.previewManualPayout(acNos) */
export const previewPayout = async (req: Request, res: Response) => {
  try {
    const acNos = Array.isArray(req.body?.acNos) ? req.body.acNos : [];
    if (!acNos.length) {
      return res.status(400).json({ error: "acNos array is required" });
    }
    const paidThroughDate =
      req.body?.paidThroughDate != null
        ? (() => {
            const v = validatePaidThroughDate(String(req.body.paidThroughDate));
            if (!v.ok) throw Object.assign(new Error(v.error), { status: 400 });
            return v.value;
          })()
        : undefined;
    const data = await previewManualPayout(acNos, paidThroughDate);
    return res.status(200).json({ message: "Payout preview", data });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[payout-preview]", err);
    return res.status(status).json({ error: err.message });
  }
};

/** POST /api/payouts/complete → manualPayout.commitManualPayout({ acNos, txid }) */
export const completePayout = async (req: Request, res: Response) => {
  try {
    const { acNos, txid, paidThroughDate, createdOn, txidFee } = req.body ?? {};
    if (!Array.isArray(acNos) || !acNos.length) {
      return res.status(400).json({ error: "acNos array is required" });
    }
    const txidResult = validatePayoutTxid(txid ?? "");
    if (!txidResult.ok) {
      return res.status(400).json({ error: txidResult.error });
    }
    let resolvedPaidThrough: string | undefined;
    if (paidThroughDate != null && paidThroughDate !== "") {
      const v = validatePaidThroughDate(String(paidThroughDate));
      if (!v.ok) return res.status(400).json({ error: v.error });
      resolvedPaidThrough = v.value;
    }
    const result = await commitManualPayout({
      acNos,
      txid: txidResult.value,
      paidThroughDate: resolvedPaidThrough,
      createdOn,
      txidFee,
    });
    if (result.created?.length) {
      void invalidateCachePrefix("payouts");
    }
    return res.status(200).json({ message: "Payout completed", ...result });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[payout-complete]", err);
    return res.status(status).json({ error: err.message });
  }
};

/** POST /api/payouts/txid-fees/import — map txidFee + deduct Amount per row in one step. */
export const importPayoutTxidFees = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    let updates: Array<{ txid: string; txidFee: number }> = [];
    let invalidRows: Awaited<ReturnType<typeof parseTxidFeeCsv>>["invalidRows"] = [];

    if (typeof body.csv === "string" && body.csv.trim()) {
      const parsed = parseTxidFeeCsv(body.csv);
      updates = parsed.updates;
      invalidRows = parsed.invalidRows;
    } else if (Array.isArray(body.updates) && body.updates.length) {
      const parsed = normalizeTxidFeeUpdates(body.updates);
      updates = parsed.updates;
      invalidRows = parsed.invalidRows;
    } else {
      return res.status(400).json({ error: "Provide csv text or updates array" });
    }

    if (!updates.length) {
      return res.status(400).json({
        error: "No valid txid,txidFee rows found",
        invalidRows,
      });
    }

    const result = await importAndDeductPayoutTxidFees(updates);
    if (result.updatedRows > 0 || result.deductedRows > 0) {
      void invalidateCachePrefix("payouts");
    }

    return res.status(200).json({
      message: "Payout txid fees imported and deducted",
      data: { ...result, invalidRows },
    });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[payout-txid-fees-import]", err);
    return res.status(status).json({ error: err.message });
  }
};

/**
 * POST /api/payouts/txid-fees/sync-from-period
 * Body: { dateFrom, dateTo } YYYY-MM-DD — find payout txids in range, fetch fees, map onto zero-fee rows.
 * Does not change Amount.
 */
export const syncPayoutFeesFromPeriodHandler = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const result = await syncPayoutFeesFromPeriod({
      dateFrom: String(body.dateFrom ?? ""),
      dateTo: String(body.dateTo ?? ""),
      force: Boolean(body.force),
      previewOnly: Boolean(body.previewOnly),
    });
    if (!result.previewOnly && (result.updatedRows > 0 || result.blockchainImported > 0)) {
      void invalidateCachePrefix("payouts");
    }
    return res.status(200).json({
      message: result.previewOnly
        ? "Payout fee sync preview"
        : "Blockchain data imported and payout fees mapped",
      data: result,
    });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[payout-txid-fees-sync-period]", err);
    return res.status(status).json({ error: err.message });
  }
};

/**
 * POST /api/payouts/txid-fees/deduct — Step 2: Amount = Amount − txidFee
 * Body: { dryRun?: boolean, mode?: "perRow"|"splitAcrossTxid", txids?: string[] }
 */
export const deductPayoutTxidFees = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const mode: TxidFeeDeductionMode =
      body.mode === "splitAcrossTxid" ? "splitAcrossTxid" : "perRow";
    const txids = Array.isArray(body.txids)
      ? body.txids.map((t: unknown) => String(t).trim()).filter(Boolean)
      : undefined;

    const result = await applyPayoutTxidFeeDeduction({
      dryRun: Boolean(body.dryRun),
      mode,
      txids,
    });

    if (!result.dryRun && result.updatedRows > 0) {
      void invalidateCachePrefix("payouts");
    }

    return res.status(200).json({
      message: result.dryRun ? "Payout txid fee deduction preview" : "Payout txid fees deducted from Amount",
      data: result,
    });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[payout-txid-fees-deduct]", err);
    return res.status(status).json({ error: err.message });
  }
};

export type PayoutTxnSummaryRow = {
  txid: string;
  txnDate: string | null;
  recipientCount: number;
  grossAmount: number;
  txidFee: number;
  netAmount: number;
  feeDeducted: boolean;
  allComplete: boolean;
};

/** GET /api/payouts/txn-summary — one row per blockchain transaction (gross/fee/net). */
export const getPayoutTxnSummary = async (_req: Request, res: Response) => {
  try {
    const cacheKey = buildCacheKey("payouts:txn-summary", { view: "all" });
    const data = await readThroughCache(cacheKey, 60, async () => {
      const rows = await AppDataSource.query(`
        SELECT "txid", "txnDate", "recipientCount", "grossAmount",
               "txidFee", "netAmount", "feeDeducted", "allComplete"
        FROM "PayoutTxnSummary"
        ORDER BY "txnDate" DESC
      `);
      return rows.map((r: any) => ({
        txid: String(r.txid),
        txnDate: r.txnDate ? new Date(r.txnDate).toISOString() : null,
        recipientCount: Number(r.recipientCount) || 0,
        grossAmount: Number(r.grossAmount) || 0,
        txidFee: Number(r.txidFee) || 0,
        netAmount: Number(r.netAmount) || 0,
        feeDeducted: Boolean(r.feeDeducted),
        allComplete: Boolean(r.allComplete),
      })) as PayoutTxnSummaryRow[];
    });
    return res.status(200).json({ message: "Payout transaction summary", data });
  } catch (err: any) {
    console.error("[payout-txn-summary]", err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/payouts/blockchain/compare — per-txid diff of Payouts vs blockchain_payout. */
export const compareBlockchainPayouts = async (_req: Request, res: Response) => {
  try {
    // Join by txid only so timezone calendar-day skew still matches.
    const cacheKey = buildCacheKey("payouts:blockchain-compare", { view: "v9-txid-only-join" });
    const data = await readThroughCache(cacheKey, 30, async () => {
      const rows = await AppDataSource.query(`
        WITH payout_agg AS (
          SELECT
            btrim(p.txid)                              AS txid,
            MIN(p."CreatedOn")                         AS txn_date,
            COUNT(*)::int                              AS recipient_count,
            SUM(p."Amount")::numeric(24, 8)            AS gross,
            COALESCE(MAX(p."txidFee"), 0)::numeric(24, 8) AS fee
          FROM "Payouts" p
          WHERE p.txid IS NOT NULL AND btrim(p.txid) <> ''
            AND p."Status" = 'Complete'
          GROUP BY btrim(p.txid)
        ),
        bc_agg AS (
          SELECT
            btrim(b.txid)                              AS txid,
            MIN(b.txn_date)                            AS txn_date,
            COUNT(*)::int                              AS recipient_count,
            SUM(b.amount)::numeric(24, 8)              AS gross,
            COALESCE(MAX(b.txid_fee), 0)::numeric(24, 8) AS fee
          FROM blockchain_payout b
          WHERE b.txid IS NOT NULL AND btrim(b.txid) <> ''
            AND b.ac_no IS NOT NULL AND btrim(b.ac_no) <> ''
          GROUP BY btrim(b.txid)
        )
        SELECT
          COALESCE(p.txid, b.txid)         AS txid,
          p.txn_date                        AS payout_date,
          b.txn_date                        AS blockchain_date,
          p.recipient_count                 AS payout_count,
          b.recipient_count                 AS blockchain_count,
          p.gross                           AS payout_gross,
          b.gross                           AS blockchain_gross,
          p.fee                             AS payout_fee,
          b.fee                             AS blockchain_fee
        FROM payout_agg p
        FULL OUTER JOIN bc_agg b
          ON p.txid = b.txid
        ORDER BY COALESCE(b.txn_date, p.txn_date) DESC NULLS LAST
      `);

      return buildCompareResult(rows);
    });

    return res.status(200).json({ message: "Payout vs blockchain comparison", data });
  } catch (err: any) {
    console.error("[blockchain-payout-compare]", err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/payouts/blockchain/list — filtered blockchain_payout rows + txn summary. */
export const listBlockchainPayouts = async (req: Request, res: Response) => {
  try {
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : undefined;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const cacheKey = buildCacheKey("payouts:blockchain-list", { dateFrom, dateTo, search, view: "mapped-only" });
    const data = await readThroughCache(cacheKey, 60, () =>
      fetchBlockchainPayoutList({ dateFrom, dateTo, search }),
    );

    return res.status(200).json({ message: "Blockchain payout list", data });
  } catch (err: any) {
    console.error("[blockchain-payout-list]", err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/payouts/blockchain/address-issues — payout ToAddr not on chain for txid. */
export const listPayoutAddressIssues = async (req: Request, res: Response) => {
  try {
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : undefined;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const cacheKey = buildCacheKey("payouts:blockchain-address-issues", { dateFrom, dateTo, search });
    const data = await readThroughCache(cacheKey, 60, () =>
      fetchPayoutAddressIssues({ dateFrom, dateTo, search }),
    );

    return res.status(200).json({ message: "Payout address issues", data });
  } catch (err: any) {
    console.error("[blockchain-payout-address-issues]", err);
    return res.status(500).json({ error: err.message });
  }
};

/** POST /api/payouts/blockchain/preview — fetch + parse rawtx (no DB write). */
export const previewBlockchainPayout = async (req: Request, res: Response) => {
  try {
    const txidRaw = req.body?.txid ?? req.query?.txid;
    const txidResult = validatePayoutTxid(String(txidRaw ?? ""));
    if (!txidResult.ok) {
      return res.status(400).json({ error: txidResult.error });
    }
    const data = await previewBlockchainTx(txidResult.value);
    return res.status(200).json({ message: "Blockchain transaction preview", data });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[blockchain-payout-preview]", err);
    return res.status(status).json({ error: err.message });
  }
};

/** POST /api/payouts/blockchain/import — fetch blockchain.info rawtx → blockchain_payout table. */
export const importBlockchainPayout = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const txids: string[] = [];

    if (typeof body.txid === "string" && body.txid.trim()) {
      txids.push(body.txid.trim());
    } else if (Array.isArray(body.txids)) {
      for (const t of body.txids) {
        const s = String(t).trim();
        if (s) txids.push(s);
      }
    } else if (typeof body.text === "string" && body.text.trim()) {
      txids.push(...parseTxidsFromText(body.text));
    }

    if (!txids.length) {
      return res.status(400).json({ error: "Provide txid, txids array, or text with one txid per line" });
    }

    const invalid: Array<{ txid: string; error: string }> = [];
    const valid: string[] = [];
    for (const t of txids) {
      const v = validatePayoutTxid(t);
      if (!v.ok) invalid.push({ txid: t, error: v.error });
      else valid.push(v.value);
    }
    if (!valid.length) {
      return res.status(400).json({ error: "No valid txids", invalid });
    }

    const data =
      valid.length === 1
        ? { result: await importBlockchainTxToDb(valid[0]), errors: invalid }
        : { ...(await importBlockchainTxBatchToDb(valid)), validationErrors: invalid };

    void invalidateCachePrefix("payouts");

    return res.status(200).json({ message: "Blockchain payout data imported", data });
  } catch (err: any) {
    const status = err.status || 500;
    console.error("[blockchain-payout-import]", err);
    return res.status(status).json({ error: err.message });
  }
};

export const getPayoutsByClientId = async (req: Request, res: Response) => {
  try {
    const { clientid } = req.params;
    if (!clientid) return res.status(400).json({ message: "Missing clientid" });

    // Find AcNo for client
    const accountRepo = AppDataSource.getRepository(Account);
    const account = await accountRepo.findOne({ where: { Parent: clientid } });
    if (!account) return res.status(404).json({ message: "Account not found for this clientid" });

    // Find payouts for AcNo
    const payoutRepo = AppDataSource.getRepository(Payout);
    const payouts = await payoutRepo.find({
      where: { AcNo: account.AcNo },
      relations: ["account"],
      order: { CreatedOn: "DESC" },
    });

    const data = await serializePayoutsForApi(payouts);
    return res.status(200).json({ message: "Payouts fetched for client", data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/payouts/daily-compare — daily Rewards vs Payouts vs blockchain totals. */
export const getDailyReconciliation = async (req: Request, res: Response) => {
  try {
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : undefined;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : undefined;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10));

    const cacheKey = buildCacheKey("payouts:daily-compare", { dateFrom, dateTo, page, limit });
    const result = await readThroughCache(cacheKey, 30, () =>
      fetchDailyReconciliation({ dateFrom, dateTo, page, limit }),
    );

    return res.status(200).json({
      message: "Daily reconciliation fetched",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err: any) {
    console.error("[payout-daily-compare]", err);
    return res.status(500).json({ error: err.message });
  }
};
