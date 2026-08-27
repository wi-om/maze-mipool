describe("walletLedger.service", () => {
  const mockTxns = [
    {
      Id: 1,
      AcNo: "MI93691918",
      WalletId: 8,
      TxnType: "CREDIT",
      Amount: "0.00074438",
      RunningBalance: "0.00074438",
      txid: null,
      Source: "MIPS_REWARD",
      Destination: "8",
      AssetName: "Bitcoin",
      AssetCode: "BTC",
      Remark: "Auto reward",
      Reference: "C001",
      SourceType: "REWARD",
      SourceId: 1,
      WorkDate: "2026-06-10",
      CreatedOn: new Date("2026-06-10T00:00:00.000Z"),
    },
    {
      Id: 2,
      AcNo: "MI93691918",
      WalletId: 8,
      TxnType: "DEBIT",
      Amount: "0.00074438",
      RunningBalance: "0",
      txid: "abc123",
      Source: "8",
      Destination: "bc1qclient",
      AssetName: "Bitcoin",
      AssetCode: "BTC",
      Remark: "Auto Payout",
      Reference: "C001",
      SourceType: "PAYOUT",
      SourceId: 10,
      WorkDate: null,
      CreatedOn: new Date("2026-06-11T00:00:00.000Z"),
    },
  ];

  const load = async () => {
    jest.resetModules();

    const accountRepo = { findOneBy: jest.fn() };
    const walletRepo = { findOne: jest.fn() };

    jest.doMock("@common", () => ({
      AppDataSource: {
        getRepository: jest.fn((entity: any) => {
          if (entity?.__type === "Account") return accountRepo;
          return walletRepo;
        }),
      },
      Account: { __type: "Account" },
    }));

    jest.doMock("@common/entities/Wallet", () => ({
      Wallet: { __type: "Wallet" },
    }));

    jest.doMock("../../modules/crm/services/wallet/walletBalance.service", () => ({
      getExpectedWalletBalance: jest.fn().mockResolvedValue(0),
    }));

    jest.doMock("../../modules/crm/services/wallet/walletTxn.service", () => ({
      fetchAllWalletTxnsForAcNo: jest.fn().mockResolvedValue(mockTxns),
    }));

    const mod = await import("../../modules/crm/services/wallet/walletLedger.service.js");
    return { mod, accountRepo, walletRepo };
  };

  it("returns WalletTxn credits and debits with running balance", async () => {
    const { mod, accountRepo, walletRepo } = await load();
    accountRepo.findOneBy.mockResolvedValue({ AcNo: "MI93691918", Parent: "cmc56aca9b" });
    walletRepo.findOne.mockResolvedValue({ Balance: "0", IsActive: true });

    const result = await mod.getWalletLedgerByClientid("cmc56aca9b");

    expect(result.acNo).toBe("MI93691918");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].type).toBe("payout");
    expect(result.entries[0].source).toBe("8");
    expect(result.entries[0].destination).toBe("bc1qclient");
    expect(result.entries[1].type).toBe("reward");
    expect(result.entries[1].source).toBe("MIPS_REWARD");
    expect(result.entries[1].destination).toBe("8");
  });

  it("throws 404 when account missing", async () => {
    const { mod, accountRepo } = await load();
    accountRepo.findOneBy.mockResolvedValueOnce(null);
    await expect(mod.getWalletLedgerByClientid("missing")).rejects.toMatchObject({ status: 404 });
  });
});
