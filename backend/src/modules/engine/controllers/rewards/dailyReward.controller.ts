import { Request, Response } from "express";
import { executeMasterRewardDistribution } from "../../service/dailyRewardCalculator";
import { RewardCalculationBusyError } from "../../service/rewardCalculationLock";
import { logger, buildCacheKey, readThroughCache } from "@common";
import { Reward } from "@common";
import { UnitReward } from "@common";
import { CLContract } from "@common";
import { AppDataSource } from "@common";
import { DateTime } from "luxon";
import axios from "axios";

/**
 * Calculate bulk daily rewards over a date range safely
 * POST /api/rewards/daily/bulk
 */
export async function calculateBulkDailyRewardsHandler(req: Request, res: Response) {
  try {
    const { startDate, endDate, manualData } = req.body;
    if (!startDate) {
      if (!res.headersSent) res.status(400).json({ error: "startDate is required" });
      return;
    }

    const start = new Date(startDate + 'T00:00:00Z');
    const end = endDate ? new Date(endDate + 'T00:00:00Z') : new Date(startDate + 'T00:00:00Z');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      if (!res.headersSent) res.status(400).json({ error: "Invalid date format" });
      return;
    }

    const MIPS_REWARD_URL = process.env.MIPS_REWARD_URL;
    let providedMipsData = null;
    if (MIPS_REWARD_URL) {
      let finalUrl = MIPS_REWARD_URL;
      if (finalUrl.includes('limit=')) {
        finalUrl = finalUrl.replace(/limit=\d+/, 'limit=3000');
      } else {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'limit=3000';
      }
      logger.info(`[Bulk Master Run] Fetching MIPS base data: ${finalUrl}`);
      const response = await axios.get(finalUrl);
      providedMipsData = response.data;
    }

    let current = new Date(start.toISOString());
    const results = [];
    const errors = [];

    while (current <= end) {
      const targetDate = new Date(current);
      const targetDateStr = targetDate.toISOString().split('T')[0];
      
      // Determine if there is manual data for this specific date
      const dayManual = manualData && manualData[targetDateStr] 
        ? { income: Number(manualData[targetDateStr].income), hashrate: Number(manualData[targetDateStr].hashrate) }
        : undefined;

      try {
        await executeMasterRewardDistribution(targetDate, providedMipsData, dayManual);
        results.push({ date: targetDateStr, status: "success" });
      } catch (err: any) {
        logger.error(`❌ [Bulk Master Run] Error on ${targetDateStr}: ${err.message}`);
        errors.push({ date: targetDateStr, error: err.message });
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    if (!res.headersSent) {
      res.status(200).json({
        message: `Master Distribution processed. Success: ${results.length}, Errors: ${errors.length}`,
        data: { success: results, errors }
      });
    }
  } catch (err: any) {
    if (err instanceof RewardCalculationBusyError) {
      logger.warn("⚠️ Bulk master run blocked — calculation already in progress");
      if (!res.headersSent) {
        res.status(409).json({ error: err.message });
      }
      return;
    }
    logger.error("❌ Bulk reward distribution failed:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
}

/**
 * Check if rewards already exist for a date range (based on EU Rewards table)
 * GET /api/rewards/daily/check-existence?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
/**
 * Preview which CL contracts (Status=1) participate in master distribution across a date range.
 * Uses ContractStartDate / ContractEndDate in Asia/Dubai — not CreatedOn.
 * GET /api/rewards/daily/cl-eligibility?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function getCLContractRangeEligibilityHandler(req: Request, res: Response) {
  try {
    const dubaiZone = process.env.TIMEZONE || "Asia/Dubai";
    const startDate = req.query.startDate as string | undefined;
    const endDate = (req.query.endDate as string | undefined) || startDate;
    if (!startDate) {
      return res.status(400).json({ error: "startDate is required (YYYY-MM-DD)" });
    }

    const start = DateTime.fromISO(startDate, { zone: dubaiZone }).startOf("day");
    const end = DateTime.fromISO(endDate!, { zone: dubaiZone }).startOf("day");
    if (!start.isValid || !end.isValid) {
      return res.status(400).json({ error: "Invalid startDate or endDate" });
    }
    if (end < start) {
      return res.status(400).json({ error: "endDate must be >= startDate" });
    }

    const maxSpanDays = 800;
    if (end.diff(start, "days").days > maxSpanDays) {
      return res.status(400).json({ error: `Range too large; max ${maxSpanDays} days` });
    }

    const clContractRepo = AppDataSource.getRepository(CLContract);
    const contracts = await clContractRepo.find({ where: { Status: 1 }, order: { Id: "ASC" } });

    const rangeEndDay = end.endOf("day");

    const rows = contracts.map((c) => {
      const base = {
        id: c.Id,
        AcNo: c.AcNo ?? null,
        ClientID: c.ClientID ?? null,
        ContractStartDate: c.ContractStartDate ?? null,
        ContractEndDate: c.ContractEndDate ?? null,
        hostingfee: c.hostingfee ?? null,
        Hashrate: c.Hashrate ?? null,
      };

      if (!c.ContractStartDate) {
        return {
          ...base,
          daysActiveInRange: 0,
          firstWorkDateInRange: null as string | null,
          lastWorkDateInRange: null as string | null,
          note: "Excluded until ContractStartDate is set",
        };
      }

      const cs = DateTime.fromJSDate(new Date(c.ContractStartDate), { zone: dubaiZone }).startOf("day");
      const ce = c.ContractEndDate
        ? DateTime.fromJSDate(new Date(c.ContractEndDate), { zone: dubaiZone }).endOf("day")
        : null;

      const overlaps =
        cs.toMillis() <= rangeEndDay.toMillis() &&
        (ce == null || ce.toMillis() >= start.toMillis());

      if (!overlaps) {
        return {
          ...base,
          daysActiveInRange: 0,
          firstWorkDateInRange: null,
          lastWorkDateInRange: null,
          note: "No overlap with requested range (contract inactive for all days in range)",
        };
      }

      let cur = DateTime.max(start, cs);
      const lastDay = ce ? DateTime.min(end, ce.startOf("day")) : end;
      let days = 0;
      let first: string | null = null;
      let last: string | null = null;
      while (cur <= lastDay) {
        days++;
        if (!first) first = cur.toISODate() ?? null;
        last = cur.toISODate() ?? null;
        cur = cur.plus({ days: 1 });
      }

      return {
        ...base,
        daysActiveInRange: days,
        firstWorkDateInRange: first,
        lastWorkDateInRange: last,
        note:
          days > 0
            ? "Counted per calendar day in range where ContractStartDate ≤ day and (no end or ContractEndDate ≥ day)"
            : undefined,
      };
    });

    const withDays = rows.filter((r) => r.daysActiveInRange > 0);

    return res.status(200).json({
      timezone: dubaiZone,
      range: { startDate: start.toISODate(), endDate: end.toISODate() },
      summary: {
        totalActiveContracts: contracts.length,
        contractsWithDaysInRange: withDays.length,
        totalContractDaysInRange: rows.reduce((s, r) => s + r.daysActiveInRange, 0),
      },
      contracts: rows,
    });
  } catch (err: any) {
    logger.error("❌ CL eligibility preview failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

export async function checkDailyRewardsExistHandler(req: Request, res: Response) {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate) return res.status(400).json({ error: "startDate is required" });

    const start = new Date(startDate as string);
    const end = endDate ? new Date(endDate as string) : new Date(startDate as string);

    const rewardRepo = AppDataSource.getRepository(Reward);
    const dubaiZone = "Asia/Dubai";
    const startTarget = DateTime.fromJSDate(start).setZone(dubaiZone).startOf("day").toJSDate();
    const endTarget = DateTime.fromJSDate(end).setZone(dubaiZone).endOf("day").toJSDate();

    // If there is ANY entry in EU Rewards table for this period, we consider it processed
    const existing = await rewardRepo.createQueryBuilder("r")
      .where("r.CreatedOn >= :startTarget", { startTarget })
      .andWhere("r.CreatedOn <= :endTarget", { endTarget })
      .getCount();

    res.status(200).json({ exists: existing > 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Calculate single day rewards (Used by manual run and cron)
 * POST /api/rewards/daily/calculate
 */
export async function calculateDailyRewardsHandler(req: Request, res: Response) {
  try {
    const { date, manualData } = req.body;
    const targetDate = date ? new Date(date) : undefined;

    const result = await executeMasterRewardDistribution(targetDate, undefined, manualData);

    if (!res.headersSent) {
      res.status(200).json({
        message: "Master rewards distribution executed successfully",
        data: result
      });
    }

    logger.info(`✅ Master distribution processed for WorkDate: ${result.workDateStr ?? result.workDate.toISOString().slice(0, 10)}`);

  } catch (err: any) {
    if (err instanceof RewardCalculationBusyError) {
      logger.warn("⚠️ Master reward distribution skipped — calculation already in progress");
      if (!res.headersSent) {
        res.status(409).json({ error: err.message });
      }
      return;
    }
    logger.error("❌ Master reward distribution failed:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
}

/**
 * Get all EU rewards (History replacement)
 * GET /api/rewards/daily
 */
export async function getDailyRewardsHandler(req: Request, res: Response) {
  try {
    const { dateFrom, dateTo } = req.query;
    const repo = AppDataSource.getRepository(Reward);

    const queryBuilder = repo.createQueryBuilder("reward")
       .leftJoinAndSelect("reward.account", "account");

    if (dateFrom) queryBuilder.andWhere("DATE(reward.CreatedOn) >= DATE(:dateFrom)", { dateFrom });
    if (dateTo) queryBuilder.andWhere("DATE(reward.CreatedOn) <= DATE(:dateTo)", { dateTo });

    queryBuilder.orderBy("reward.CreatedOn", "DESC");
    const rewards = await queryBuilder.getMany();

    res.status(200).json({
      message: "Rewards fetched successfully",
      data: rewards
    });
  } catch (err: any) {
    logger.error("❌ Get rewards failed:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Check which dates in a range have missing MIPS data
 * GET /api/rewards/daily/check-mips?startDate=...&endDate=...
 */
export async function checkMipsDataAvailabilityHandler(req: Request, res: Response) {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate) return res.status(400).json({ error: "startDate is required" });

    const start = new Date(startDate as string + 'T00:00:00Z');
    const end = endDate ? new Date(endDate as string + 'T00:00:00Z') : new Date(startDate as string + 'T00:00:00Z');

    const MIPS_REWARD_URL = process.env.MIPS_REWARD_URL;
    if (!MIPS_REWARD_URL) throw new Error("MIPS_REWARD_URL not set");

    const response = await axios.get(MIPS_REWARD_URL + (MIPS_REWARD_URL.includes('?') ? '&' : '?') + 'limit=3000');
    const mipsData = response.data.income || [];

    const datesInMips = new Set(mipsData.map((item: any) => {
      if (!item.timestamp) return null;
      const localDate = new Date(item.timestamp * 1000);
      const offsetLocal = new Date(localDate.getTime() + (4 * 60 * 60 * 1000));
      return offsetLocal.toISOString().split('T')[0];
    }).filter(Boolean));

    const missingDates = [];
    let currentDate = new Date(start.getTime());

    while (currentDate <= end) {
      const nextDate = new Date(currentDate.getTime());
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const dStrShifted = nextDate.toISOString().split('T')[0];

      if (!datesInMips.has(dStrShifted)) {
        missingDates.push(currentDate.toISOString().split('T')[0]);
      }
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    // Prefill helper
    let lastKnownRecord = mipsData[0] || null;
    let defaultManualValues = null;
    if (lastKnownRecord) {
      const hs = lastKnownRecord.total_hashrate_str ? Number(lastKnownRecord.total_hashrate_str) : Number(lastKnownRecord.total_hashrate);
      defaultManualValues = {
        income: Number(lastKnownRecord.income).toFixed(8),
        hashrate: (hs / 1e12).toFixed(3)
      };
    }

    return res.status(200).json({ missingDates, defaultManualValues });
  } catch (err: any) {
    logger.error("❌ Check MIPS data failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Get the most recent calculated Unit Reward from the ledger
 */
export async function getLatestUnitRewardHandler(_req: Request, res: Response) {
  try {
    const cacheKey = buildCacheKey("rewards:daily", { view: "latest-unit" });
    const latest = await readThroughCache(cacheKey, 120, async () => {
      const repo = AppDataSource.getRepository(UnitReward);
      return repo
        .createQueryBuilder("ur")
        .orderBy("ur.CreatedOn", "DESC")
        .getOne();
    });
    res.status(200).json({ data: latest });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Get all Unit Reward history
 */
export async function getUnitRewardsHistoryHandler(_req: Request, res: Response) {
  try {
    const repo = AppDataSource.getRepository(UnitReward);
    const history = await repo.find({
      order: { CreatedOn: "DESC" }
    });
    res.status(200).json({ data: history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
