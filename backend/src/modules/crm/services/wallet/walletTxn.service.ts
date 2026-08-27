/**
 * WalletTxn ledger — CREDIT from Rewards, DEBIT from Payouts.
 */
import { AppDataSource, Reward, Payout, Wallet, WalletTxn } from "@common";
import { Repository, EntityManager, SelectQueryBuilder } from "typeorm";
import { rewardWorkDateFromCreatedOn } from "../../../engine/service/payoutWorkDate.util";
import {
  getWorkDateDeleteBounds,
  workDateDeleteWhere,
} from "../../../engine/service/rewardWorkDate";

export const WALLET_TXN_ASSET_NAME = "Bitcoin";
export const WALLET_TXN_ASSET_CODE = "BTC";
export const WALLET_TXN_REMARK_CREDIT = "Auto reward";
export const WALLET_TXN_REMARK_DEBIT = "Auto Payout";
export const WALLET_TXN_SOURCE_REWARD = "MIPS_REWARD";

const DUBAI_ZONE = process.env.TIMEZONE || "Asia/Dubai";

function trimAcNo(acNo: string): string {
  return String(acNo).trim();
}

function walletIdString(wallet: Wallet): string {
  return String(wallet.ID);
}

export type WalletTxnRow = {
  id: number;
  acNo: string;
  walletId: number | null;
  txnType: "CREDIT" | "DEBIT";
  amount: number;
  runningBalance: number;
  txid: string | null;
  source: string;
  destination: string;
  assetName: string;
  assetCode: string;
  remark: string | null;
  reference: string | null;
  sourceType: "REWARD" | "PAYOUT";
  sourceId: number;
  workDate: string | null;
  createdOn: string;
};

export type WalletTxnListParams = {
  page?: number;
  limit?: number;
  acNo?: string;
  txnType?: "CREDIT" | "DEBIT";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type WalletTxnListResult = {
  data: WalletTxnRow[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalDays: number;
    totalPages: number;
  };
};

const TXN_DAY_EXPR = `COALESCE(t."WorkDate", DATE(t."CreatedOn"))`;

function normalizeDateKey(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapRow(row: WalletTxn): WalletTxnRow {
  const workDate = row.WorkDate;
  const wd =
    workDate instanceof Date
      ? workDate.toISOString().slice(0, 10)
      : workDate
        ? String(workDate).slice(0, 10)
        : null;

  return {
    id: row.Id,
    acNo: trimAcNo(row.AcNo),
    walletId: row.WalletId ?? null,
    txnType: row.TxnType,
    amount: Number(row.Amount),
    runningBalance: Number(row.RunningBalance),
    txid: row.txid?.trim() || null,
    source: row.Source,
    destination: row.Destination,
    assetName: row.AssetName,
    assetCode: row.AssetCode,
    remark: row.Remark ?? null,
    reference: row.Reference ? String(row.Reference).trim() : null,
    sourceType: row.SourceType,
    sourceId: row.SourceId,
    workDate: wd,
    createdOn: row.CreatedOn ? new Date(row.CreatedOn).toISOString() : new Date().toISOString(),
  };
}

async function getTxnRepo(manager?: EntityManager): Promise<Repository<WalletTxn>> {
  return manager ? manager.getRepository(WalletTxn) : AppDataSource.getRepository(WalletTxn);
}

export async function findWalletForAcNo(acNo: string, manager?: EntityManager): Promise<Wallet | null> {
  const walletRepo = manager ? manager.getRepository(Wallet) : AppDataSource.getRepository(Wallet);
  const active = await walletRepo.findOne({
    where: { AcNo: acNo, IsActive: true },
    order: { CreatedOn: "DESC" },
  });
  if (active) return active;

  return walletRepo.findOne({
    where: { AcNo: acNo },
    order: { CreatedOn: "DESC" },
  });
}

async function computeNextRunningBalance(
  acNo: string,
  txnType: "CREDIT" | "DEBIT",
  amount: number,
  repo: Repository<WalletTxn>,
): Promise<number> {
  const latest = await repo.findOne({
    where: { AcNo: acNo },
    order: { CreatedOn: "DESC", Id: "DESC" },
  });
  const prev = Number(latest?.RunningBalance ?? 0);
  const delta = txnType === "CREDIT" ? amount : -amount;
  return Number((prev + delta).toFixed(8));
}

export async function insertCreditFromReward(
  reward: Reward,
  wallet: Wallet,
  manager?: EntityManager,
): Promise<WalletTxn | null> {
  if (!reward.Id || !reward.CreatedOn) return null;

  const repo = await getTxnRepo(manager);
  const existing = await repo.findOne({
    where: { SourceType: "REWARD", SourceId: reward.Id },
  });
  if (existing) return existing;

  const acNo = trimAcNo(reward.AcNo);
  const amount = Number(Number(reward.Amount || 0).toFixed(8));
  if (amount <= 0) return null;

  const workDate = rewardWorkDateFromCreatedOn(
    reward.CreatedOn instanceof Date ? reward.CreatedOn : new Date(reward.CreatedOn),
  );
  const runningBalance = await computeNextRunningBalance(acNo, "CREDIT", amount, repo);

  const row = repo.create({
    AcNo: acNo,
    WalletId: wallet.ID,
    TxnType: "CREDIT",
    Amount: amount,
    RunningBalance: runningBalance,
    txid: null,
    Source: WALLET_TXN_SOURCE_REWARD,
    Destination: walletIdString(wallet),
    AssetName: WALLET_TXN_ASSET_NAME,
    AssetCode: WALLET_TXN_ASSET_CODE,
    Remark: WALLET_TXN_REMARK_CREDIT,
    Reference: reward.mipContractNo ? String(reward.mipContractNo).trim() : null,
    SourceType: "REWARD",
    SourceId: reward.Id,
    WorkDate: workDate,
    CreatedOn: reward.CreatedOn instanceof Date ? reward.CreatedOn : new Date(reward.CreatedOn),
  });

  return repo.save(row);
}

export type InsertDebitOptions = {
  /** Historical backfill only — live commits must always supply txid. */
  allowMissingTxid?: boolean;
};

export async function insertDebitFromPayout(
  payout: Payout,
  wallet: Wallet,
  manager?: EntityManager,
  opts?: InsertDebitOptions,
): Promise<WalletTxn | null> {
  if (!payout.Id) return null;

  if (payout.Status !== "Complete") {
    throw new Error(`Payout ${payout.Id} requires Complete status for WalletTxn DEBIT`);
  }

  const txid = payout.txid?.trim() || null;
  if (!txid && !opts?.allowMissingTxid) {
    throw new Error(`Payout ${payout.Id} requires txid for WalletTxn DEBIT`);
  }

  const repo = await getTxnRepo(manager);
  const existing = await repo.findOne({
    where: { SourceType: "PAYOUT", SourceId: payout.Id },
  });
  if (existing) return existing;

  const acNo = trimAcNo(payout.AcNo);
  const amount = Number(Number(payout.Amount || 0).toFixed(8));
  if (amount <= 0) return null;

  const toAddr = payout.ToAddr?.trim();
  if (!toAddr) {
    throw new Error(`Payout ${payout.Id} missing ToAddr for WalletTxn DEBIT`);
  }

  const runningBalance = await computeNextRunningBalance(acNo, "DEBIT", amount, repo);
  const createdOn = payout.CreatedOn
    ? payout.CreatedOn instanceof Date
      ? payout.CreatedOn
      : new Date(payout.CreatedOn)
    : new Date();

  const row = repo.create({
    AcNo: acNo,
    WalletId: wallet.ID,
    TxnType: "DEBIT",
    Amount: amount,
    RunningBalance: runningBalance,
    txid,
    Source: walletIdString(wallet),
    Destination: toAddr,
    AssetName: WALLET_TXN_ASSET_NAME,
    AssetCode: WALLET_TXN_ASSET_CODE,
    Remark: WALLET_TXN_REMARK_DEBIT,
    Reference: payout.mipContractNo ? String(payout.mipContractNo).trim() : null,
    SourceType: "PAYOUT",
    SourceId: payout.Id,
    WorkDate: null,
    CreatedOn: createdOn,
  });

  return repo.save(row);
}

export async function deleteRewardTxnsForWorkDate(
  workDateStr: string,
  manager?: EntityManager,
): Promise<number> {
  const repo = await getTxnRepo(manager);
  const result = await repo
    .createQueryBuilder()
    .delete()
    .from(WalletTxn)
    .where(`"SourceType" = :st`, { st: "REWARD" })
    .andWhere(`"WorkDate" = :wd`, { wd: workDateStr })
    .execute();
  return result.affected ?? 0;
}

export async function recordCreditTxnsForWorkDate(workDateStr: string): Promise<number> {
  const deleteBounds = getWorkDateDeleteBounds(workDateStr, DUBAI_ZONE);
  const rewardRepo = AppDataSource.getRepository(Reward);
  const rewards = await rewardRepo
    .createQueryBuilder("r")
    .where(workDateDeleteWhere("r.CreatedOn"), deleteBounds)
    .orderBy("r.Id", "ASC")
    .getMany();

  if (!rewards.length) return 0;

  const acNos = [...new Set(rewards.map((r) => trimAcNo(r.AcNo)))];
  const walletByAcNo = new Map<string, Wallet>();
  for (const acNo of acNos) {
    const wallet = await findWalletForAcNo(acNo);
    if (wallet) walletByAcNo.set(acNo, wallet);
  }

  let created = 0;
  for (const reward of rewards) {
    const wallet = walletByAcNo.get(trimAcNo(reward.AcNo));
    if (!wallet) continue;
    const row = await insertCreditFromReward(reward, wallet);
    if (row) created += 1;
  }

  for (const acNo of walletByAcNo.keys()) {
    await recalcRunningBalances(acNo);
  }

  return created;
}

export async function recalcRunningBalances(acNo: string, manager?: EntityManager): Promise<void> {
  const repo = await getTxnRepo(manager);
  const rows = await repo.find({
    where: { AcNo: trimAcNo(acNo) },
    order: { CreatedOn: "ASC", Id: "ASC" },
  });

  let running = 0;
  for (const row of rows) {
    const amount = Number(row.Amount || 0);
    running =
      row.TxnType === "CREDIT"
        ? Number((running + amount).toFixed(8))
        : Number((running - amount).toFixed(8));
    if (Math.abs(Number(row.RunningBalance) - running) > 1e-10) {
      await repo.update(row.Id, { RunningBalance: running });
    }
  }
}

function applyWalletTxnFilters(
  qb: SelectQueryBuilder<WalletTxn>,
  params: WalletTxnListParams,
): SelectQueryBuilder<WalletTxn> {
  if (params.acNo?.trim()) {
    qb.andWhere(`TRIM(t."AcNo") = :acNo`, { acNo: params.acNo.trim() });
  }
  if (params.txnType) {
    qb.andWhere(`t."TxnType" = :txnType`, { txnType: params.txnType });
  }
  if (params.dateFrom) {
    qb.andWhere(`${TXN_DAY_EXPR} >= :dateFrom`, { dateFrom: params.dateFrom });
  }
  if (params.dateTo) {
    qb.andWhere(`${TXN_DAY_EXPR} <= :dateTo`, { dateTo: params.dateTo });
  }
  if (params.search?.trim()) {
    const s = `%${params.search.trim()}%`;
    qb.andWhere(
      `(TRIM(t."AcNo") ILIKE :s OR t."Source" ILIKE :s OR t."Destination" ILIKE :s OR t."Reference" ILIKE :s OR t.txid ILIKE :s OR t."Remark" ILIKE :s)`,
      { s },
    );
  }
  return qb;
}

export async function fetchWalletTxns(params: WalletTxnListParams): Promise<WalletTxnListResult> {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));

  const createFilteredQb = () => {
    const qb = AppDataSource.getRepository(WalletTxn).createQueryBuilder("t");
    return applyWalletTxnFilters(qb, params);
  };

  const statsQb = createFilteredQb();
  statsQb
    .select(`COUNT(DISTINCT ${TXN_DAY_EXPR})`, "totalDays")
    .addSelect(`COUNT(t."Id")`, "totalRecords");
  const statsRow = await statsQb.getRawOne<{ totalDays: string; totalRecords: string }>();
  const totalDays = parseInt(statsRow?.totalDays ?? "0", 10);
  const totalRecords = parseInt(statsRow?.totalRecords ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(totalDays / limit));

  const datesQb = createFilteredQb();
  datesQb
    .select(TXN_DAY_EXPR, "txnDay")
    .groupBy(TXN_DAY_EXPR)
    .orderBy(TXN_DAY_EXPR, "DESC")
    .offset((page - 1) * limit)
    .limit(limit);
  const dateRows = await datesQb.getRawMany<{ txnDay: string | Date }>();
  const dates = dateRows.map((row) => normalizeDateKey(row.txnDay));

  if (!dates.length) {
    return {
      data: [],
      pagination: { page, limit, totalRecords, totalDays, totalPages },
    };
  }

  const rowsQb = createFilteredQb();
  rowsQb
    .andWhere(`${TXN_DAY_EXPR} IN (:...dates)`, { dates })
    .orderBy("t.CreatedOn", "DESC")
    .addOrderBy("t.Id", "DESC");
  const rows = await rowsQb.getMany();

  return {
    data: rows.map(mapRow),
    pagination: { page, limit, totalRecords, totalDays, totalPages },
  };
}

export async function fetchWalletTxnsByAcNo(acNo: string): Promise<WalletTxnRow[]> {
  const rows = await AppDataSource.getRepository(WalletTxn).find({
    where: { AcNo: trimAcNo(acNo) },
    order: { CreatedOn: "DESC", Id: "DESC" },
  });
  return rows.map(mapRow);
}

export async function fetchAllWalletTxnsForAcNo(acNo: string): Promise<WalletTxn[]> {
  return AppDataSource.getRepository(WalletTxn).find({
    where: { AcNo: trimAcNo(acNo) },
    order: { CreatedOn: "ASC", Id: "ASC" },
  });
}
