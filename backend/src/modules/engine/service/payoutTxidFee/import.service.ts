/**
 * PAYOUT TXID FEE — IMPORT (+ per-row Amount deduction)
 * ---------------------------------------------------
 * CSV: txid,txidFee → sets txidFee on all matching rows, then:
 *   newAmount = Amount − txidFee  (per row)
 */

import { AppDataSource } from "@common";
import { Payout } from "@common";
import type { InvalidCsvRow, TxidFeeUpdate } from "./shared";
import { applyPayoutTxidFeeDeduction, type TxidFeeDeductionResult } from "./deduction.service";

export type BulkTxidFeeImportResult = {
  updatedRows: number;
  updatedTxids: string[];
  notFoundTxids: string[];
  invalidRows: InvalidCsvRow[];
};

export type ImportAndDeductTxidFeeResult = BulkTxidFeeImportResult & {
  deductedRows: number;
  deduction: TxidFeeDeductionResult | null;
};

export async function bulkUpdatePayoutTxidFees(updates: TxidFeeUpdate[]): Promise<BulkTxidFeeImportResult> {
  const payoutRepo = AppDataSource.getRepository(Payout);
  const updatedTxids: string[] = [];
  const notFoundTxids: string[] = [];
  let updatedRows = 0;

  for (const { txid, txidFee } of updates) {
    const result = await payoutRepo.update({ txid }, { txidFee, txidFeeDeducted: false });
    const affected = result.affected ?? 0;
    if (affected > 0) {
      updatedRows += affected;
      updatedTxids.push(txid);
    } else {
      notFoundTxids.push(txid);
    }
  }

  return {
    updatedRows,
    updatedTxids,
    notFoundTxids,
    invalidRows: [],
  };
}

/** Import txidFee from CSV rows, then deduct per row: Amount = Amount − txidFee. */
export async function importAndDeductPayoutTxidFees(
  updates: TxidFeeUpdate[],
): Promise<ImportAndDeductTxidFeeResult> {
  const importResult = await bulkUpdatePayoutTxidFees(updates);

  if (!importResult.updatedTxids.length) {
    return { ...importResult, deductedRows: 0, deduction: null };
  }

  const deduction = await applyPayoutTxidFeeDeduction({
    mode: "perRow",
    txids: importResult.updatedTxids,
    dryRun: false,
  });

  return {
    ...importResult,
    deductedRows: deduction.updatedRows,
    deduction,
  };
}
