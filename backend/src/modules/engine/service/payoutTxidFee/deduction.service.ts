/**
 * PAYOUT TXID FEE — STEP 2: DEDUCT FROM AMOUNT
 * --------------------------------------------
 * After txidFee is imported (Step 1), subtract it from each payout Amount:
 *
 *   perRow (default):  newAmount = Amount − txidFee
 *   splitAcrossTxid:   newAmount = Amount − (txidFee ÷ rowCount for that txid)
 *
 * Example (perRow):
 *   Amount = 0.00063432, txidFee = 0.0000057  →  newAmount = 0.00062862
 *
 * Safety:
 *   - Only rows with txidFee > 0 and txidFeeDeducted = false
 *   - Marks txidFeeDeducted = true after apply (prevents double deduction)
 *   - dryRun: preview only, no DB writes
 */

import { AppDataSource } from "@common";
import { Payout } from "@common";
import { In, IsNull, Not } from "typeorm";
import { roundBtcAmount } from "./shared";

export type TxidFeeDeductionMode = "perRow" | "splitAcrossTxid";

export type TxidFeeDeductionOptions = {
  txids?: string[];
  dryRun?: boolean;
  mode?: TxidFeeDeductionMode;
};

export type TxidFeeDeductionLine = {
  payoutId: number;
  txid: string;
  grossAmount: number;
  feeApplied: number;
  netAmount: number;
};

export type TxidFeeDeductionResult = {
  dryRun: boolean;
  mode: TxidFeeDeductionMode;
  updatedRows: number;
  skippedRows: number;
  lines: TxidFeeDeductionLine[];
  errors: Array<{ payoutId: number; error: string }>;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function computeFeePerRow(
  payout: Payout,
  groupSize: number,
  mode: TxidFeeDeductionMode,
): number {
  const storedFee = toNumber(payout.txidFee);
  if (storedFee <= 0) return 0;
  if (mode === "splitAcrossTxid" && groupSize > 1) {
    return roundBtcAmount(storedFee / groupSize);
  }
  return roundBtcAmount(storedFee);
}

function buildDeductionPlan(
  payouts: Payout[],
  mode: TxidFeeDeductionMode,
): { lines: TxidFeeDeductionLine[]; skippedRows: number } {
  const eligible = payouts.filter((p) => toNumber(p.txidFee) > 0 && p.txid);
  const groupSizes = new Map<string, number>();

  for (const payout of eligible) {
    const txid = payout.txid!;
    groupSizes.set(txid, (groupSizes.get(txid) ?? 0) + 1);
  }

  const lines: TxidFeeDeductionLine[] = [];
  let skippedRows = 0;

  for (const payout of eligible) {
    const grossAmount = roundBtcAmount(toNumber(payout.Amount));
    const feeApplied = computeFeePerRow(payout, groupSizes.get(payout.txid!) ?? 1, mode);
    const netAmount = roundBtcAmount(grossAmount - feeApplied);

    if (feeApplied <= 0 || netAmount === grossAmount) {
      skippedRows += 1;
      continue;
    }

    lines.push({
      payoutId: payout.Id,
      txid: payout.txid!,
      grossAmount,
      feeApplied,
      netAmount,
    });
  }

  return { lines, skippedRows };
}

export async function applyPayoutTxidFeeDeduction(
  options: TxidFeeDeductionOptions = {},
): Promise<TxidFeeDeductionResult> {
  const mode: TxidFeeDeductionMode = options.mode ?? "perRow";
  const dryRun = Boolean(options.dryRun);
  const payoutRepo = AppDataSource.getRepository(Payout);

  const where: Record<string, unknown> = {
    txidFee: Not(IsNull()),
    txidFeeDeducted: false,
  };
  if (options.txids?.length) {
    where.txid = In(options.txids);
  }

  const payouts = await payoutRepo.find({ where: where as any });
  const { lines, skippedRows } = buildDeductionPlan(payouts, mode);

  if (dryRun) {
    return {
      dryRun: true,
      mode,
      updatedRows: 0,
      skippedRows,
      lines,
      errors: [],
    };
  }

  const errors: TxidFeeDeductionResult["errors"] = [];
  let updatedRows = 0;

  await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Payout);
    for (const line of lines) {
      try {
        const result = await repo.update(
          { Id: line.payoutId, txidFeeDeducted: false },
          { Amount: line.netAmount, txidFeeDeducted: true },
        );
        if ((result.affected ?? 0) > 0) {
          updatedRows += 1;
        }
      } catch (err: any) {
        errors.push({ payoutId: line.payoutId, error: err?.message ?? "Update failed" });
      }
    }
  });

  return {
    dryRun: false,
    mode,
    updatedRows,
    skippedRows,
    lines,
    errors,
  };
}
