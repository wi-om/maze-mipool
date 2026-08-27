describe("walletTxn.service", () => {
  const mockWallet = { ID: 8, AcNo: "MI93691918", Addr: "bc1qtest", IsActive: true };

  const load = async () => {
    jest.resetModules();

    const txnRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve({ Id: 100, ...x })),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
    };

    const walletRepo = {
      findOne: jest.fn().mockResolvedValue(mockWallet),
    };

    const qb = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    txnRepo.createQueryBuilder.mockReturnValue(qb);

    jest.doMock("@common", () => ({
      AppDataSource: {
        getRepository: jest.fn((entity: any) => {
          if (entity?.name === "WalletTxn") return txnRepo;
          if (entity?.__type === "Wallet") return walletRepo;
          return txnRepo;
        }),
      },
      WalletTxn: { name: "WalletTxn" },
      Wallet: { __type: "Wallet" },
      Reward: { __type: "Reward" },
      Payout: { __type: "Payout" },
    }));

    jest.doMock("@common/entities/Wallet", () => ({ Wallet: { __type: "Wallet" } }));

    const mod = await import("../../modules/crm/services/wallet/walletTxn.service.js");
    return { mod, txnRepo, walletRepo, qb };
  };

  it("insertCreditFromReward sets MIPS_REWARD source and wallet id destination", async () => {
    const { mod, txnRepo } = await load();
    txnRepo.findOne.mockResolvedValueOnce(null);
    txnRepo.findOne.mockResolvedValueOnce(null);

    const reward = {
      Id: 1,
      AcNo: "MI93691918",
      mipContractNo: "690DA99D087B",
      Amount: "0.0001",
      CreatedOn: new Date("2026-06-28T00:00:00.000Z"),
    };

    await mod.insertCreditFromReward(reward as any, mockWallet as any);

    expect(txnRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        TxnType: "CREDIT",
        Source: "MIPS_REWARD",
        Destination: "8",
        Remark: "Auto reward",
        AssetName: "Bitcoin",
        AssetCode: "BTC",
      }),
    );
  });

  it("insertDebitFromPayout requires txid and sets wallet id source", async () => {
    const { mod, txnRepo } = await load();
    txnRepo.findOne.mockResolvedValueOnce(null);
    txnRepo.findOne.mockResolvedValueOnce(null);

    const payout = {
      Id: 10,
      AcNo: "MI93691918",
      mipContractNo: "690DA99D087B",
      Amount: "0.0002",
      Status: "Complete",
      txid: "abc123hash",
      ToAddr: "bc1qclient",
      CreatedOn: new Date("2026-06-29T00:00:00.000Z"),
    };

    await mod.insertDebitFromPayout(payout as any, mockWallet as any);

    expect(txnRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        TxnType: "DEBIT",
        Source: "8",
        Destination: "bc1qclient",
        txid: "abc123hash",
        Remark: "Auto Payout",
      }),
    );
  });

  it("insertDebitFromPayout throws without txid", async () => {
    const { mod } = await load();
    await expect(
      mod.insertDebitFromPayout(
        { Id: 1, AcNo: "MI93691918", Status: "Complete", Amount: "0.1" } as any,
        mockWallet as any,
      ),
    ).rejects.toThrow(/txid/);
  });

  it("deleteRewardTxnsForWorkDate deletes by work date", async () => {
    const { mod, qb } = await load();
    const n = await mod.deleteRewardTxnsForWorkDate("2026-06-28");
    expect(n).toBe(2);
    expect(qb.andWhere).toHaveBeenCalledWith(`"WorkDate" = :wd`, { wd: "2026-06-28" });
  });
});
