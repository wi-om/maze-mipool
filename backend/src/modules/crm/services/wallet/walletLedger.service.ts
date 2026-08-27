import { AppDataSource } from "@common";
import { Account } from "@common";
import { Wallet } from "@common/entities/Wallet";
import { DateTime } from "luxon";
import { getExpectedWalletBalance } from "./walletBalance.service";
import { fetchAllWalletTxnsForAcNo } from "./walletTxn.service";

const DUBAI_ZONE = process.env.TIMEZONE || "Asia/Dubai";

function toDisplayDate(createdOn: Date, workDate: string | Date | null | undefined): string {
  if (workDate) {
    if (workDate instanceof Date) return workDate.toISOString().slice(0, 10);
    return String(workDate).slice(0, 10);
  }
  return DateTime.fromISO(createdOn.toISOString(), { zone: "utc" })
    .setZone(DUBAI_ZONE)
    .toISODate()!;
}

export type WalletLedgerEntry = {
  date: string;
  type: "reward" | "payout";
  amount: number;
  runningBalance: number;
  description: string;
  source: string;
  destination: string;
  assetName: string;
  assetCode: string;
  reference: string | null;
  remark: string | null;
  contractCount?: number;
  mipContractNos?: string[];
  txid?: string | null;
  payoutStatus?: string;
};

export type WalletLedgerResult = {
  acNo: string;
  clientId: string | null;
  currentBalance: number;
  expectedBalance: number;
  totalCredited: number;
  totalPaidOut: number;
  entries: WalletLedgerEntry[];
};

async function getAccountByClientid(clientid: string): Promise<Account> {
  const account = await AppDataSource.getRepository(Account).findOneBy({ Parent: clientid });
  if (!account) {
    throw Object.assign(new Error("No MIPS account found for this clientid"), { status: 404 });
  }
  return account;
}

function mapTxnToEntry(row: Awaited<ReturnType<typeof fetchAllWalletTxnsForAcNo>>[number]): WalletLedgerEntry {
  const isCredit = row.TxnType === "CREDIT";
  const amount = isCredit ? Number(row.Amount) : -Number(row.Amount);
  const ref = row.Reference ? String(row.Reference).trim() : null;

  return {
    date: toDisplayDate(
      row.CreatedOn instanceof Date ? row.CreatedOn : new Date(row.CreatedOn),
      row.WorkDate,
    ),
    type: isCredit ? "reward" : "payout",
    amount: Number(amount.toFixed(8)),
    runningBalance: Number(row.RunningBalance),
    description: row.Remark || (isCredit ? "Auto reward" : "Auto Payout"),
    source: row.Source,
    destination: row.Destination,
    assetName: row.AssetName,
    assetCode: row.AssetCode,
    reference: ref,
    remark: row.Remark ?? null,
    mipContractNos: ref ? [ref] : undefined,
    txid: row.txid?.trim() || null,
    payoutStatus: isCredit ? undefined : "Complete",
  };
}

/**
 * Build wallet distribution ledger from WalletTxn rows.
 */
async function buildLedgerForAcNo(acNo: string, clientId: string | null): Promise<WalletLedgerResult> {
  const walletRepo = AppDataSource.getRepository(Wallet);
  const wallet = await walletRepo.findOne({
    where: { AcNo: acNo, IsActive: true },
    order: { CreatedOn: "DESC" },
  });
  const currentBalance = Number(wallet?.Balance ?? 0);
  const expectedBalance = await getExpectedWalletBalance(acNo);

  const txns = await fetchAllWalletTxnsForAcNo(acNo);
  const entriesAsc = txns.map(mapTxnToEntry);

  const totalCredited = entriesAsc
    .filter((e) => e.type === "reward")
    .reduce((s, e) => s + e.amount, 0);
  const totalPaidOut = entriesAsc
    .filter((e) => e.type === "payout")
    .reduce((s, e) => s + Math.abs(e.amount), 0);

  return {
    acNo,
    clientId,
    currentBalance,
    expectedBalance,
    totalCredited: Number(totalCredited.toFixed(8)),
    totalPaidOut: Number(totalPaidOut.toFixed(8)),
    entries: [...entriesAsc].reverse(),
  };
}

export async function getWalletLedgerByClientid(clientid: string): Promise<WalletLedgerResult> {
  const account = await getAccountByClientid(clientid);
  const acNo = String(account.AcNo).trim();
  return buildLedgerForAcNo(acNo, account.Parent ?? null);
}

export async function getWalletLedgerByAcNo(acNo: string): Promise<WalletLedgerResult> {
  const trimmed = acNo.trim();
  const account = await AppDataSource.getRepository(Account).findOne({
    where: { AcNo: trimmed },
  });
  if (!account) {
    throw Object.assign(new Error("No MIPS account found for this AcNo"), { status: 404 });
  }
  return buildLedgerForAcNo(trimmed, account.Parent ?? null);
}
