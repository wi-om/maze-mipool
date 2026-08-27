/**
 * Diagnose WalletTxn vs Payouts state.
 */
import "reflect-metadata";
import { AppDataSource } from "../src/common";

async function main() {
  await AppDataSource.initialize();

  const counts = await AppDataSource.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public."WalletTxn" WHERE "TxnType" = 'CREDIT') AS credits,
      (SELECT COUNT(*)::int FROM public."WalletTxn" WHERE "TxnType" = 'DEBIT') AS debits,
      (SELECT COUNT(*)::int FROM public."Payouts") AS total_payouts,
      (SELECT COUNT(*)::int FROM public."Payouts" WHERE "Status" = 'Complete') AS complete_payouts,
      (SELECT COUNT(*)::int FROM public."Payouts" WHERE "Status" = 'Complete' AND txid IS NOT NULL AND BTRIM(txid) <> '') AS complete_with_txid,
      (SELECT COUNT(*)::int FROM public."Payouts" WHERE "Status" = 'Void') AS void_payouts
  `);
  console.log("Counts:", JSON.stringify(counts[0], null, 2));

  const statusBreakdown = await AppDataSource.query(`
    SELECT "Status", COUNT(*)::int AS n FROM public."Payouts" GROUP BY "Status" ORDER BY n DESC
  `);
  console.log("Status breakdown:", statusBreakdown);

  const sample = await AppDataSource.query(`
    SELECT "Id", "AcNo", "Status", txid, "ToAddr", "Amount", "CreatedOn"
    FROM public."Payouts"
    ORDER BY "Id" DESC
    LIMIT 15
  `);
  console.log("Recent payouts:", JSON.stringify(sample, null, 2));

  const eligible = await AppDataSource.query(`
    SELECT p."Id", p."AcNo", p."Status", p.txid, p."ToAddr", p."Amount"
    FROM public."Payouts" p
    WHERE p."Status" = 'Complete' AND p.txid IS NOT NULL AND BTRIM(p.txid) <> ''
    ORDER BY p."Id" ASC
    LIMIT 10
  `);
  console.log("Eligible for DEBIT backfill:", JSON.stringify(eligible, null, 2));

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error("Diagnose failed:", err.message || err);
  process.exit(1);
});
