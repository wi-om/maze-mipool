import { Request, Response } from "express";
import { logger, buildCacheKey, readThroughCache } from "@common";
import { getCLUptimeStats } from "../../service/clUptime.service";
import {
  fetchCLRewards,
  fetchCMWallet,
  parseClRewardsListParams,
  parseDaysPaginatedParams,
} from "../../service/rewardList.service";
const CL_CACHE_TTL = 60;
const WALLET_CACHE_TTL = 60;

export async function getCLRewardsHandler(req: Request, res: Response) {
  try {
    const params = parseClRewardsListParams(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey("yields:cl", {
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      search: params.search ?? "",
      page: params.legacy ? "legacy" : String(params.page),
      limit: params.legacy ? "legacy" : String(params.limit),
      summaryOnly: params.summaryOnly ? "1" : "0",
      groupBy: params.groupBy ?? "day",
    });

    const result = await readThroughCache(cacheKey, CL_CACHE_TTL, () => fetchCLRewards(params));

    return res.status(200).json({
      message: "CL Rewards fetched successfully",
      data: result.data,
      ...(result.pagination ? { pagination: result.pagination } : {}),
    });
  } catch (err: any) {
    logger.error("❌ Failed to fetch CL rewards:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

export async function getCLUptimeHandler(_req: Request, res: Response) {
  try {
    const cacheKey = buildCacheKey("yields:cl", { view: "uptime" });
    const stats = await readThroughCache(cacheKey, CL_CACHE_TTL, () => getCLUptimeStats());
    return res.status(200).json({
      message: "CL uptime stats fetched",
      data: stats,
    });
  } catch (err: any) {
    logger.error("❌ Failed to fetch CL uptime stats:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

export async function getCMWalletHandler(req: Request, res: Response) {
  try {
    const params = parseDaysPaginatedParams(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey("yields:wallet", {
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      search: params.search ?? "",
      page: params.legacy ? "legacy" : String(params.page),
      limit: params.legacy ? "legacy" : String(params.limit),
      summaryOnly: params.summaryOnly ? "1" : "0",
    });

    const result = await readThroughCache(cacheKey, WALLET_CACHE_TTL, () => fetchCMWallet(params));

    return res.status(200).json({
      message: "Wallet entries fetched successfully",
      data: result.data,
      ...(result.pagination ? { pagination: result.pagination } : {}),
    });
  } catch (err: any) {
    logger.error("❌ Failed to fetch wallet entries:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
