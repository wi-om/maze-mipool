/** On-chain txid: exactly 64 alphanumeric characters. */
export const PAYOUT_TXID_LENGTH = 64;

export const PAYOUT_TXID_REGEX = /^[a-zA-Z0-9]{64}$/;

export function normalizePayoutTxid(txid: string): string {
  return txid.trim();
}

export function validatePayoutTxid(txid: string): { ok: true; value: string } | { ok: false; error: string } {
  const normalized = normalizePayoutTxid(txid);
  if (!normalized) {
    return { ok: false, error: "txid is required" };
  }
  if (normalized.length !== PAYOUT_TXID_LENGTH || !PAYOUT_TXID_REGEX.test(normalized)) {
    return {
      ok: false,
      error: `txid must be exactly ${PAYOUT_TXID_LENGTH} letters and numbers (A-Z, a-z, 0-9)`,
    };
  }
  return { ok: true, value: normalized };
}
