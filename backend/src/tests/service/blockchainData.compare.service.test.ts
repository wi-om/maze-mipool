import { buildCompareResult, detectSameDayTxidConflicts } from "@blockchainData/compare";

describe("blockchainData.compare", () => {
  it("flags same-day txid mismatch when payout and blockchain use different txids", () => {
    const rows = [
      {
        txid: "a".repeat(64),
        date: "2026-06-08T10:00:00.000Z",
        payoutDate: "2026-06-08T10:00:00.000Z",
        blockchainDate: null,
        payoutCount: 24,
        blockchainCount: null,
        payoutGross: 0.01,
        blockchainGross: null,
        payoutFee: 0.00001,
        blockchainFee: null,
        grossDiff: 0.01,
        feeDiff: 0.00001,
        status: "missing_in_blockchain" as const,
        sameDayConflictTxids: [],
      },
      {
        txid: "b".repeat(64),
        date: "2026-06-08T12:00:00.000Z",
        payoutDate: null,
        blockchainDate: "2026-06-08T12:00:00.000Z",
        payoutCount: null,
        blockchainCount: 24,
        payoutGross: null,
        blockchainGross: 0.012,
        payoutFee: null,
        blockchainFee: 0.00002,
        grossDiff: -0.012,
        feeDiff: -0.00002,
        status: "missing_in_payouts" as const,
        sameDayConflictTxids: [],
      },
    ];

    const conflicts = detectSameDayTxidConflicts(rows);
    expect(conflicts.get("a".repeat(64))).toEqual(["b".repeat(64)]);
    expect(conflicts.get("b".repeat(64))).toEqual(["a".repeat(64)]);
  });

  it("builds month groups from compare rows", () => {
    const result = buildCompareResult([
      {
        txid: "c".repeat(64),
        payout_date: "2026-06-08T10:00:00.000Z",
        blockchain_date: "2026-06-08T10:00:00.000Z",
        payout_count: 24,
        blockchain_count: 24,
        payout_gross: "0.01000000",
        blockchain_gross: "0.01000000",
        payout_fee: "0.00001000",
        blockchain_fee: "0.00001000",
      },
    ]);

    expect(result.summary.matched).toBe(1);
    expect(result.months).toHaveLength(1);
    expect(result.months[0].month).toBe("2026-06");
    expect(result.months[0].payoutGross).toBe(0.01);
  });

  it("matches same txid even when payout and blockchain calendar dates differ", () => {
    const txid = "d".repeat(64);
    const result = buildCompareResult([
      {
        txid,
        payout_date: "2025-12-31T11:00:00.000Z",
        blockchain_date: "2025-12-30T20:00:00.000Z",
        payout_count: 24,
        blockchain_count: 24,
        payout_gross: "0.00397241",
        blockchain_gross: "0.00397241",
        payout_fee: "0.00001200",
        blockchain_fee: "0.00001200",
      },
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("match");
    expect(result.summary.matched).toBe(1);
    expect(result.summary.missingInPayouts).toBe(0);
    expect(result.summary.missingInBlockchain).toBe(0);
  });
});
