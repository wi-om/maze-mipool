import {
  dubaiYesterdayIso,
  isRewardInPayableRange,
  normalizePaidThroughDate,
  rewardWorkDateFromCreatedOn,
  validatePaidThroughDate,
} from "../../modules/engine/service/payoutWorkDate.util";

describe("payoutWorkDate.util", () => {
  it("rewardWorkDateFromCreatedOn uses Dubai calendar day", () => {
    const utcLate = new Date("2025-06-16T20:00:00.000Z");
    expect(rewardWorkDateFromCreatedOn(utcLate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("validatePaidThroughDate rejects future dates", () => {
    const max = dubaiYesterdayIso();
    const future = new Date(max);
    future.setUTCDate(future.getUTCDate() + 2);
    const futureIso = future.toISOString().slice(0, 10);
    const result = validatePaidThroughDate(futureIso);
    expect(result.ok).toBe(false);
  });

  it("isRewardInPayableRange excludes already-paid and after pay-through", () => {
    expect(isRewardInPayableRange("2025-06-13", "2025-06-12", "2025-06-15")).toBe(true);
    expect(isRewardInPayableRange("2025-06-12", "2025-06-12", "2025-06-15")).toBe(false);
    expect(isRewardInPayableRange("2025-06-16", "2025-06-12", "2025-06-15")).toBe(false);
  });

  it("normalizePaidThroughDate accepts YYYY-MM-DD", () => {
    expect(normalizePaidThroughDate("2025-06-15")).toBe("2025-06-15");
    expect(normalizePaidThroughDate("bad")).toBeNull();
  });
});
