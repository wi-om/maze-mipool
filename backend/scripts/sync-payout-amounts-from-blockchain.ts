/**
 * Sync Payouts amounts from blockchain_payout for one txid (blockchain is source of truth).
 * Usage:
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/sync-payout-amounts-from-blockchain.ts --txid <txid> --dry-run
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/sync-payout-amounts-from-blockchain.ts --txid <txid> --execute
 */
import "reflect-metadata";
import { AppDataSource } from "../src/common";
import { reconcileBalance } from "../src/modules/crm/services/wallet/walletBalance.service";
import { recalcRunningBalances } from "../src/modules/crm/services/wallet/walletTxn.service";

const DEFAULT_TXID = "0538fef5318fff5069f886394a3f0aafe17e3b94f128de242c3accc084194928";

async function main() {
  const execute = process.argv.includes("--execute");
  const txidIdx = process.argv.indexOf("--txid");
  const txid = txidIdx >= 0 ? process.argv[txidIdx + 1] : DEFAULT_TXID;

  await AppDataSource.initialize();
  console.log("DB_NAME:", process.env.DB_NAME);
  console.log("TXID:", txid);

  const diffs = await AppDataSource.query(
    `
    SELECT p."Id" AS payout_id, TRIM(p."ToAddr") AS addr, TRIM(p."AcNo") AS acno,
           p."Amount"::numeric(24,8) AS payout_amt,
           b.amount::numeric(24,8) AS bc_amt,
           (p."Amount" - b.amount)::numeric(24,8) AS delta
    FROM "Payouts" p
    JOIN blockchain_payout b
      ON btrim(p.txid) = btrim(b.txid) AND TRIM(p."ToAddr") = TRIM(b.address)
    WHERE btrim(p.txid) = $1
    ORDER BY ABS(p."Amount" - b.amount) DESC
    `,
    [txid],
  );

  const sums = await AppDataSource.query(
    `
    SELECT SUM(p."Amount")::numeric(24,8) AS payout_gross,
           SUM(b.amount)::numeric(24,8) AS bc_gross,
           MAX(b.txid_fee)::numeric(24,8) AS bc_fee
    FROM "Payouts" p
    JOIN blockchain_payout b
      ON btrim(p.txid) = btrim(b.txid) AND TRIM(p."ToAddr") = TRIM(b.address)
    WHERE btrim(p.txid) = $1
    `,
    [txid],
  );

  console.log("Before:", sums[0]);
  const changed = diffs.filter((r: any) => Number(r.delta) !== 0);
  console.log(`Rows with amount diff: ${changed.length}`);
  for (const r of changed) {
    console.log(`  ${r.addr.slice(0, 20)}… payout ${r.payout_amt} -> bc ${r.bc_amt} (delta ${r.delta})`);
  }

  if (!changed.length) {
    console.log("Already in sync.");
    await AppDataSource.destroy();
    return;
  }

  if (!execute) {
    console.log("\nDRY RUN — pass --execute to update Payouts + WalletTxn.");
    await AppDataSource.destroy();
    return;
  }

  const affectedAcNos = new Set<string>();

  await AppDataSource.transaction(async (manager) => {
    for (const row of changed) {
      affectedAcNos.add(String(row.acno).trim());

      await manager.query(
        `UPDATE "Payouts" SET "Amount" = $1 WHERE "Id" = $2`,
        [Number(row.bc_amt), row.payout_id],
      );

      await manager.query(
        `UPDATE "WalletTxn"
         SET "Amount" = $1
         WHERE "SourceType" = 'PAYOUT' AND "SourceId" = $2`,
        [Number(row.bc_amt), row.payout_id],
      );
    }
  });

  for (const acNo of affectedAcNos) {
    await recalcRunningBalances(acNo);
    await reconcileBalance(acNo);
  }

  const after = await AppDataSource.query(
    `
    SELECT SUM(p."Amount")::numeric(24,8) AS payout_gross,
           SUM(b.amount)::numeric(24,8) AS bc_gross
    FROM "Payouts" p
    JOIN blockchain_payout b
      ON btrim(p.txid) = btrim(b.txid) AND TRIM(p."ToAddr") = TRIM(b.address)
    WHERE btrim(p.txid) = $1
    `,
    [txid],
  );

  console.log("\nAfter:", after[0]);
  console.log("Updated payout rows:", changed.length);
  console.log("Reconciled accounts:", affectedAcNos.size);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
