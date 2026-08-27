/**
 * Payout on-chain fee (txidFee) workflow
 * ======================================
 *
 * import.service.ts — CSV import + per-row deduction in one call
 *   POST /api/payouts/txid-fees/import
 *   txid,txidFee → txidFee column, then Amount = Amount − txidFee
 *
 * deduction.service.ts — standalone deduct (optional / legacy API)
 *   POST /api/payouts/txid-fees/deduct
 */

export {
  parseTxidFeeCsv,
  normalizeTxidFeeUpdates,
  parseTxidFeeValue,
  roundBtcAmount,
  type TxidFeeUpdate,
  type InvalidCsvRow,
} from "./shared";

export {
  bulkUpdatePayoutTxidFees,
  importAndDeductPayoutTxidFees,
  type BulkTxidFeeImportResult,
  type ImportAndDeductTxidFeeResult,
} from "./import.service";

export {
  applyPayoutTxidFeeDeduction,
  type TxidFeeDeductionMode,
  type TxidFeeDeductionOptions,
  type TxidFeeDeductionLine,
  type TxidFeeDeductionResult,
} from "./deduction.service";

export {
  syncPayoutFeesFromPeriod,
  type SyncPayoutFeesFromPeriodResult,
} from "./syncFromPeriod.service";
