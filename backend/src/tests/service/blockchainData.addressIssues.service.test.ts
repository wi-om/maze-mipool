import { classifyAddressIssue } from "../../blockchainData/addressIssues";

describe("classifyAddressIssue", () => {
  it("flags comma-separated dual txid", () => {
    const r = classifyAddressIssue({
      txid: "abc,def",
      payoutAddr: "bc1qaaa",
      walletAddr: "bc1qaaa",
      onChainAddr: null,
      hasBlockchainRows: true,
    });
    expect(r.kind).toBe("dual_txid");
  });

  it("flags paid to different output when wallet matches payout", () => {
    const r = classifyAddressIssue({
      txid: "abc123",
      payoutAddr: "bc1qwallet",
      walletAddr: "bc1qwallet",
      onChainAddr: "bc1qother",
      hasBlockchainRows: true,
    });
    expect(r.kind).toBe("paid_different_output");
  });

  it("flags wallet not on chain when no matching output", () => {
    const r = classifyAddressIssue({
      txid: "abc123",
      payoutAddr: "bc1qwallet",
      walletAddr: "bc1qwallet",
      onChainAddr: null,
      hasBlockchainRows: true,
    });
    expect(r.kind).toBe("wallet_not_on_chain");
  });

  it("flags missing blockchain import", () => {
    const r = classifyAddressIssue({
      txid: "abc123",
      payoutAddr: "bc1qwallet",
      walletAddr: "bc1qwallet",
      onChainAddr: null,
      hasBlockchainRows: false,
    });
    expect(r.kind).toBe("no_blockchain_import");
  });
});
