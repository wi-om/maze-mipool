import { DateTime } from "luxon";
import {
  findMipsRecordForWorkDate,
  getEligibleEndDate,
} from "../../modules/engine/service/backgroundRewardsCatchUp";

describe("backgroundRewardsCatchUp helpers", () => {
  beforeEach(() => {
    process.env.TIMEZONE = "Asia/Dubai";
  });

  it("getEligibleEndDate is Dubai yesterday start of day", () => {
    const end = getEligibleEndDate();
    const today = DateTime.now().setZone("Asia/Dubai").startOf("day");
    const expected = today.minus({ days: 1 });
    expect(end.toISODate()).toBe(expected.toISODate());
  });

  it("findMipsRecordForWorkDate matches mips date work+1", () => {
    const work = DateTime.fromISO("2026-06-01", { zone: "Asia/Dubai" });
    // timestamp + 4h offset must resolve to mips date 2026-06-02
    const ts = Math.floor(Date.UTC(2026, 5, 1, 20, 0, 0) / 1000);
    const data = { income: [{ timestamp: ts, income: 1, total_hashrate_str: "1e12" }] };
    expect(findMipsRecordForWorkDate(data, work)).toBeTruthy();
  });

  it("findMipsRecordForWorkDate returns null when missing", () => {
    const work = DateTime.fromISO("2026-06-01", { zone: "Asia/Dubai" });
    expect(findMipsRecordForWorkDate({ income: [] }, work)).toBeNull();
  });
});
