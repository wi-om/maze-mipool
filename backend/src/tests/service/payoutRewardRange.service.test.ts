import { rollupRewardsForAcNo } from "../../modules/crm/services/wallet/payoutRewardRange.service";

describe("payoutRewardRange rollupRewardsForAcNo", () => {
  const createdOn = new Date("2025-06-15T12:00:00.000Z");

  it("sums payable rewards in range only", () => {
    const rewards = [
      { AcNo: "AC1", mipContractNo: "C1", Amount: 0.001, CreatedOn: createdOn },
      { AcNo: "AC1", mipContractNo: "C1", Amount: 0.002, CreatedOn: createdOn },
    ];
    const rollup = rollupRewardsForAcNo(rewards as any, "2025-06-14", "2025-06-15", 0);
    expect(rollup.payableBalance).toBeCloseTo(0.003);
    expect(rollup.pendingByContract.get("C1")).toBeCloseTo(0.003);
    expect(rollup.daysPending).toBe(1);
  });

  it("excludes rewards already paid through and after pay-through date", () => {
    const rewards = [
      { AcNo: "AC1", mipContractNo: "C1", Amount: 0.001, CreatedOn: new Date("2025-06-14T12:00:00.000Z") },
      { AcNo: "AC1", mipContractNo: "C1", Amount: 0.002, CreatedOn: createdOn },
      { AcNo: "AC1", mipContractNo: "C1", Amount: 0.004, CreatedOn: new Date("2025-06-16T12:00:00.000Z") },
    ];
    const rollup = rollupRewardsForAcNo(rewards as any, "2025-06-14", "2025-06-15", 0);
    expect(rollup.payableBalance).toBeCloseTo(0.002);
    expect(rollup.accruedBalance).toBeCloseTo(0.004);
  });
});
