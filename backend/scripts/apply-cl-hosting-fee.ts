/**
 * Apply a date-based hosting fee to CLRewards and populate
 * hostingfee_amount / hostingfee_hashrate / net_amount / net_hashrate.
 *
 * Schedule:
 *   rewardOn <  2026-02-01  -> 5%   (through 31 Jan 2026)
 *   rewardOn >= 2026-02-01  -> 10%
 *
 * The fee is applied uniformly to every row (including the Hashrate = 0
 * carry-forward row). Wallet balances are NOT modified.
 *
 * Usage:
 *   $env:DB_NAME="postgres"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/apply-cl-hosting-fee.ts --dry-run
 *   $env:DB_NAME="postgres"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/apply-cl-hosting-fee.ts --execute
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { AppDataSource } from "../src/common";

const FEE_CUTOFF = "2026-02-01"; // rewardOn < cutoff => FEE_BEFORE, else FEE_AFTER
const FEE_BEFORE = 5;
const FEE_AFTER = 10;

const PCT_EXPR = `(CASE WHEN "rewardOn" < '${FEE_CUTOFF}' THEN ${FEE_BEFORE} ELSE ${FEE_AFTER} END)`;

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  await AppDataSource.initialize();
  console.log("DB_NAME:", process.env.DB_NAME);

  // Projected per-month summary (each month is fully before/after the cutoff).
  const projected = await AppDataSource.query(`
    SELECT to_char("rewardOn", 'YYYY-MM') AS ym,
           COUNT(*)::int AS rows_affected,
           MAX(${PCT_EXPR}) AS pct,
           SUM("Amount")::numeric(24,8) AS gross_amount,
           SUM(ROUND(("Amount" * ${PCT_EXPR} / 100.0)::numeric, 8))::numeric(24,8) AS new_fee_amount,
           SUM(ROUND(("Amount" - "Amount" * ${PCT_EXPR} / 100.0)::numeric, 8))::numeric(24,8) AS new_net_amount
    FROM "CLRewards"
    GROUP BY 1
    ORDER BY 1;
  `);

  console.log("\nProjected per-month (all rows, incl. carry-forward):");
  console.table(projected);

  if (dryRun) {
    console.log("\nDRY RUN — no writes. Re-run with --execute to apply.");
    await AppDataSource.destroy();
    process.exit(0);
  }

  // Backup affected rows before writing.
  const backupRows = await AppDataSource.query(`
    SELECT "Id", "Amount", "Hashrate", "hostingfee_amount", "hostingfee_hashrate",
           "net_amount", "net_hashrate", "rewardOn"
    FROM "CLRewards";
  `);
  const backupDir = path.join(__dirname, "..", "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(
    backupDir,
    `clrewards_hostingfee_before_${process.env.DB_NAME}_${stamp}.json`,
  );
  fs.writeFileSync(backupFile, JSON.stringify(backupRows, null, 2));
  console.log("\nBackup written:", backupFile);

  const result = await AppDataSource.query(`
    UPDATE "CLRewards"
    SET hostingfee_amount   = ROUND(("Amount"   * ${PCT_EXPR} / 100.0)::numeric, 8),
        hostingfee_hashrate = ROUND(("Hashrate" * ${PCT_EXPR} / 100.0)::numeric, 8),
        net_amount          = ROUND(("Amount"   - "Amount"   * ${PCT_EXPR} / 100.0)::numeric, 8),
        net_hashrate        = ROUND(("Hashrate" - "Hashrate" * ${PCT_EXPR} / 100.0)::numeric, 8);
  `);
  const updated = Array.isArray(result) && result.length > 1 ? result[1] : result;
  console.log("Rows updated:", updated);

  const verify = await AppDataSource.query(`
    SELECT to_char("rewardOn", 'YYYY-MM') AS ym,
           COUNT(*)::int AS rows,
           SUM("Amount")::numeric(24,8) AS gross_amount,
           SUM(COALESCE("hostingfee_amount",0))::numeric(24,8) AS fee_amount,
           SUM(COALESCE("net_amount",0))::numeric(24,8) AS net_amount
    FROM "CLRewards"
    GROUP BY 1
    ORDER BY 1;
  `);
  console.log("\nPost-update per-month:");
  console.table(verify);

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
