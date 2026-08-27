/**
 * Revert the January 2026 EU Rewards adjustment by restoring original values
 * from a pre-adjustment JSON backup.
 *
 * Restores Rewards.Amount + Rewards.Hashrate and the linked WalletTxn.Amount,
 * then recalculates running balances and reconciles wallet balances.
 *
 * Usage (backup path is required):
 *   $env:DB_NAME="postgres"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/revert-eu-rewards-jan-2026.ts <backupFile> --dry-run
 *   $env:DB_NAME="postgres"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/revert-eu-rewards-jan-2026.ts <backupFile> --execute
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { AppDataSource, Reward, WalletTxn } from "../src/common";
import { recalcRunningBalances } from "../src/modules/crm/services/wallet/walletTxn.service";
import { reconcileBalance } from "../src/modules/crm/services/wallet/walletBalance.service";

type BackupReward = {
  Id: number;
  AcNo: string;
  Amount: number | string | null;
  Hashrate: number | string | null;
  CreatedOn: string;
};
type BackupTxn = {
  Id: number;
  SourceId: number;
  Amount: number | string | null;
  RunningBalance: number | string | null;
};
type Backup = { rewards: BackupReward[]; walletTxns: BackupTxn[] };

const JAN_MONTH = "2026-01";

function round8(v: number): number {
  return Math.round(v * 1e8) / 1e8;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const dryRun = !execute;
  const backupArg = args.find((a) => !a.startsWith("--"));

  if (!backupArg) {
    console.error("Backup file path is required as the first argument.");
    process.exit(1);
  }
  const backupPath = path.isAbsolute(backupArg)
    ? backupArg
    : path.join(process.cwd(), backupArg);

  if (!fs.existsSync(backupPath)) {
    console.error("Backup file not found:", backupPath);
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8")) as Backup;
  if (!backup.rewards?.length) {
    console.error("Backup has no rewards.");
    process.exit(1);
  }

  console.log("DB_NAME:", process.env.DB_NAME);
  console.log("Backup:", backupPath);
  console.log("Backup rewards:", backup.rewards.length, "| walletTxns:", backup.walletTxns?.length ?? 0);

  await AppDataSource.initialize();
  const rewardRepo = AppDataSource.getRepository(Reward);
  const txnRepo = AppDataSource.getRepository(WalletTxn);

  const txnAmountById = new Map<number, number | string | null>();
  for (const t of backup.walletTxns ?? []) txnAmountById.set(t.Id, t.Amount);

  const affectedAcNos = new Set<string>();

  if (!dryRun) {
    for (const br of backup.rewards) {
      const row = await rewardRepo.findOne({ where: { Id: br.Id } });
      if (!row) {
        console.warn("Reward not found, skipping Id", br.Id);
        continue;
      }
      row.Amount = br.Amount == null ? row.Amount : round8(Number(br.Amount));
      if (br.Hashrate != null) row.Hashrate = String(br.Hashrate);
      await rewardRepo.save(row);
      affectedAcNos.add(row.AcNo.trim());
    }

    for (const bt of backup.walletTxns ?? []) {
      const txn = await txnRepo.findOne({ where: { Id: bt.Id } });
      if (!txn) continue;
      if (bt.Amount != null) txn.Amount = round8(Number(bt.Amount));
      await txnRepo.save(txn);
    }

    for (const acNo of affectedAcNos) {
      await recalcRunningBalances(acNo);
      await reconcileBalance(acNo);
    }
  } else {
    for (const br of backup.rewards) affectedAcNos.add(br.AcNo.trim());
  }

  const verify = await rewardRepo
    .createQueryBuilder("r")
    .where(`to_char(r."CreatedOn", 'YYYY-MM') = :ym`, { ym: JAN_MONTH })
    .select("COUNT(r.Id)", "rows")
    .addSelect(`COALESCE(SUM(r."Amount"), 0)`, "totalAmount")
    .getRawOne<{ rows: string; totalAmount: string }>();

  console.log("\n--- Summary ---");
  console.log("Mode:", dryRun ? "DRY RUN (no DB writes)" : "EXECUTED");
  console.log("Affected accounts:", affectedAcNos.size);
  console.log("Jan 2026 rows:", verify?.rows);
  console.log("Jan 2026 total Amount:", verify?.totalAmount, "BTC");
  if (dryRun) console.log("\nRe-run with --execute to apply.");

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
