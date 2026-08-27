/**
 * CLI: fetch blockchain.info rawtx and dump into blockchain_payout.
 *
 * Usage:
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/fetch-blockchain-payout.ts --txid <64-char-txid>
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/fetch-blockchain-payout.ts --txid <txid> --preview
 */
import "reflect-metadata";
import { AppDataSource } from "../src/common";
import {
  importBlockchainTxToDb,
  previewBlockchainTx,
} from "@blockchainData";
import { validatePayoutTxid } from "../src/modules/engine/service/payoutTxid.util";

async function main() {
  const preview = process.argv.includes("--preview");
  const txidIdx = process.argv.indexOf("--txid");
  const txidArg = txidIdx >= 0 ? process.argv[txidIdx + 1] : undefined;
  if (!txidArg) {
    console.error("Usage: --txid <64-char-txid> [--preview]");
    process.exit(1);
  }

  const v = validatePayoutTxid(txidArg);
  if (!v.ok) {
    console.error(v.error);
    process.exit(1);
  }

  await AppDataSource.initialize();
  console.log("DB_NAME:", process.env.DB_NAME);

  if (preview) {
    const data = await previewBlockchainTx(v.value);
    console.log(JSON.stringify(data, null, 2));
  } else {
    const result = await importBlockchainTxToDb(v.value);
    console.log("Imported:", result);
  }

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
