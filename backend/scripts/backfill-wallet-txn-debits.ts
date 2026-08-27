/**
 * Backfill WalletTxn DEBIT rows from historical Complete payouts (idempotent).
 * Includes payouts without txid (legacy data before on-chain txid tracking).
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/backfill-wallet-txn-debits.ts
 */
import "reflect-metadata";
import { AppDataSource, Account, Payout } from "../src/common";
import {
  findWalletForAcNo,
  insertDebitFromPayout,
  recalcRunningBalances,
} from "../src/modules/crm/services/wallet/walletTxn.service";
import { Wallet } from "../src/common/entities/Wallet";

async function main() {
  await AppDataSource.initialize();

  const before = await AppDataSource.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public."WalletTxn" WHERE "TxnType" = 'DEBIT') AS debits,
      (SELECT COUNT(*)::int FROM public."Payouts" WHERE "Status" = 'Complete') AS complete_payouts
  `);
  console.log("Before:", before[0]);

  const payoutRepo = AppDataSource.getRepository(Payout);
  const payouts = await payoutRepo
    .createQueryBuilder("p")
    .where(`p."Status" = :s`, { s: "Complete" })
    .orderBy("p.Id", "ASC")
    .getMany();

  const walletCache = new Map<string, Wallet | null>();
  const resolveWallet = async (acNo: string) => {
    const key = acNo.trim();
    if (!walletCache.has(key)) {
      walletCache.set(key, await findWalletForAcNo(key));
    }
    return walletCache.get(key);
  };

  let debits = 0;
  let skippedNoWallet = 0;
  let skippedZero = 0;
  let errors = 0;

  for (const payout of payouts) {
    const wallet = await resolveWallet(payout.AcNo);
    if (!wallet) {
      skippedNoWallet += 1;
      continue;
    }
    if (Number(payout.Amount || 0) <= 0) {
      skippedZero += 1;
      continue;
    }
    try {
      const row = await insertDebitFromPayout(payout, wallet, undefined, { allowMissingTxid: true });
      if (row) debits += 1;
    } catch (err) {
      errors += 1;
      console.warn(`Skip payout ${payout.Id}:`, (err as Error).message);
    }
  }

  console.log("DEBIT rows inserted:", debits);
  console.log("Skipped (no wallet):", skippedNoWallet);
  console.log("Skipped (zero amount):", skippedZero);
  console.log("Errors:", errors);

  const euAccounts = await AppDataSource.getRepository(Account).find({
    where: { Type: "EU" },
    select: ["AcNo"],
  });

  for (const { AcNo } of euAccounts) {
    await recalcRunningBalances(AcNo.trim());
  }
  console.log("Running balances recalculated for", euAccounts.length, "EU accounts");

  const after = await AppDataSource.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public."WalletTxn" WHERE "TxnType" = 'CREDIT') AS credits,
      (SELECT COUNT(*)::int FROM public."WalletTxn" WHERE "TxnType" = 'DEBIT') AS debits
  `);
  console.log("After:", after[0]);

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error("Debit backfill failed:", err.message || err);
  process.exit(1);
});
