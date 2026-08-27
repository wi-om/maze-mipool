/**
 * Re-run live MIPS distribution for payout-pending work days, then reconcile EU wallets.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/run-pending-payout-distribution.ts
 */
import "reflect-metadata";
import { DateTime } from "luxon";
import { AppDataSource, Account, Payout } from "../src/common";
import { executeMasterRewardDistribution } from "../src/modules/engine/service/dailyRewardCalculator";
import { reconcileBalance } from "../src/modules/crm/services/wallet/walletBalance.service";
import { getPendingSummary } from "../src/modules/engine/service/manualPayout.service";
import {
  findMipsRecordForWorkDate,
  prefetchMipsData,
} from "../src/modules/engine/service/backgroundRewardsCatchUp";
import { dubaiYesterdayIso } from "../src/modules/engine/service/payoutWorkDate.util";

const DUBAI = process.env.TIMEZONE || "Asia/Dubai";

async function getLastPaidThroughDate(): Promise<string | null> {
  const row = await AppDataSource.getRepository(Payout)
    .createQueryBuilder("p")
    .select('MAX(p."paidThroughDate")', "ptd")
    .where('p."Status" = :s', { s: "Complete" })
    .andWhere("p.txid IS NOT NULL AND BTRIM(p.txid) <> ''")
    .getRawOne<{ ptd: string | Date | null }>();
  const ptd = row?.ptd;
  if (!ptd) return null;
  if (ptd instanceof Date) {
    return DateTime.fromJSDate(ptd).toISODate();
  }
  const s = String(ptd).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = DateTime.fromJSDate(new Date(s));
  return parsed.isValid ? parsed.toISODate() : null;
}

function listWorkDates(fromExclusive: string, throughInclusive: string): string[] {
  const start = DateTime.fromISO(fromExclusive, { zone: DUBAI }).plus({ days: 1 });
  const end = DateTime.fromISO(throughInclusive, { zone: DUBAI });
  const dates: string[] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    dates.push(d.toISODate()!);
  }
  return dates;
}

async function main() {
  await AppDataSource.initialize();

  const lastPaidThrough = (await getLastPaidThroughDate()) ?? "1970-01-01";
  const through = dubaiYesterdayIso();
  const workDates = listWorkDates(lastPaidThrough, through);

  console.log("Last paid through:", lastPaidThrough);
  console.log("Through yesterday:", through);
  console.log("Work dates to distribute:", workDates.join(", ") || "(none)");

  if (!workDates.length) {
    await AppDataSource.destroy();
    return;
  }

  const before = await getPendingSummary();
  console.log("\nPayable before:", before.totalPayable.toFixed(8), "BTC | clients:", before.clientCount);

  const mipsData = await prefetchMipsData();
  if (!mipsData) {
    throw new Error("MIPS prefetch failed — check MIPS_REWARD_URL");
  }

  for (const workDate of workDates) {
    const dt = DateTime.fromISO(workDate, { zone: DUBAI });
    if (!findMipsRecordForWorkDate(mipsData, dt)) {
      console.warn(`Skip ${workDate}: no MIPS record for mips date ${dt.plus({ days: 1 }).toISODate()}`);
      continue;
    }
    console.log(`\nLive distribution: ${workDate}...`);
    await executeMasterRewardDistribution(dt.toJSDate(), mipsData);
  }

  const euAccounts = await AppDataSource.getRepository(Account).find({
    where: { Type: "EU" },
    select: ["AcNo"],
  });

  let fixed = 0;
  for (const { AcNo } of euAccounts) {
    const r = await reconcileBalance(AcNo);
    if (r.fixed) fixed += 1;
  }
  console.log(`\nReconciled ${fixed} EU wallet(s).`);

  const after = await getPendingSummary();
  console.log("\nPayable after:", after.totalPayable.toFixed(8), "BTC");
  console.log("Clients:", after.clientCount, "| Days pending:", after.daysPending);

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
