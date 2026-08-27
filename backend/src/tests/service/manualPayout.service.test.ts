describe("services manualPayout.service", () => {
  const VALID_TXID = "14cbac9bc43408e43979b8bfb318e0a2fd472ecee6b15415e975471c93b03bf4";

  const load = async () => {
    jest.resetModules();

    const accountRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const contractRepo = { count: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const rewardRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
    const payoutQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const payoutRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => {
        if (Array.isArray(x)) {
          return x.map((row, i) => ({ ...row, Id: 100 + i }));
        }
        return { ...x, Id: 99 };
      }),
      createQueryBuilder: jest.fn(() => payoutQb),
    };
    const walletRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    const transaction = jest.fn(async (fn: (mgr: any) => Promise<void>) => {
      const mgr = {
        getRepository: jest.fn((entity: any) => {
          if (entity && entity.__type === "Account") return accountRepo;
          if (entity && entity.__type === "Payout") return payoutRepo;
          if (entity && entity.__type === "Wallet") return walletRepo;
          if (entity && entity.__type === "Contract") return contractRepo;
          return payoutRepo;
        }),
      };
      return fn(mgr);
    });

    jest.doMock("@common", () => ({
      AppDataSource: {
        getRepository: jest.fn((entity: any) => {
          if (entity && entity.__type === "Account") return accountRepo;
          if (entity && entity.__type === "Contract") return contractRepo;
          if (entity && entity.__type === "Reward") return rewardRepo;
          if (entity && entity.__type === "Payout") return payoutRepo;
          if (entity && entity.__type === "Wallet") return walletRepo;
          return payoutRepo;
        }),
        transaction,
      },
      Account: { __type: "Account" },
      Contract: { __type: "Contract" },
      Reward: { __type: "Reward" },
      Payout: { __type: "Payout" },
    }));

    jest.doMock("@common/entities/Wallet", () => ({
      Wallet: { __type: "Wallet" },
    }));

    const debitWalletBalanceInTransaction = jest.fn().mockResolvedValue(undefined);
    jest.doMock("../../modules/crm/services/wallet/walletBalance.service", () => ({
      debitWalletBalanceInTransaction,
    }));

    const insertDebitFromPayout = jest.fn().mockResolvedValue(null);
    jest.doMock("../../modules/crm/services/wallet/walletTxn.service", () => ({
      insertDebitFromPayout,
    }));

    const rewardCreatedOn = new Date("2025-06-15T00:00:00.000Z");
    const mod = await import("../../modules/engine/service/manualPayout.service.js");

    return {
      mod,
      accountRepo,
      contractRepo,
      rewardRepo,
      payoutRepo,
      payoutQb,
      walletRepo,
      debitWalletBalanceInTransaction,
      insertDebitFromPayout,
      rewardCreatedOn,
    };
  };

  it("previewManualPayout includes all contracts with pending rewards", async () => {
    const { mod, accountRepo, walletRepo, rewardRepo, payoutRepo, rewardCreatedOn } = await load();
    accountRepo.find.mockResolvedValue([{ AcNo: "AC1", Parent: "client-1", Type: "EU" }]);
    walletRepo.find.mockResolvedValue([{ AcNo: "AC1", Addr: "bc1qtest", IsActive: true }]);
    payoutRepo.find.mockResolvedValue([]);
    rewardRepo.find.mockResolvedValue([
      { AcNo: "AC1", mipContractNo: "C1", Amount: 0.005, CreatedOn: rewardCreatedOn },
      { AcNo: "AC1", mipContractNo: "C2", Amount: 0.02, CreatedOn: rewardCreatedOn },
    ]);

    const rows = await mod.previewManualPayout(["AC1"], "2025-06-15");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.mipContractNo === "C1")?.amount).toBeCloseTo(0.005);
    expect(rows.find((r) => r.mipContractNo === "C2")?.amount).toBeCloseTo(0.02);
  });

  it("commitManualPayout rejects missing txid", async () => {
    const { mod } = await load();
    await expect(mod.commitManualPayout({ acNos: ["AC1"], txid: "" })).rejects.toMatchObject({
      message: "txid is required",
      status: 400,
    });
  });

  it("commitManualPayout rejects invalid txid format", async () => {
    const { mod } = await load();
    await expect(mod.commitManualPayout({ acNos: ["AC1"], txid: "abc123" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("commitManualPayout creates Complete payouts and debits wallet", async () => {
    const {
      mod,
      accountRepo,
      walletRepo,
      payoutRepo,
      rewardRepo,
      debitWalletBalanceInTransaction,
      insertDebitFromPayout,
      rewardCreatedOn,
    } = await load();

    accountRepo.find.mockResolvedValue([{ AcNo: "AC1", Type: "EU" }]);
    walletRepo.find.mockResolvedValue([{ AcNo: "AC1", Addr: "bc1qvalid", IsActive: true, ID: 1 }]);
    payoutRepo.find.mockResolvedValue([]);
    rewardRepo.find.mockResolvedValue([
      { AcNo: "AC1", mipContractNo: "C1", Amount: 0.002, CreatedOn: rewardCreatedOn },
    ]);

    const result = await mod.commitManualPayout({
      acNos: ["AC1"],
      txid: VALID_TXID,
      paidThroughDate: "2025-06-15",
    });
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toEqual(expect.objectContaining({ Status: "Complete", txid: VALID_TXID }));
    expect(payoutRepo.save).toHaveBeenCalled();
    expect(insertDebitFromPayout).toHaveBeenCalled();
    expect(debitWalletBalanceInTransaction).toHaveBeenCalledWith(walletRepo, "AC1", 0.002);
  });

  it("commitManualPayout errors when no active wallet", async () => {
    const { mod, accountRepo, walletRepo, payoutRepo, rewardRepo, rewardCreatedOn } = await load();
    accountRepo.find.mockResolvedValue([{ AcNo: "AC1", Type: "EU" }]);
    walletRepo.find.mockResolvedValue([]);
    payoutRepo.find.mockResolvedValue([]);
    rewardRepo.find.mockResolvedValue([
      { AcNo: "AC1", mipContractNo: "C1", Amount: 0.002, CreatedOn: rewardCreatedOn },
    ]);

    const result = await mod.commitManualPayout({ acNos: ["AC1"], txid: VALID_TXID });
    expect(result.errors).toEqual([
      expect.objectContaining({ acNo: "AC1", error: "No active wallet with valid BTC address" }),
    ]);
  });
});
