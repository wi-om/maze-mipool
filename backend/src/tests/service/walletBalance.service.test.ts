describe("services walletBalance.service", () => {
  const load = async () => {
    jest.resetModules();

    const walletRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const rewardRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const payoutRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const transaction = jest.fn(async (fn: (mgr: any) => Promise<void>) => {
      const mgr = {
        getRepository: jest.fn(() => walletRepo),
      };
      return fn(mgr);
    });

    jest.doMock("@common", () => ({
      AppDataSource: {
        getRepository: jest.fn((entity: any) => {
          if (entity && entity.__type === "Reward") return rewardRepo;
          if (entity && entity.__type === "Payout") return payoutRepo;
          return walletRepo;
        }),
        transaction,
      },
      Reward: { __type: "Reward" },
      Payout: { __type: "Payout" },
    }));

    jest.doMock("@common/entities/Wallet", () => ({
      Wallet: { __type: "Wallet" },
    }));

    const mod = await import("../../modules/crm/services/wallet/walletBalance.service.js");
    return { mod, walletRepo, rewardRepo, payoutRepo, transaction };
  };

  it("creditWalletBalance increases active wallet balance", async () => {
    const { mod, walletRepo } = await load();
    walletRepo.findOne.mockResolvedValueOnce({ ID: 1, AcNo: "AC1", Balance: 0.001 });
    walletRepo.update.mockResolvedValueOnce(undefined);

    await mod.creditWalletBalance("AC1", 0.002);

    expect(walletRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ Balance: 0.003 }));
  });

  it("debitWalletBalance reduces balance with floor at zero", async () => {
    const { mod, walletRepo } = await load();
    walletRepo.findOne.mockResolvedValueOnce({ ID: 2, AcNo: "AC2", Balance: 0.005 });
    walletRepo.update.mockResolvedValueOnce(undefined);

    await mod.debitWalletBalance("AC2", 0.01);

    expect(walletRepo.update).toHaveBeenCalledWith(2, expect.objectContaining({ Balance: 0 }));
  });

  it("getExpectedWalletBalance sums all rewards minus complete payouts", async () => {
    const { mod, payoutRepo, rewardRepo } = await load();
    payoutRepo.find.mockResolvedValueOnce([]);
    rewardRepo.find.mockResolvedValueOnce([
      { Amount: 0.001 },
      { Amount: 0.002 },
    ]);

    const total = await mod.getExpectedWalletBalance("AC1");
    expect(total).toBeCloseTo(0.003);
  });

  it("reconcileBalance fixes drift when balance differs from expected rewards", async () => {
    const { mod, walletRepo, payoutRepo, rewardRepo } = await load();
    payoutRepo.find.mockResolvedValueOnce([]);
    rewardRepo.find.mockResolvedValueOnce([{ Amount: 0.01 }]);
    walletRepo.findOne.mockResolvedValue({ ID: 3, AcNo: "AC3", Balance: 0.005 });
    walletRepo.update.mockResolvedValue(undefined);

    const result = await mod.reconcileBalance("AC3");
    expect(result.fixed).toBe(true);
    expect(result.expectedBalance).toBeCloseTo(0.01);
    expect(walletRepo.update).toHaveBeenCalledWith(3, expect.objectContaining({ Balance: 0.01 }));
  });
});
