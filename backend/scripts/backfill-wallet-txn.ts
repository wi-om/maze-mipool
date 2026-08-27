/**
 * Backfill WalletTxn from historical Rewards and Payouts.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/backfill-wallet-txn.ts
 */
import "reflect-metadata";
import { AppDataSource, Account, Reward, Payout } from "../src/common";
import {
  findWalletForAcNo,
  insertCreditFromReward,
  insertDebitFromPayout,
  recalcRunningBalances,
} from "../src/modules/crm/services/wallet/walletTxn.service";
import { getExpectedWalletBalance } from "../src/modules/crm/services/wallet/walletBalance.service";
import { Wallet } from "../src/common/entities/Wallet";

async function main() {
  await AppDataSource.initialize();

  const existing = await AppDataSource.query(`SELECT COUNT(*)::int AS n FROM public."WalletTxn"`);
  console.log("Existing WalletTxn rows:", existing[0]?.n ?? 0);

  const rewardRepo = AppDataSource.getRepository(Reward);
  const payoutRepo = AppDataSource.getRepository(Payout);
  const walletRepo = AppDataSource.getRepository(Wallet);

  const rewards = await rewardRepo.find({ order: { Id: "ASC" } });
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

  let credits = 0;
  for (const reward of rewards) {
    const wallet = await resolveWallet(reward.AcNo);
    if (!wallet) continue;
    const row = await insertCreditFromReward(reward, wallet);
    if (row) credits += 1;
  }
  console.log("CREDIT rows processed:", credits);

  let debits = 0;
  for (const payout of payouts) {
    const wallet = await resolveWallet(payout.AcNo);
    if (!wallet) continue;
    try {
      const row = await insertDebitFromPayout(payout, wallet, undefined, {
        allowMissingTxid: !payout.txid?.trim(),
      });
      if (row) debits += 1;
    } catch (err) {
      console.warn(`Skip payout ${payout.Id}:`, (err as Error).message);
    }
  }
  console.log("DEBIT rows processed:", debits);

  const euAccounts = await AppDataSource.getRepository(Account).find({
    where: { Type: "EU" },
    select: ["AcNo"],
  });

  let drift = 0;
  for (const { AcNo } of euAccounts) {
    const acNo = AcNo.trim();
    await recalcRunningBalances(acNo);

    const wallet = await walletRepo.findOne({ where: { AcNo: acNo, IsActive: true } });
    const stored = Number(wallet?.Balance ?? 0);
    const expected = await getExpectedWalletBalance(acNo);
    if (Math.abs(stored - expected) > 1e-8) {
      console.warn(`Balance drift ${acNo}: wallet=${stored.toFixed(8)} expected=${expected.toFixed(8)}`);
      drift += 1;
    }
  }

  const total = await AppDataSource.query(`SELECT COUNT(*)::int AS n FROM public."WalletTxn"`);
  console.log("\nTotal WalletTxn rows:", total[0]?.n);
  console.log("Accounts with wallet/expected drift:", drift);

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err.message || err);
  process.exit(1);
});
