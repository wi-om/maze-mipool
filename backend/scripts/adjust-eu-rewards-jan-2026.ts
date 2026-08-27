/**
 * Adjust January 2026 EU Rewards (Rewards table) to per-day target totals,
 * making the month total exactly TARGET_MONTH_TOTAL.
 *
 * Also syncs the linked WalletTxn CREDIT rows, recalculates each account's
 * running balances, and reconciles Wallets.Balance.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/adjust-eu-rewards-jan-2026.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/adjust-eu-rewards-jan-2026.ts --execute
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { AppDataSource, Reward, WalletTxn } from "../src/common";
import {
  recalcRunningBalances,
} from "../src/modules/crm/services/wallet/walletTxn.service";
import { reconcileBalance } from "../src/modules/crm/services/wallet/walletBalance.service";

const JAN_MONTH = "2026-01";
const TARGET_MONTH_TOTAL = 0.12523722;

/** Per-day gross-amount targets, index 0 = Jan 1 ... index 30 = Jan 31. */
const DAILY_TARGETS: Record<string, number> = {
  "2026-01-01": 0.00397252,
  "2026-01-02": 0.00396872,
  "2026-01-03": 0.00397057,
  "2026-01-04": 0.0039753,
  "2026-01-05": 0.00397619,
  "2026-01-06": 0.00397151,
  "2026-01-07": 0.00399891,
  "2026-01-08": 0.00396877,
  "2026-01-09": 0.00401937,
  "2026-01-10": 0.00401089,
  "2026-01-11": 0.00401442,
  "2026-01-12": 0.0040156,
  "2026-01-13": 0.00401622,
  "2026-01-14": 0.00402572,
  "2026-01-15": 0.0040242,
  "2026-01-16": 0.00402572,
  "2026-01-17": 0.0040147,
  "2026-01-18": 0.00401166,
  "2026-01-19": 0.00401242,
  "2026-01-20": 0.00402002,
  "2026-01-21": 0.00401926,
  "2026-01-22": 0.00403902,
  "2026-01-23": 0.00415264,
  "2026-01-24": 0.0041553,
  "2026-01-25": 0.00414694,
  "2026-01-26": 0.0041439,
  "2026-01-27": 0.00411464,
  "2026-01-28": 0.004123,
  "2026-01-29": 0.00411084,
  "2026-01-30": 0.00411084,
  "2026-01-31": 0.00410742,
};

const LAST_DAY = "2026-01-31";

function round8(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function scaleOptional(value: number | string | null | undefined, factor: number): string | null {
  if (value == null || value === "" || Number.isNaN(Number(value))) return (value as string) ?? null;
  return round8(Number(value) * factor).toFixed(8);
}

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  await AppDataSource.initialize();
  const rewardRepo = AppDataSource.getRepository(Reward);
  const txnRepo = AppDataSource.getRepository(WalletTxn);

  const rows = await rewardRepo
    .createQueryBuilder("r")
    .where(`to_char(r."CreatedOn", 'YYYY-MM') = :ym`, { ym: JAN_MONTH })
    .orderBy(`DATE(r."CreatedOn")`, "ASC")
    .addOrderBy("r.Id", "ASC")
    .getMany();

  if (!rows.length) {
    console.error("No EU Rewards found for January 2026.");
    process.exit(1);
  }

  // Group by UTC day.
  const byDay = new Map<string, Reward[]>();
  for (const r of rows) {
    if (!r.CreatedOn) continue;
    const key = dayKey(r.CreatedOn instanceof Date ? r.CreatedOn : new Date(r.CreatedOn));
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }

  const missing = [...byDay.keys()].filter((k) => !(k in DAILY_TARGETS));
  if (missing.length) {
    console.error("Days present in DB but missing a target:", missing.join(", "));
    process.exit(1);
  }

  // Backup rewards + linked txns.
  const backupDir = path.join(__dirname, "..", "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const rewardIds = rows.map((r) => r.Id);
  const txns = await txnRepo
    .createQueryBuilder("t")
    .where(`t."SourceType" = 'REWARD'`)
    .andWhere(`t."SourceId" IN (:...ids)`, { ids: rewardIds })
    .getMany();

  const backup = {
    rewards: rows.map((r) => ({
      Id: r.Id,
      AcNo: r.AcNo,
      Amount: r.Amount,
      Hashrate: r.Hashrate,
      CreatedOn: r.CreatedOn,
    })),
    walletTxns: txns.map((t) => ({
      Id: t.Id,
      SourceId: t.SourceId,
      Amount: t.Amount,
      RunningBalance: t.RunningBalance,
    })),
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `eu_rewards_jan2026_before_adjust_${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log("Backup written:", backupFile);

  const txnByReward = new Map<number, WalletTxn>();
  for (const t of txns) txnByReward.set(t.SourceId, t);

  const affectedAcNos = new Set<string>();
  let monthAllocated = 0;
  const dayReport: Array<{ day: string; oldTotal: number; newTotal: number; factor: number }> = [];

  const days = [...byDay.keys()].sort();
  for (const day of days) {
    const dayRows = byDay.get(day)!;
    const target = DAILY_TARGETS[day];
    const oldTotal = round8(dayRows.reduce((s, r) => s + Number(r.Amount || 0), 0));
    if (oldTotal <= 0) {
      console.error(`Day ${day} has zero total; cannot scale.`);
      process.exit(1);
    }
    const factor = target / oldTotal;

    let dayAllocated = 0;
    for (let i = 0; i < dayRows.length; i++) {
      const row = dayRows[i];
      const isLastRowOfDay = i === dayRows.length - 1;
      const oldAmount = Number(row.Amount || 0);

      let newAmount: number;
      if (isLastRowOfDay) {
        // Make the day exact; on the final day absorb month rounding to hit month target.
        newAmount = round8(target - dayAllocated);
        if (day === LAST_DAY) {
          const monthSoFar = round8(monthAllocated + dayAllocated);
          newAmount = round8(TARGET_MONTH_TOTAL - monthSoFar);
        }
      } else {
        newAmount = round8(oldAmount * factor);
      }
      dayAllocated = round8(dayAllocated + newAmount);

      affectedAcNos.add(row.AcNo.trim());

      if (!dryRun) {
        row.Amount = newAmount;
        const newHashrate = scaleOptional(row.Hashrate, factor);
        if (newHashrate != null) row.Hashrate = newHashrate;
        await rewardRepo.save(row);

        const txn = txnByReward.get(row.Id);
        if (txn) {
          txn.Amount = newAmount;
          await txnRepo.save(txn);
        }
      }
    }

    monthAllocated = round8(monthAllocated + dayAllocated);
    dayReport.push({ day, oldTotal, newTotal: dayAllocated, factor });
  }

  if (!dryRun) {
    for (const acNo of affectedAcNos) {
      await recalcRunningBalances(acNo);
      await reconcileBalance(acNo);
    }
  }

  // Verify.
  const verify = await rewardRepo
    .createQueryBuilder("r")
    .where(`to_char(r."CreatedOn", 'YYYY-MM') = :ym`, { ym: JAN_MONTH })
    .select("COUNT(r.Id)", "rows")
    .addSelect(`COALESCE(SUM(r."Amount"), 0)`, "totalAmount")
    .getRawOne<{ rows: string; totalAmount: string }>();

  console.log("\n--- Summary ---");
  console.log("Mode:", dryRun ? "DRY RUN (no DB writes)" : "EXECUTED");
  console.log("Reward rows:", rows.length, "across", days.length, "days");
  console.log("Affected accounts:", affectedAcNos.size);
  console.log("Target month total:", TARGET_MONTH_TOTAL, "BTC");
  console.log("Projected month total:", monthAllocated, "BTC");
  console.log("\nPer-day (day | old -> new | factor):");
  for (const d of dayReport) {
    console.log(`  ${d.day}: ${d.oldTotal.toFixed(8)} -> ${d.newTotal.toFixed(8)}  (x${d.factor.toFixed(6)})`);
  }
  if (!dryRun) {
    console.log("\nPost-update DB verification:");
    console.log("  Rows:", verify?.rows);
    console.log("  Total Amount:", verify?.totalAmount, "BTC");
  } else {
    console.log("\nRe-run with --execute to apply.");
  }

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
