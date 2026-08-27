import { buildWhere, searchPattern, MAPPED_ACNO_CLAUSE, buildMappedWhere } from "../../blockchainData/list";

describe("blockchainData.list", () => {
  it("searchPattern escapes wildcards", () => {
    expect(searchPattern("abc")).toBe("%abc%");
    expect(searchPattern("50%")).toBe("%50\\%%");
    expect(searchPattern("")).toBeNull();
    expect(searchPattern("  ")).toBeNull();
  });

  it("buildWhere adds date and search clauses", () => {
    const { clause, params } = buildWhere({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      search: "abc123",
    });
    expect(clause).toContain("txn_date");
    expect(clause).toContain("ILIKE");
    expect(params).toEqual(["2026-01-01", "2026-01-31", "%abc123%"]);
  });

  it("buildWhere with no filters", () => {
    const { clause, params } = buildWhere({});
    expect(params).toEqual([]);
    expect(clause).toContain("b.txid IS NOT NULL");
  });

  it("buildMappedWhere adds ac_no filter", () => {
    const { clause } = buildMappedWhere({});
    expect(clause).toContain(MAPPED_ACNO_CLAUSE);
  });
});
