import { mapDailyCompareRowForTest } from "@blockchainData/dailyCompare";

describe("blockchainData.dailyCompare", () => {
  it("computes difference as payout − blockchain", () => {
    const row = mapDailyCompareRowForTest({
      d: "2025-12-16",
      rewards: "0.00303597",
      payouts: "0.00303597",
      blockchain: "0.00303601",
      reward_rows: 22,
      payout_rows: 22,
      blockchain_rows: 21,
    });

    expect(row.rewardsAmount).toBe(0.00303597);
    expect(row.difference).toBe(-0.00000004);
    expect(row.status).toBe("mismatch");
  });

  it("shows zero rewards when payout is zero", () => {
    const row = mapDailyCompareRowForTest({
      d: "2025-12-22",
      rewards: "0.00397518",
      payouts: "0",
      blockchain: "0.00605956",
      reward_rows: 24,
      payout_rows: 0,
      blockchain_rows: 21,
    });

    expect(row.rewardsAmount).toBe(0);
    expect(row.payoutAmount).toBe(0);
    expect(row.difference).toBe(-0.00605956);
    expect(row.status).toBe("mismatch");
  });

  it("marks match when payout and blockchain align", () => {
    const row = mapDailyCompareRowForTest({
      d: "2025-12-05",
      rewards: "0.00303166",
      payouts: "0.00303166",
      blockchain: "0.00303166",
      reward_rows: 21,
      payout_rows: 21,
      blockchain_rows: 21,
    });
    expect(row.status).toBe("match");
    expect(row.difference).toBe(0);
  });
});
