/**
 * Scale January 2026 CLRewards gross Amount/Hashrate to a target total.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/adjust-cl-rewards-jan-2026.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/adjust-cl-rewards-jan-2026.ts --execute
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { AppDataSource, CLReward } from "../src/common";

const TARGET_GROSS_AMOUNT = 0.42619331;
const JAN_MONTH = "2026-01";
const ADJUST_DESC = "Jan 2026 client payment correction";

function round8(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function scaleOptional(value: number | null | undefined, factor: number): number | null {
  if (value == null || Number.isNaN(Number(value))) return value ?? null;
  return round8(Number(value) * factor);
}

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(CLReward);

  const rows = await repo
    .createQueryBuilder("reward")
    .where(`to_char(reward.RewardOn, 'YYYY-MM') = :ym`, { ym: JAN_MONTH })
    .orderBy("reward.Id", "ASC")
    .getMany();

  if (!rows.length) {
    console.error("No CLRewards found for January 2026.");
    process.exit(1);
  }

  const currentAmount = round8(rows.reduce((s, r) => s + Number(r.Amount || 0), 0));
  const currentHashrate = round8(rows.reduce((s, r) => s + Number(r.Hashrate || 0), 0));

  if (currentAmount <= 0) {
    console.error("Current January gross amount is zero; cannot scale.");
    process.exit(1);
  }

  const factor = TARGET_GROSS_AMOUNT / currentAmount;
  const targetHashrate = round8(currentHashrate * factor);

  const backup = rows.map((r) => ({
    Id: r.Id,
    AcNo: r.AcNo,
    Amount: r.Amount,
    Hashrate: r.Hashrate,
    hostingfee_amount: r.hostingfee_amount,
    hostingfee_hashrate: r.hostingfee_hashrate,
    net_amount: r.net_amount,
    net_hashrate: r.net_hashrate,
    RewardOn: r.RewardOn,
  }));

  const backupDir = path.join(__dirname, "..", "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(
    backupDir,
    `clrewards_jan2026_before_adjust_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log("Backup written:", backupFile);

  const updates: Array<{
    id: number;
    oldAmount: number;
    newAmount: number;
    oldHashrate: number;
    newHashrate: number;
  }> = [];

  let amountAllocated = 0;
  let hashrateAllocated = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const oldAmount = Number(row.Amount || 0);
    const oldHashrate = Number(row.Hashrate || 0);
    const isLast = i === rows.length - 1;

    const newAmount = isLast
      ? round8(TARGET_GROSS_AMOUNT - amountAllocated)
      : round8(oldAmount * factor);
    const newHashrate = isLast
      ? round8(targetHashrate - hashrateAllocated)
      : round8(oldHashrate * factor);

    amountAllocated = round8(amountAllocated + newAmount);
    hashrateAllocated = round8(hashrateAllocated + newHashrate);

    updates.push({
      id: row.Id,
      oldAmount,
      newAmount,
      oldHashrate,
      newHashrate,
    });

    if (dryRun) continue;

    row.Amount = newAmount;
    row.Hashrate = newHashrate;
    row.hostingfee_amount = scaleOptional(row.hostingfee_amount, factor);
    row.hostingfee_hashrate = scaleOptional(row.hostingfee_hashrate, factor);
    row.net_amount = scaleOptional(row.net_amount, factor);
    row.net_hashrate = scaleOptional(row.net_hashrate, factor);
    row.adjust_desc = ADJUST_DESC;
    row.adjust_amount = round8(newAmount - oldAmount);
    row.adjust_hashrate = round8(newHashrate - oldHashrate);

    await repo.save(row);
  }

  const verifyQb = repo
    .createQueryBuilder("reward")
    .where(`to_char(reward.RewardOn, 'YYYY-MM') = :ym`, { ym: JAN_MONTH });
  verifyQb
    .select("COUNT(reward.Id)", "rows")
    .addSelect("COALESCE(SUM(reward.Amount), 0)", "totalAmount")
    .addSelect("COALESCE(SUM(reward.Hashrate), 0)", "totalHashrate");
  const verify = await verifyQb.getRawOne<{
    rows: string;
    totalAmount: string;
    totalHashrate: string;
  }>();

  console.log("\n--- Summary ---");
  console.log("Mode:", dryRun ? "DRY RUN (no DB writes)" : "EXECUTED");
  console.log("Rows:", rows.length);
  console.log("AcNo(s):", [...new Set(rows.map((r) => r.AcNo.trim()))].join(", "));
  console.log("Previous gross amount:", currentAmount, "BTC");
  console.log("Target gross amount:", TARGET_GROSS_AMOUNT, "BTC");
  console.log("Scale factor:", factor.toFixed(8));
  console.log("Previous hashrate:", currentHashrate, "TH");
  console.log("Target hashrate:", targetHashrate, "TH");
  console.log("\nSample updates (first 3):");
  for (const u of updates.slice(0, 3)) {
    console.log(
      `  Id ${u.id}: ${u.oldAmount} -> ${u.newAmount} BTC, ${u.oldHashrate} -> ${u.newHashrate} TH`,
    );
  }
  if (!dryRun) {
    console.log("\nPost-update verification:");
    console.log("  Rows:", verify?.rows);
    console.log("  Total Amount:", verify?.totalAmount, "BTC");
    console.log("  Total Hashrate:", verify?.totalHashrate, "TH");
  } else {
    console.log("\nProjected totals after apply:");
    console.log("  Total Amount:", amountAllocated, "BTC");
    console.log("  Total Hashrate:", hashrateAllocated, "TH");
    console.log("\nRe-run with --execute to apply.");
  }

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
