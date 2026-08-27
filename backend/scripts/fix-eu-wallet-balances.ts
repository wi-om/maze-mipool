/**
 * Fix MI81726861 over-recorded payouts and reconcile all EU wallet balances.
 *
 * Root cause: Feb 2026 payouts 1510/1534/1558 double-paid days already covered by payout 1486;
 * payout 2998 is an exact duplicate of 2974 (same txid, date, amount).
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/fix-eu-wallet-balances.ts
 */
import "reflect-metadata";
import { AppDataSource, Account, Payout } from "../src/common";
import { reconcileBalance } from "../src/modules/crm/services/wallet/walletBalance.service";
import { getPendingSummary } from "../src/modules/engine/service/manualPayout.service";

const AC = "MI81726861";
const VOID_PAYOUT_IDS = [1510, 1534, 1558, 2998];

async function main() {
  await AppDataSource.initialize();

  const before = await getPendingSummary();
  console.log("Before:", before.totalPayable.toFixed(8), "BTC | clients:", before.clientCount);

  const payoutRepo = AppDataSource.getRepository(Payout);
  for (const id of VOID_PAYOUT_IDS) {
    const row = await payoutRepo.findOne({ where: { Id: id } });
    if (!row) {
      console.warn(`Payout ${id} not found — skip`);
      continue;
    }
    if (row.AcNo.trim() !== AC) {
      throw new Error(`Payout ${id} is for ${row.AcNo.trim()}, expected ${AC}`);
    }
    if (row.Status === "Void") {
      console.log(`Payout ${id} already void`);
      continue;
    }
    await payoutRepo.update(id, { Status: "Void" });
    console.log(`Voided payout ${id} (${Number(row.Amount).toFixed(8)} BTC, ${row.CreatedOn})`);
  }

  const euAccounts = await AppDataSource.getRepository(Account).find({
    where: { Type: "EU" },
    select: ["AcNo"],
  });

  let fixed = 0;
  for (const { AcNo } of euAccounts) {
    const r = await reconcileBalance(AcNo);
    if (r.fixed) fixed += 1;
    if (AcNo.trim() === AC) {
      console.log(
        `\n${AC} wallet: ${r.previousBalance.toFixed(8)} → ${r.expectedBalance.toFixed(8)} BTC`,
      );
    }
  }
  console.log(`\nReconciled ${fixed} EU wallet(s).`);

  const after = await getPendingSummary();
  console.log("\nAfter:", after.totalPayable.toFixed(8), "BTC | clients:", after.clientCount);

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
