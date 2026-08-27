/**
 * Period fee sync for mipcc:
 * 1. Collect distinct txids from Payouts in date range (Complete)
 * 2. GET https://blockchain.info/rawtx/{txid}
 * 3. Save into blockchain_payout + blockchain_raw_tx
 * 4. Map fee onto Payouts.txidFee (Amount unchanged)
 */
import { AppDataSource, Payout } from "@common";
import { fetchBlockchainRawTx, importBlockchainRawToDb } from "@blockchainData";

export type SyncPayoutFeesFromPeriodResult = {
  dateFrom: string;
  dateTo: string;
  txidsInPeriod: number;
  alreadyHadFee: number;
  needingFee: number;
  alreadySynced: boolean;
  feesMapped: number;
  updatedRows: number;
  updatedTxids: string[];
  blockchainImported: number;
  notFoundFees: string[];
  fetchErrors: Array<{ txid: string; error: string }>;
  previewOnly?: boolean;
  forced?: boolean;
};

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePeriod(input: { dateFrom: string; dateTo: string }) {
  const dateFrom = String(input.dateFrom || "").trim();
  const dateTo = String(input.dateTo || "").trim();
  if (!isValidYmd(dateFrom) || !isValidYmd(dateTo)) {
    throw Object.assign(new Error("dateFrom and dateTo must be YYYY-MM-DD"), { status: 400 });
  }
  if (dateFrom > dateTo) {
    throw Object.assign(new Error("dateFrom must be on or before dateTo"), { status: 400 });
  }
  return { dateFrom, dateTo };
}

async function loadPeriodTxids(dateFrom: string, dateTo: string) {
  const periodRows: Array<{ txid: string; max_fee: string }> = await AppDataSource.query(
    `
    SELECT btrim(p.txid) AS txid,
           MAX(COALESCE(p."txidFee", 0))::text AS max_fee
    FROM "Payouts" p
    WHERE p.txid IS NOT NULL AND btrim(p.txid) <> ''
      AND DATE(p."CreatedOn") >= $1::date
      AND DATE(p."CreatedOn") <= $2::date
      AND p."Status" = 'Complete'
    GROUP BY btrim(p.txid)
    ORDER BY btrim(p.txid)
    `,
    [dateFrom, dateTo],
  );
  const needingFee = periodRows.filter((r) => Number(r.max_fee) === 0).map((r) => r.txid);
  const alreadyHadFee = periodRows.length - needingFee.length;
  return { periodRows, needingFee, alreadyHadFee };
}

export async function syncPayoutFeesFromPeriod(input: {
  dateFrom: string;
  dateTo: string;
  /** When true, only return counts — no fetch / write. */
  previewOnly?: boolean;
  /** When true, re-fetch and overwrite fees even if already set. */
  force?: boolean;
}): Promise<SyncPayoutFeesFromPeriodResult> {
  const { dateFrom, dateTo } = parsePeriod(input);
  const force = Boolean(input.force);
  const previewOnly = Boolean(input.previewOnly);
  const payoutRepo = AppDataSource.getRepository(Payout);

  const { periodRows, needingFee, alreadyHadFee } = await loadPeriodTxids(dateFrom, dateTo);
  const alreadySynced = periodRows.length > 0 && needingFee.length === 0;

  if (previewOnly) {
    return {
      dateFrom,
      dateTo,
      txidsInPeriod: periodRows.length,
      alreadyHadFee,
      needingFee: needingFee.length,
      alreadySynced,
      feesMapped: 0,
      updatedRows: 0,
      updatedTxids: [],
      blockchainImported: 0,
      notFoundFees: [],
      fetchErrors: [],
      previewOnly: true,
      forced: force,
    };
  }

  const targetTxids = force ? periodRows.map((r) => r.txid) : needingFee;

  const feeByTxid = new Map<string, number>();
  let blockchainImported = 0;
  const fetchErrors: Array<{ txid: string; error: string }> = [];

  for (const txid of targetTxids) {
    try {
      const raw = await fetchBlockchainRawTx(txid);
      const imported = await importBlockchainRawToDb(raw);
      const fee = Number(imported.txidFeeBtc);
      if (!Number.isFinite(fee) || fee < 0) {
        fetchErrors.push({ txid, error: "Imported tx but fee missing/invalid" });
        continue;
      }
      feeByTxid.set(txid, Number(fee.toFixed(8)));
      blockchainImported += 1;
    } catch (err: any) {
      fetchErrors.push({ txid, error: err?.message || "blockchain.info fetch failed" });
    }
  }

  let updatedRows = 0;
  const updatedTxids: string[] = [];
  const notFoundFees: string[] = [];

  for (const txid of targetTxids) {
    const fee = feeByTxid.get(txid);
    if (fee == null) {
      notFoundFees.push(txid);
      continue;
    }

    let qb = payoutRepo
      .createQueryBuilder()
      .update(Payout)
      .set({ txidFee: fee, txidFeeDeducted: false })
      .where("btrim(txid) = btrim(:txid)", { txid });

    if (!force) {
      qb = qb.andWhere('COALESCE("txidFee", 0) = 0');
    }

    const result = await qb.execute();
    const affected = result.affected ?? 0;
    if (affected > 0) {
      updatedRows += affected;
      updatedTxids.push(txid);
    }
  }

  return {
    dateFrom,
    dateTo,
    txidsInPeriod: periodRows.length,
    alreadyHadFee,
    needingFee: needingFee.length,
    alreadySynced,
    feesMapped: updatedTxids.length,
    updatedRows,
    updatedTxids,
    blockchainImported,
    notFoundFees,
    fetchErrors,
    forced: force,
  };
}
