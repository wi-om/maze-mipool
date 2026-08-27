import { Request, Response } from "express";
import { logger, buildCacheKey, readThroughCache } from "@common";
import { Reward } from "@common";
import { AppDataSource } from "@common";
import { Account } from "@common";
import { UserAppDataSource } from "@common";
import { User } from "@common";
import { In } from "typeorm";
import { triggerBackgroundRewardsCatchUp } from "../../service/backgroundRewardsCatchUp";
import {
  DEFAULT_REWARDS_LIST_LIMIT,
  enrichRewardsForApi,
  fetchEURewards,
  parseEURewardsListParams,
  type RewardListApiRow,
} from "../../service/rewardList.service";

export type { RewardListApiRow } from "../../service/rewardList.service";
export { serializeRewardForApi } from "../../service/rewardList.service";

const YIELDS_CACHE_TTL = 60;

function scheduleRewardsCatchUp(): void {
  void triggerBackgroundRewardsCatchUp().catch((err) =>
    logger.error("Background rewards catch-up error:", err),
  );
}

async function resolveSearchAcNos(search: string): Promise<string[] | undefined> {
  const userRepo = UserAppDataSource.getRepository(User);
  const matchingUsers = await userRepo.find({
    where: [{ email: search }, { mobile: search }, { clientid: search }],
    select: ["clientid"],
  });

  const clientIds = matchingUsers.map((u) => u.clientid).filter(Boolean);
  if (!clientIds.length) return undefined;

  const accountRepo = AppDataSource.getRepository(Account);
  const accounts = await accountRepo.find({ where: { Parent: In(clientIds) }, select: ["AcNo"] });
  return accounts.map((a) => a.AcNo);
}

export const getRewardsHandler = async (req: Request, res: Response) => {
  try {
    const params = parseEURewardsListParams(req.query as Record<string, unknown>);
    let acNos: string[] | undefined;

    if (params.search?.trim()) {
      acNos = await resolveSearchAcNos(params.search.trim());
      if (acNos && acNos.length === 0) {
        scheduleRewardsCatchUp();
        return res.status(200).json({
          message: "No rewards found",
          data: [],
          ...(params.legacy ? {} : {
            pagination: {
              page: params.page,
              limit: params.limit,
              totalDays: 0,
              totalRecords: 0,
              totalAmount: 0,
            },
          }),
        });
      }
    }

    const cacheKey = buildCacheKey("yields", {
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      search: params.search ?? "",
      page: params.legacy ? "legacy" : String(params.page),
      limit: params.legacy ? "legacy" : String(params.limit),
      summaryOnly: params.summaryOnly ? "1" : "0",
      groupBy: params.groupBy ?? "day",
      acNos: acNos?.join(",") ?? "",
    });

    const result = await readThroughCache(cacheKey, YIELDS_CACHE_TTL, () =>
      fetchEURewards({ ...params, acNos }),
    );

    scheduleRewardsCatchUp();
    return res.status(200).json({
      message: "Rewards fetched",
      data: result.data,
      ...(result.pagination ? { pagination: result.pagination } : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const getRewardsByClientId = async (req: Request, res: Response) => {
  try {
    const { clientid } = req.params;
    const accountRepo = AppDataSource.getRepository(Account);
    const account = await accountRepo.findOneBy({ Parent: clientid });
    if (!account) return res.status(404).json({ message: "Account not found" });

    const rewards = await AppDataSource.getRepository(Reward).find({
      where: { AcNo: account.AcNo },
      order: { CreatedOn: "DESC" },
      take: DEFAULT_REWARDS_LIST_LIMIT,
    });

    const data = await enrichRewardsForApi(rewards);
    return res.status(200).json({ message: "Rewards fetched", data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const getRewardStatsHandler = async (_req: Request, res: Response) => {
  try {
    const cacheKey = buildCacheKey("yields", { view: "stats" });
    const data = await readThroughCache(cacheKey, YIELDS_CACHE_TTL, async () => {
      const repo = AppDataSource.getRepository(Reward);
      const [totalRes, clRes, euRes] = await Promise.all([
        repo.createQueryBuilder("r").select("SUM(r.Amount)", "total").getRawOne(),
        repo
          .createQueryBuilder("r")
          .innerJoin("r.account", "acc")
          .where("acc.Type = 'CL'")
          .select("SUM(r.Amount)", "total")
          .getRawOne(),
        repo
          .createQueryBuilder("r")
          .innerJoin("r.account", "acc")
          .where("acc.Type = 'EU'")
          .select("SUM(r.Amount)", "total")
          .getRawOne(),
      ]);
      return {
        total_reward: Number(totalRes?.total || 0),
        client_reward: Number(clRes?.total || 0),
        eu_reward: Number(euRes?.total || 0),
      };
    });

    return res.status(200).json({ message: "Reward stats fetched", data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
