import "reflect-metadata";
import { AppDataSource } from "../src/common";
import { reconcileBalance } from "../src/modules/crm/services/wallet/walletBalance.service";
import { recalcRunningBalances } from "../src/modules/crm/services/wallet/walletTxn.service";

const DEFAULT_TXID = "d7eddf16aa101f02faec0b2e1c7665e81f7126f7a3fee8969aa0e3f609237b7d";

function padAcNo(acNo: string): string {
  return acNo.trim().padEnd(12, " ");
}

function padContract(c: string): string {
  return c.trim().padEnd(12, " ");
}

async function main() {
  const execute = process.argv.includes("--execute");
  const txidIdx = process.argv.indexOf("--txid");
  const TXID = txidIdx >= 0 ? process.argv[txidIdx + 1] : DEFAULT_TXID;
  if (!TXID) {
    console.error("Pass --txid <txid>");
    process.exit(1);
  }

  await AppDataSource.initialize();
  console.log("TXID:", TXID);

  const orphanP = await AppDataSource.query(
    `
    SELECT p."Id", TRIM(p."ToAddr") addr, p."Amount"::numeric amt, TRIM(p."AcNo") acno
    FROM "Payouts" p
    WHERE btrim(p.txid) = $1
      AND NOT EXISTS (
        SELECT 1 FROM blockchain_payout b
        WHERE btrim(b.txid) = btrim(p.txid) AND TRIM(b.address) = TRIM(p."ToAddr")
      )
    `,
    [TXID],
  );

  const orphanB = await AppDataSource.query(
    `
    SELECT b.id, TRIM(b.address) addr, b.amount::numeric amt, TRIM(b.ac_no) acno,
           TRIM(b.mip_contract_no) contract, b.txid_fee::numeric fee, b.txn_date
    FROM blockchain_payout b
    WHERE btrim(b.txid) = $1
      AND NOT EXISTS (
        SELECT 1 FROM "Payouts" p
        WHERE btrim(p.txid) = btrim(b.txid) AND TRIM(p."ToAddr") = TRIM(b.address)
      )
    `,
    [TXID],
  );

  console.log("orphan payouts:", orphanP);
  console.log("orphan blockchain:", orphanB);

  if (orphanP.length !== 1 || orphanB.length !== 1) {
    console.log("Expected 1 orphan on each side; abort.");
    await AppDataSource.destroy();
    process.exit(1);
  }

  const p = orphanP[0];
  const b = orphanB[0];
  console.log(`Fix: payout ${p.addr} (${p.amt}) -> blockchain ${b.addr} (${b.amt})`);

  if (!execute) {
    console.log("DRY RUN — pass --execute");
    await AppDataSource.destroy();
    return;
  }

  const acNo = b.acno ? padAcNo(b.acno) : padAcNo(p.acno);
  const contract = b.contract ? padContract(b.contract) : null;
  const affected = new Set<string>([String(p.acno).trim(), b.acno?.trim()].filter(Boolean));

  await AppDataSource.transaction(async (manager) => {
    if (contract) {
      await manager.query(
        `UPDATE "Payouts"
         SET "ToAddr" = $1, "Amount" = $2, "AcNo" = $3, "mipContractNo" = $4, "txidFee" = $5
         WHERE "Id" = $6`,
        [b.addr, Number(b.amt), acNo, contract, Number(b.fee), p.Id],
      );
      await manager.query(
        `UPDATE "WalletTxn"
         SET "Amount" = $1, "Destination" = $2, "AcNo" = $3, "Reference" = $4
         WHERE "SourceType" = 'PAYOUT' AND "SourceId" = $5`,
        [Number(b.amt), b.addr, acNo, contract, p.Id],
      );
    } else {
      await manager.query(
        `UPDATE "Payouts" SET "ToAddr" = $1, "Amount" = $2, "txidFee" = $3 WHERE "Id" = $4`,
        [b.addr, Number(b.amt), Number(b.fee), p.Id],
      );
      await manager.query(
        `UPDATE "WalletTxn" SET "Amount" = $1, "Destination" = $2 WHERE "SourceType" = 'PAYOUT' AND "SourceId" = $3`,
        [Number(b.amt), b.addr, p.Id],
      );
    }
  });

  for (const ac of affected) {
    await recalcRunningBalances(ac);
    await reconcileBalance(ac);
  }

  const sums = await AppDataSource.query(
    `SELECT SUM(p."Amount")::numeric(24,8) pg, SUM(b.amount)::numeric(24,8) bg
     FROM "Payouts" p FULL OUTER JOIN blockchain_payout b
       ON btrim(p.txid)=btrim(b.txid) AND TRIM(p."ToAddr")=TRIM(b.address)
     WHERE btrim(COALESCE(p.txid,b.txid))=$1`,
    [TXID],
  );
  console.log("After gross:", sums[0]);
  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
