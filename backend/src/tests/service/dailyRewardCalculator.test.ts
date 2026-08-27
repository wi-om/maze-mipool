const axiosGet = jest.fn();

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: (...args: any[]) => axiosGet(...args) },
}));

const makeDeleteQb = () => ({
  delete: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

const unitRewardRepo = {
  createQueryBuilder: jest.fn(() => makeDeleteQb()),
  create: jest.fn((x: any) => x),
  save: jest.fn().mockResolvedValue(undefined),
};
const systemSettingRepo = {
  findOne: jest.fn(),
};
const rewardRepo = {
  createQueryBuilder: jest.fn(() => makeDeleteQb()),
  insert: jest.fn().mockResolvedValue(undefined),
};
const clRewardRepo = {
  createQueryBuilder: jest.fn(() => makeDeleteQb()),
  create: jest.fn((x: any) => x),
  save: jest.fn().mockResolvedValue(undefined),
};
const cmWalletRepo = {
  createQueryBuilder: jest.fn(() => ({ ...makeDeleteQb(), orderBy: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null), andWhere: jest.fn().mockReturnThis() })),
  create: jest.fn((x: any) => x),
  save: jest.fn().mockResolvedValue(undefined),
};
const contractRepo = {
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  })),
};
const accountRepo = {
  findBy: jest.fn().mockResolvedValue([]),
};
const clContractRepo = {
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  })),
};

jest.mock("@common", () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: any) => {
      if (entity && entity.__type === "UnitReward") return unitRewardRepo;
      if (entity && entity.__type === "SystemSetting") return systemSettingRepo;
      if (entity && entity.__type === "Reward") return rewardRepo;
      if (entity && entity.__type === "CLReward") return clRewardRepo;
      if (entity && entity.__type === "CMWallet") return cmWalletRepo;
      if (entity && entity.__type === "Contract") return contractRepo;
      if (entity && entity.__type === "Account") return accountRepo;
      if (entity && entity.__type === "CLContract") return clContractRepo;
      return {};
    }),
  },
  UnitReward: { __type: "UnitReward" },
  SystemSetting: { __type: "SystemSetting" },
  Reward: { __type: "Reward" },
  CLReward: { __type: "CLReward" },
  CMWallet: { __type: "CMWallet" },
  Contract: { __type: "Contract" },
  Account: { __type: "Account" },
  CLContract: { __type: "CLContract" },
}));

const loadCalculator = async (mipsUrl?: string) => {
  jest.resetModules();
  if (mipsUrl === undefined) {
    delete process.env.MIPS_REWARD_URL;
  } else {
    process.env.MIPS_REWARD_URL = mipsUrl;
  }
  const mod = await import("../../modules/engine/service/dailyRewardCalculator.js");
  const lockMod = await import("../../modules/engine/service/rewardCalculationLock.js");
  lockMod.releaseRewardCalculationLock();
  return mod.executeMasterRewardDistribution as typeof mod.executeMasterRewardDistribution;
};

describe("services dailyRewardCalculator.executeMasterRewardDistribution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // default settings
    systemSettingRepo.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.Key === "sampling_hashrate") return { Value: "250" };
      if (where?.Key === "OC_floor") return { Value: "1" };
      if (where?.Key === "OC_ceiling") return { Value: "1" };
      if (where?.Key === "SLA_floor") return { Value: "0.99" };
      if (where?.Key === "SLA_ceiling") return { Value: "0.9911" };
      return null;
    });
  });

  it("throws when no MIPS URL and no provided/manual data", async () => {
    const exec = await loadCalculator(undefined);
    await expect(exec(undefined, undefined, undefined)).rejects.toThrow(
      "MIPS_REWARD_URL is not set in environment variables!"
    );
  });

  it("uses manualData path and completes minimal run (no contracts)", async () => {
    const exec = await loadCalculator(undefined);

    const res = await exec(
      new Date("2026-01-01T00:00:00Z"),
      undefined,
      { income: 10, hashrate: 1000 }
    );

    expect(unitRewardRepo.save).toHaveBeenCalled();
    expect(rewardRepo.createQueryBuilder).toHaveBeenCalled();
    expect(clRewardRepo.createQueryBuilder).toHaveBeenCalled();
    expect(cmWalletRepo.createQueryBuilder).toHaveBeenCalled();
    expect(res).toEqual(
      expect.objectContaining({
        unitReward: expect.any(Number),
        workDate: expect.any(Date),
        workDateStr: "2026-01-01",
      })
    );
    expect(res.workDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("throws when providedMipsData has no matching record for mipsDateStr", async () => {
    const provided = { income: [{ timestamp: 0, income: 1, total_hashrate: 1e12 }] };
    const exec = await loadCalculator("http://x");
    await expect(exec(new Date("2026-01-01T00:00:00Z"), provided)).rejects.toThrow(
      "No external reward data found"
    );
  });

  it("fetches via axios when no provided data and URL set", async () => {
    const exec = await loadCalculator("http://x?limit=10");
    // Need record for mipsDateStr (workDate+1, with +4h shift)
    // Work date 2026-01-01 => mipsDateStr 2026-01-02. Use timestamp at 2026-01-01T20:00Z so +4h => 2026-01-02.
    const ts = Math.floor(new Date("2026-01-01T20:00:00Z").getTime() / 1000);
    axiosGet.mockResolvedValueOnce({ data: { income: [{ timestamp: ts, income: "1", total_hashrate: String(1e12) }] } });

    await exec(new Date("2026-01-01T00:00:00Z"));
    expect(axiosGet).toHaveBeenCalledWith(expect.stringContaining("limit=3000"));
  });
});

