import {
  parseHashrate,
  detectNumericHashrateUnit,
  toHps,
  convertHashrate,
} from "../../modules/engine/service/hashrate.util";

describe("services hashrate.util", () => {
  describe("parseHashrate", () => {
    it("returns null for null/undefined/empty", () => {
      expect(parseHashrate(null)).toBeNull();
      expect(parseHashrate(undefined)).toBeNull();
      expect(parseHashrate("   ")).toBeNull();
    });

    it("parses numbers with default unit", () => {
      expect(parseHashrate(10, "TH")).toEqual({ value: 10, unit: "TH" });
    });

    it("returns null for non-finite numbers", () => {
      expect(parseHashrate(Number.NaN)).toBeNull();
      expect(parseHashrate(Number.POSITIVE_INFINITY)).toBeNull();
    });

    it("parses strings with units and optional /s", () => {
      expect(parseHashrate("250 TH/s")).toEqual({ value: 250, unit: "TH" });
      expect(parseHashrate("0.12 PH")).toEqual({ value: 0.12, unit: "PH" });
      expect(parseHashrate("5ths")).toEqual({ value: 5, unit: "TH" });
      expect(parseHashrate("5 THS")).toEqual({ value: 5, unit: "TH" });
    });

    it("falls back to default unit when unit missing or unknown", () => {
      expect(parseHashrate("10", "GH")).toEqual({ value: 10, unit: "GH" });
      expect(parseHashrate("10 XYZ", "MH")).toEqual({ value: 10, unit: "MH" });
    });

    it("returns null for malformed strings", () => {
      expect(parseHashrate("abc")).toBeNull();
      expect(parseHashrate("10 20 TH")).toBeNull();
    });
  });

  describe("detectNumericHashrateUnit", () => {
    it("treats huge values as H/s", () => {
      expect(detectNumericHashrateUnit(1e12)).toBe("H");
      expect(detectNumericHashrateUnit(9e15)).toBe("H");
    });

    it("treats mid values as TH", () => {
      expect(detectNumericHashrateUnit(1000)).toBe("TH");
      expect(detectNumericHashrateUnit(999999)).toBe("TH");
    });

    it("defaults to H for small or non-finite", () => {
      expect(detectNumericHashrateUnit(10)).toBe("H");
      expect(detectNumericHashrateUnit(Number.NaN)).toBe("H");
    });
  });

  describe("toHps", () => {
    it("converts numeric inputs using heuristic", () => {
      // 2000 treated as TH -> 2000 * 1e12
      expect(toHps(2000)).toBe(2000 * 1e12);
      // 1e12 treated as H -> 1e12
      expect(toHps(1e12)).toBe(1e12);
    });

    it("converts string inputs using explicit units", () => {
      expect(toHps("1 TH")).toBe(1e12);
      expect(toHps("2 PH")).toBe(2e15);
      expect(toHps("3 GH/s")).toBe(3e9);
    });

    it("returns 0 for invalid inputs", () => {
      expect(toHps("bad")).toBe(0);
      expect(toHps({})).toBe(0);
    });
  });

  describe("convertHashrate", () => {
    it("converts to target units", () => {
      expect(convertHashrate("1 TH", "PH")).toBeCloseTo(0.001);
      expect(convertHashrate("1 PH", "TH")).toBe(1000);
      expect(convertHashrate(1e12, "TH")).toBe(1);
    });
  });
});

