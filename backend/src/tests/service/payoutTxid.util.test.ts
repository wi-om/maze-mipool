import {
  PAYOUT_TXID_LENGTH,
  normalizePayoutTxid,
  validatePayoutTxid,
} from "../../modules/engine/service/payoutTxid.util";

export const VALID_PAYOUT_TXID =
  "14cbac9bc43408e43979b8bfb318e0a2fd472ecee6b15415e975471c93b03bf4";

describe("payoutTxid.util", () => {
  it("accepts valid 64-char alphanumeric txid", () => {
    const result = validatePayoutTxid(VALID_PAYOUT_TXID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(VALID_PAYOUT_TXID);
      expect(result.value).toHaveLength(PAYOUT_TXID_LENGTH);
    }
  });

  it("accepts letters beyond a-f when length is 64", () => {
    const mixed = "Z".repeat(32) + "9".repeat(32);
    const result = validatePayoutTxid(mixed);
    expect(result.ok).toBe(true);
  });

  it("normalizes trim only", () => {
    expect(normalizePayoutTxid(`  ${VALID_PAYOUT_TXID}  `)).toBe(VALID_PAYOUT_TXID);
    expect(normalizePayoutTxid("AbC")).toBe("AbC");
  });

  it("rejects empty txid", () => {
    const result = validatePayoutTxid("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("txid is required");
  });

  it("rejects wrong length", () => {
    const result = validatePayoutTxid("abc123");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("64");
  });

  it("rejects non-alphanumeric characters", () => {
    const bad = `${"a".repeat(63)}-`;
    const result = validatePayoutTxid(bad);
    expect(result.ok).toBe(false);
  });
});
