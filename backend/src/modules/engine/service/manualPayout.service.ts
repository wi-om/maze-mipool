/**
 * Manual EU payout orchestration (mipcc Add Payout flow).
 *
 * Pay-through model (Option A): rewards are payable by Dubai work-date, not CreatedOn cutoff.
 * Wallets.Balance = total accrued; payable amount = rewards in (lastPaidThrough+1 .. paidThroughDate].
 */
import { AppDataSource } from "@common";
import { Account } from "@common";
import { Contract } from "@common";
import { Payout } from "@common";
import { Wallet } from "@common/entities/Wallet";
import { In } from "typeorm";
import dotenv from "dotenv";
import {
  loadRewardsAndPayoutsForAcNos,
  rollupRewardsForAcNo,
} from "../../crm/services/wallet/payoutRewardRange.service";
import { debitWalletBalanceInTransaction } from "../../crm/services/wallet/walletBalance.service";
import { insertDebitFromPayout } from "../../crm/services/wallet/walletTxn.service";
import { convertHashrate } from "./hashrate.util";
import {
  dubaiYesterdayIso,
  resolvePaidThroughDate,
  validatePaidThroughDate,
} from "./payoutWorkDate.util";
import { validatePayoutTxid } from "./payoutTxid.util";

dotenv.config();

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

export type PendingSummary = {
  totalOutstanding: number;
  totalPayable: number;
  totalAccruedNotPayable: number;
  daysPending: number;
  contractQty: number;
  clientCount: number;
  paidThroughDate: string;
  maxPaidThroughDate: string;
};

export type PendingContract = {
  mipContractNo: string;
  pendingAmount: number;
};

export type PendingClient = {
  acNo: string;
  parentClientid: string | null;
  balance: number;
  payableBalance: number;
  accruedBalance: number;
  lastPaidThroughDate: string | null;
  paidThroughDate: string;
  btcAddr: string | null;
  daysPending: number;
  contractQty: number;
  totalHashrateTH: number;
  hasActiveWallet: boolean;
  balanceDrift: boolean;
  contracts: PendingContract[];
};

export type PreviewRow = {
  acNo: string;
  parentClientid: string | null;
  mipContractNo: string;
  amount: number;
  toAddr: string;
  paidThroughDate: string;
};

export type PendingPayoutBundle = {
  summary: PendingSummary;
  clients: PendingClient[];
};

export type CommitResult = {
  created: Payout[];
  skipped: Array<{ acNo: string; mipContractNo: string; amount: number; reason: string }>;
  errors: Array<{ acNo: string; error: string }>;
};

function trimAcNo(acNo: string): string {
  return String(acNo).trim();
}

function parsePaidThroughDate(input?: string | null): string {
  if (input) {
    const validated = validatePaidThroughDate(input);
    if (!validated.ok) {
      throw Object.assign(new Error(validated.error), { status: 400 });
    }
    return validated.value;
  }
  return resolvePaidThroughDate(null);
}

function emptySummary(paidThroughDate: string): PendingSummary {
  return {
    totalOutstanding: 0,
    totalPayable: 0,
    totalAccruedNotPayable: 0,
    daysPending: 0,
    contractQty: 0,
    clientCount: 0,
    paidThroughDate,
    maxPaidThroughDate: dubaiYesterdayIso(),
  };
}

async function getEuAccountsWithBalance(): Promise<Array<{ acNo: string; parent: string | null; balance: number }>> {
  const rows = await AppDataSource.getRepository(Wallet)
    .createQueryBuilder("w")
    .innerJoin(Account, "a", 'a."AcNo" = w."AcNo"')
    .where('a."Type" = :type', { type: "EU" })
    .andWhere("w.Balance > 0")
    .select('w."AcNo"', "acNo")
    .addSelect('a."Parent"', "parent")
    .addSelect("w.Balance", "balance")
    .getRawMany();

  const byAcNo = new Map<string, { acNo: string; parent: string | null; balance: number }>();
  for (const row of rows) {
    const acNo = trimAcNo(row.acNo);
    const balance = Number(row.balance || 0);
    const existing = byAcNo.get(acNo);
    if (!existing || balance > existing.balance) {
      byAcNo.set(acNo, { acNo, parent: row.parent ?? null, balance });
    }
  }
  return [...byAcNo.values()];
}

type WalletPick = { balance: number; addr: string | null; isActive: boolean };

function pickWalletForAcNo(wallets: Wallet[]): WalletPick {
  const active = wallets.find((w) => w.IsActive);
  const wallet = active ?? wallets.sort((a, b) => {
    const ta = a.CreatedOn ? new Date(a.CreatedOn).getTime() : 0;
    const tb = b.CreatedOn ? new Date(b.CreatedOn).getTime() : 0;
    return tb - ta;
  })[0];

  if (!wallet) return { balance: 0, addr: null, isActive: false };

  const addr = wallet.Addr?.trim() || null;
  return {
    balance: Number(wallet.Balance || 0),
    addr,
    isActive: Boolean(wallet.IsActive),
  };
}

function indexWalletsByAcNo(wallets: Wallet[]): Map<string, Wallet[]> {
  const map = new Map<string, Wallet[]>();
  for (const wallet of wallets) {
    const key = trimAcNo(wallet.AcNo);
    const list = map.get(key) ?? [];
    list.push(wallet);
    map.set(key, list);
  }
  return map;
}

type ContractRollup = { qty: number; totalHashrateTH: number };

function indexContractsByAcNo(contracts: Contract[]): Map<string, ContractRollup> {
  const map = new Map<string, ContractRollup>();
  for (const contract of contracts) {
    const key = trimAcNo(contract.AcNo);
    const hr = Number(contract.Hashrate || 0);
    const unit = contract.HashrateUnit || "TH";
    const th = convertHashrate(`${hr} ${unit}`, "TH");
    const existing = map.get(key) ?? { qty: 0, totalHashrateTH: 0 };
    existing.qty += 1;
    existing.totalHashrateTH += th;
    map.set(key, existing);
  }
  return map;
}

/**
 * Single batched load for summary + clients (avoids N+1 queries and duplicate work).
 */
export async function getPendingPayoutBundle(
  paidThroughDateInput?: string | null,
): Promise<PendingPayoutBundle> {
  const paidThroughDate = parsePaidThroughDate(paidThroughDateInput);
  const euAccounts = await getEuAccountsWithBalance();
  if (!euAccounts.length) {
    return { summary: emptySummary(paidThroughDate), clients: [] };
  }

  const acNos = euAccounts.map((a) => a.acNo);

  const [{ rewardsByAcNo, payoutIndex }, contracts, wallets] = await Promise.all([
    loadRewardsAndPayoutsForAcNos(acNos),
    AppDataSource.getRepository(Contract).find({
      where: { AcNo: In(acNos), Status: 2 },
      select: ["AcNo", "MipContractNo", "Hashrate", "HashrateUnit"],
    }),
    AppDataSource.getRepository(Wallet).find({ where: { AcNo: In(acNos) } }),
  ]);

  const walletsByAcNo = indexWalletsByAcNo(wallets);
  const contractsByAcNo = indexContractsByAcNo(contracts);

  const clients: PendingClient[] = [];
  let totalPayable = 0;
  let totalAccruedNotPayable = 0;
  let maxDays = 0;
  let contractQty = 0;

  for (const account of euAccounts) {
    const key = trimAcNo(account.acNo);
    const lastPaidThrough = payoutIndex.lastPaidThroughByAcNo.get(key) ?? null;
    const completePaid = payoutIndex.completePaidTotalByAcNo.get(key) ?? 0;
    const rewards = rewardsByAcNo.get(key) ?? [];

    const rollup = rollupRewardsForAcNo(rewards, lastPaidThrough, paidThroughDate, completePaid);
    if (rollup.payableBalance <= 0) continue;

    const walletPick = pickWalletForAcNo(walletsByAcNo.get(key) ?? []);
    const currentBalance = walletPick.balance || account.balance;
    const expectedBalance = Number((rollup.totalRewards - rollup.totalCompletePaid).toFixed(8));
    const contractRollup = contractsByAcNo.get(key) ?? { qty: 0, totalHashrateTH: 0 };

    const contractsList: PendingContract[] = [...rollup.pendingByContract.entries()].map(
      ([mipContractNo, pendingAmount]) => ({ mipContractNo, pendingAmount }),
    );

    const addr = walletPick.addr;
    const hasActiveWallet = Boolean(walletPick.isActive && addr && addr !== "HOLD");

    clients.push({
      acNo: key,
      parentClientid: account.parent,
      balance: currentBalance,
      payableBalance: rollup.payableBalance,
      accruedBalance: rollup.accruedBalance,
      lastPaidThroughDate: lastPaidThrough,
      paidThroughDate,
      btcAddr: addr,
      daysPending: rollup.daysPending,
      contractQty: contractRollup.qty,
      totalHashrateTH: contractRollup.totalHashrateTH,
      hasActiveWallet,
      balanceDrift: Math.abs(currentBalance - expectedBalance) > 1e-8,
      contracts: contractsList,
    });

    totalPayable += rollup.payableBalance;
    totalAccruedNotPayable += rollup.accruedBalance;
    maxDays = Math.max(maxDays, rollup.daysPending);
    contractQty += contractRollup.qty;
  }

  clients.sort((a, b) => b.payableBalance - a.payableBalance);

  const summary: PendingSummary = {
    totalOutstanding: totalPayable,
    totalPayable,
    totalAccruedNotPayable,
    daysPending: maxDays,
    contractQty,
    clientCount: clients.length,
    paidThroughDate,
    maxPaidThroughDate: dubaiYesterdayIso(),
  };

  return { summary, clients };
}

export async function getPendingSummary(paidThroughDateInput?: string | null): Promise<PendingSummary> {
  const { summary } = await getPendingPayoutBundle(paidThroughDateInput);
  return summary;
}

export async function getPendingClients(paidThroughDateInput?: string | null): Promise<PendingClient[]> {
  const { clients } = await getPendingPayoutBundle(paidThroughDateInput);
  return clients;
}

export async function previewManualPayout(
  acNos: string[],
  paidThroughDateInput?: string | null,
): Promise<PreviewRow[]> {
  const paidThroughDate = parsePaidThroughDate(paidThroughDateInput);
  const keys = [...new Set(acNos.map(trimAcNo).filter(Boolean))];
  if (!keys.length) return [];

  const [accounts, wallets, { rewardsByAcNo, payoutIndex }] = await Promise.all([
    AppDataSource.getRepository(Account).find({ where: { AcNo: In(keys), Type: "EU" } }),
    AppDataSource.getRepository(Wallet).find({ where: { AcNo: In(keys) } }),
    loadRewardsAndPayoutsForAcNos(keys),
  ]);

  const accountByAcNo = new Map(accounts.map((a) => [trimAcNo(a.AcNo), a]));
  const walletsByAcNo = indexWalletsByAcNo(wallets);
  const rows: PreviewRow[] = [];

  for (const key of keys) {
    const account = accountByAcNo.get(key);
    if (!account) continue;

    const activeWallet = (walletsByAcNo.get(key) ?? []).find((w) => w.IsActive);
    const toAddr = activeWallet?.Addr?.trim() || "HOLD";

    const lastPaidThrough = payoutIndex.lastPaidThroughByAcNo.get(key) ?? null;
    const completePaid = payoutIndex.completePaidTotalByAcNo.get(key) ?? 0;
    const rollup = rollupRewardsForAcNo(
      rewardsByAcNo.get(key) ?? [],
      lastPaidThrough,
      paidThroughDate,
      completePaid,
    );

    for (const [mipContractNo, amount] of rollup.pendingByContract.entries()) {
      if (amount <= 0) continue;
      rows.push({
        acNo: key,
        parentClientid: account.Parent ?? null,
        mipContractNo,
        amount,
        toAddr,
        paidThroughDate,
      });
    }
  }

  return rows;
}

/** AcNos that already have this txid within the idempotency window (one query). */
async function findRecentTxidAcNos(acNos: string[], txid: string): Promise<Set<string>> {
  if (!acNos.length) return new Set();
  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  const rows = await AppDataSource.getRepository(Payout)
    .createQueryBuilder("p")
    .select('DISTINCT TRIM(p."AcNo")', "acNo")
    .where('TRIM(p."AcNo") IN (:...acNos)', { acNos })
    .andWhere("p.txid = :txid", { txid })
    .andWhere('p."CreatedOn" >= :since', { since })
    .getRawMany<{ acNo: string }>();

  return new Set(rows.map((r) => trimAcNo(r.acNo)).filter(Boolean));
}

export async function commitManualPayout(input: {
  acNos: string[];
  txid: string;
  paidThroughDate?: string | null;
  createdOn?: string;
  txidFee?: number;
}): Promise<CommitResult> {
  const { acNos, txid, paidThroughDate: paidThroughDateInput, createdOn, txidFee } = input;
  const paidThroughDate = parsePaidThroughDate(paidThroughDateInput);

  const txidResult = validatePayoutTxid(txid ?? "");
  if (!txidResult.ok) {
    throw Object.assign(new Error(txidResult.error), { status: 400 });
  }
  const trimmedTxid = txidResult.value;
  const keys = [...new Set(acNos.map(trimAcNo).filter(Boolean))];

  const created: Payout[] = [];
  const skipped: CommitResult["skipped"] = [];
  const errors: CommitResult["errors"] = [];

  if (!keys.length) {
    return { created, skipped, errors };
  }

  const [accounts, wallets, { rewardsByAcNo, payoutIndex }, recentTxidAcNos] = await Promise.all([
    AppDataSource.getRepository(Account).find({ where: { AcNo: In(keys), Type: "EU" } }),
    AppDataSource.getRepository(Wallet).find({ where: { AcNo: In(keys) } }),
    loadRewardsAndPayoutsForAcNos(keys),
    findRecentTxidAcNos(keys, trimmedTxid),
  ]);

  const accountByAcNo = new Map(accounts.map((a) => [trimAcNo(a.AcNo), a]));
  const walletsByAcNo = indexWalletsByAcNo(wallets);

  type PreparedAccount = {
    acNo: string;
    wallet: Wallet;
    toAddr: string;
    pending: Array<{ mipContractNo: string; amount: number }>;
  };

  const prepared: PreparedAccount[] = [];

  for (const key of keys) {
    if (recentTxidAcNos.has(key)) {
      errors.push({
        acNo: key,
        error: `Payout with txid already committed for ${key} within last 5 minutes`,
      });
      continue;
    }

    if (!accountByAcNo.has(key)) {
      errors.push({ acNo: key, error: "EU account not found" });
      continue;
    }

    const activeWallet = (walletsByAcNo.get(key) ?? []).find((w) => w.IsActive);
    const toAddr = activeWallet?.Addr?.trim();
    if (!activeWallet || !toAddr || toAddr === "HOLD") {
      errors.push({ acNo: key, error: "No active wallet with valid BTC address" });
      continue;
    }

    const lastPaidThrough = payoutIndex.lastPaidThroughByAcNo.get(key) ?? null;
    const completePaid = payoutIndex.completePaidTotalByAcNo.get(key) ?? 0;
    const rollup = rollupRewardsForAcNo(
      rewardsByAcNo.get(key) ?? [],
      lastPaidThrough,
      paidThroughDate,
      completePaid,
    );

    const pending = [...rollup.pendingByContract.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([mipContractNo, amount]) => ({ mipContractNo, amount }));

    if (!pending.length) {
      errors.push({ acNo: key, error: "No pending rewards to pay for selected pay-through date" });
      continue;
    }

    prepared.push({ acNo: key, wallet: activeWallet, toAddr, pending });
  }

  if (!prepared.length) {
    return { created, skipped, errors };
  }

  await AppDataSource.transaction(async (dbTransaction) => {
    const payoutRepo = dbTransaction.getRepository(Payout);
    const walletRepo = dbTransaction.getRepository(Wallet);
    const now = createdOn ? new Date(createdOn) : new Date();
    const walletByAcNo = new Map(prepared.map((p) => [p.acNo, p.wallet]));

    const payoutsToInsert: Payout[] = [];
    for (const item of prepared) {
      for (const row of item.pending) {
        payoutsToInsert.push(
          payoutRepo.create({
            AcNo: item.acNo,
            mipContractNo: row.mipContractNo,
            Amount: row.amount,
            ToAddr: item.toAddr,
            Status: "Complete",
            txid: trimmedTxid,
            txidFee,
            paidThroughDate,
            CreatedOn: now,
          }),
        );
      }
    }

    const savedBatch = await payoutRepo.save(payoutsToInsert);
    const paidTotalByAcNo = new Map<string, number>();

    for (const saved of savedBatch) {
      const acNo = trimAcNo(saved.AcNo);
      const wallet = walletByAcNo.get(acNo);
      if (!wallet) continue;

      await insertDebitFromPayout(saved, wallet, dbTransaction);
      paidTotalByAcNo.set(acNo, Number((paidTotalByAcNo.get(acNo) || 0) + Number(saved.Amount || 0)));
      created.push(saved);
    }

    for (const [acNo, paidTotal] of paidTotalByAcNo.entries()) {
      await debitWalletBalanceInTransaction(walletRepo, acNo, Number(paidTotal.toFixed(8)));
    }
  });

  return { created, skipped, errors };
}
