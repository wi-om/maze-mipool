/**
 * Fix remaining Compare issues (Dec 3 count, Dec 31 ±7 sat):
 * - Set each Complete payout Amount to mapped blockchain_payout amount by ToAddr
 * - Void payout rows with no matching blockchain address for that txid
 */
import "reflect-metadata";
import { AppDataSource } from "../src/common";

const TXIDS = [
  "5b3eb839aebb6eaba59289347ad9dc8ab98f14d4d5b1f390a29b4b95fd21cf8c", // Dec 3
  "43b6ae36893873fccceaf0cdbfeda6e26b33a19df4d87bc5cf26077a7e99147c", // Dec 31
  "6e76ed7ddcbd8e712df185de4d17d961be503f5cbf5b42c93370372ffe7d00dc", // Dec 31
];

const execute = process.argv.includes("--execute");

async function main() {
  await AppDataSource.initialize();
  console.log("DB:", process.env.DB_NAME, execute ? "EXECUTE" : "DRY RUN");

  let amountFixes = 0;
  let voids = 0;

  for (const txid of TXIDS) {
    console.log(`\n=== ${txid.slice(0, 12)}… ===`);

    const bcRows: Array<{ addr: string; amount: string }> = await AppDataSource.query(
      `
      SELECT TRIM(address) AS addr, MAX(amount)::text AS amount
      FROM blockchain_payout
      WHERE btrim(txid) = $1
        AND ac_no IS NOT NULL AND btrim(ac_no) <> ''
        AND address IS NOT NULL AND btrim(address) <> ''
      GROUP BY TRIM(address)
      `,
      [txid],
    );
    const bcByAddr = new Map(bcRows.map((r) => [r.addr, Number(r.amount)]));

    const payouts: Array<{ Id: number; addr: string; amount: string; c: string }> =
      await AppDataSource.query(
        `
        SELECT p."Id", TRIM(p."ToAddr") AS addr, p."Amount"::text AS amount, TRIM(p."mipContractNo") AS c
        FROM "Payouts" p
        WHERE btrim(p.txid) = $1 AND p."Status" = 'Complete'
        ORDER BY p."Id"
        `,
        [txid],
      );

    for (const p of payouts) {
      const chainAmt = bcByAddr.get(p.addr);
      if (chainAmt == null) {
        console.log(`  VOID #${p.Id} ${p.c} ${p.addr.slice(0, 20)}… (not on chain)`);
        if (execute) {
          await AppDataSource.query(
            `UPDATE "Payouts" SET "Status" = 'Void', "txid" = NULL WHERE "Id" = $1`,
            [p.Id],
          );
        }
        voids += 1;
        continue;
      }
      const cur = Number(p.amount);
      if (Math.abs(cur - chainAmt) < 1e-12) continue;
      console.log(
        `  FIX #${p.Id} ${p.c} ${cur.toFixed(8)} -> ${chainAmt.toFixed(8)}`,
      );
      if (execute) {
        await AppDataSource.query(`UPDATE "Payouts" SET "Amount" = $2 WHERE "Id" = $1`, [
          p.Id,
          chainAmt,
        ]);
      }
      amountFixes += 1;
    }

    // verify
    const [check] = await AppDataSource.query(
      `
      SELECT COUNT(*)::int AS p_count,
             COALESCE(SUM("Amount"),0)::numeric(24,8) AS p_gross
      FROM "Payouts"
      WHERE btrim(txid) = $1 AND "Status" = 'Complete'
      `,
      [txid],
    );
    const bGross = [...bcByAddr.values()].reduce((s, n) => s + n, 0);
    console.log(
      `  after: payout ${check.p_count}/${bcByAddr.size} gross ${check.p_gross} vs bc ${bGross.toFixed(8)}`,
    );
  }

  console.log(`\nDone. amountFixes=${amountFixes} voids=${voids}${execute ? "" : " (dry run)"}`);
  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
