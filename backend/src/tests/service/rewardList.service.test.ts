import {
  MAX_LEGACY_REWARDS_FETCH,
  resolveLegacyRowLimit,
} from "../../modules/engine/service/rewardList.service";

describe("rewardList.service legacy row limits", () => {
  it("returns zero when there are no records", () => {
    expect(resolveLegacyRowLimit(0)).toBe(0);
    expect(resolveLegacyRowLimit(-5)).toBe(0);
  });

  it("returns full count when under the legacy cap", () => {
    expect(resolveLegacyRowLimit(4992)).toBe(4992);
    expect(resolveLegacyRowLimit(MAX_LEGACY_REWARDS_FETCH)).toBe(MAX_LEGACY_REWARDS_FETCH);
  });

  it("caps at MAX_LEGACY_REWARDS_FETCH for very large datasets", () => {
    expect(resolveLegacyRowLimit(MAX_LEGACY_REWARDS_FETCH + 1)).toBe(MAX_LEGACY_REWARDS_FETCH);
  });
});
