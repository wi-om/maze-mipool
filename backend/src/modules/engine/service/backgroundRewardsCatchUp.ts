/**
 * Shared rewards catch-up engine.
 *
 * Callers:
 *   - Dashboard: GET /api/yields → scheduleRewardsCatchUp() — fire-and-forget, no failure counter
 *   - Azure cron: POST /api/rewards/daily/cron → await triggerBackgroundRewardsCatchUp()
 *
 * Main flow (triggerBackgroundRewardsCatchUp):
 *   1. Lock check (isCatchupRunning) → skipped if busy
 *   2. getEligibleEndDate() → Dubai yesterday (MIPS one-day-ahead rule)
 *   3. getLastCalculatedWorkDate() → min(EU, UnitRewards), ignore bad future Unit dates
 *   4. computeDateRange() → missing days, cap at MAX_GAP_DAYS (7)
 *   5. prefetchMipsData() once (limit=3000)
 *   6. For each work day: findMipsRecordForWorkDate → executeMasterRewardDistribution
 *   7. Return success | partial | failed | up_to_date | skipped
 *   8. finally: release lock
 */
import axios from "axios";
import { DateTime } from "luxon";
import { AppDataSource, logger, UnitReward, Reward } from "@common";
import { runMasterRewardDistribution } from "./dailyRewardCalculator";
import { sendRewardsCatchUpAlert } from "./rewardsCatchUpAlerts";
import {
  isRewardCalculationInProgress,
  releaseRewardCalculationLock,
  tryAcquireRewardCalculationLock,
} from "./rewardCalculationLock";
import { dbTimestampToDubaiWorkDate } from "./rewardWorkDate";

/** Never backfill more than this many Dubai work days in one run. */
const MAX_GAP_DAYS = 7;

export type CatchUpStatus =
  | "success"
  | "partial"
  | "failed"
  | "skipped"
  | "up_to_date";

export type DayProcessResult = {
  date: string;
  status: "success" | "failed" | "skipped";
  error?: string;
};

export type CatchUpResult = {
  status: CatchUpStatus;
  eligibleEndDate: string;
  lastCalculatedBefore: string | null;
  gapDays: number;
  processed: DayProcessResult[];
  durationMs: number;
};

function getDubaiZone(): string {
  return process.env.TIMEZONE || "Asia/Dubai";
}

/**
 * Eligible end = Dubai today minus 1 day (start of day).
 * We never calculate "today" in Dubai — MIPS pool for today is not final yet.
 */
export function getEligibleEndDate(): DateTime {
  return DateTime.now().setZone(getDubaiZone()).minus({ days: 1 }).startOf("day");
}

/** Normalize DB CreatedOn → Dubai work-date string YYYY-MM-DD (new + legacy timestamps). */
function toDubaiWorkDate(value: Date): string {
  return dbTimestampToDubaiWorkDate(value, getDubaiZone());
}

/** Latest EU Reward row — what MCA dashboard /rewards shows. */
export async function getLatestEuRewardWorkDate(): Promise<string | null> {
  const latest = await AppDataSource.getRepository(Reward)
    .createQueryBuilder("r")
    .orderBy("r.CreatedOn", "DESC")
    .getOne();

  if (!latest?.CreatedOn) return null;
  return toDubaiWorkDate(latest.CreatedOn);
}

/** Latest UnitRewards row — internal ledger (may have incorrect future CreatedOn). */
export async function getLatestUnitRewardWorkDate(): Promise<string | null> {
  const latest = await AppDataSource.getRepository(UnitReward)
    .createQueryBuilder("ur")
    .orderBy("ur.CreatedOn", "DESC")
    .getOne();

  if (!latest?.CreatedOn) return null;
  return toDubaiWorkDate(latest.CreatedOn);
}

/**
 * Effective "last calculated" for gap math.
 * - If UnitRewards date > eligible end → ignore Unit (bad data), use EU only
 * - Else use earlier of EU and Unit (conservative — catches real gaps)
 */
export async function getLastCalculatedWorkDate(): Promise<string | null> {
  const euDate = await getLatestEuRewardWorkDate();
  const unitDate = await getLatestUnitRewardWorkDate();
  const eligibleEnd = getEligibleEndDate();

  if (unitDate) {
    const unitDt = DateTime.fromISO(unitDate, { zone: getDubaiZone() });
    if (unitDt > eligibleEnd) {
      logger.warn(
        `[RewardsCatchUp] UnitReward ledger ${unitDate} is after eligible end ${eligibleEnd.toISODate()}; ignoring UnitRewards for gap`
      );
      return euDate;
    }
  }

  if (!euDate && !unitDate) return null;
  if (!euDate) return unitDate;
  if (!unitDate) return euDate;

  const euDt = DateTime.fromISO(euDate, { zone: getDubaiZone() });
  const unitDt = DateTime.fromISO(unitDate, { zone: getDubaiZone() });
  return euDt <= unitDt ? euDate : unitDate;
}

/**
 * Map work date D to MIPS income row dated D+1 (same rule as dailyRewardCalculator).
 */
export function findMipsRecordForWorkDate(
  mipsData: any,
  workDate: DateTime
): any | null {
  if (!mipsData?.income?.length) return null;

  const mipsDateStr = workDate.plus({ days: 1 }).toFormat("yyyy-MM-dd");

  return (
    mipsData.income.find((item: any) => {
      if (!item.timestamp) return false;
      const localDate = new Date(item.timestamp * 1000);
      const offsetLocal = new Date(localDate.getTime() + 4 * 60 * 60 * 1000);
      return offsetLocal.toISOString().split("T")[0] === mipsDateStr;
    }) ?? null
  );
}

/** One HTTP GET for entire run; bump limit to 3000 so all gap days are covered. */
export async function prefetchMipsData(): Promise<any | null> {
  const MIPS_REWARD_URL = process.env.MIPS_REWARD_URL;
  if (!MIPS_REWARD_URL) return null;

  let finalUrl = MIPS_REWARD_URL;
  if (finalUrl.includes("limit=")) {
    finalUrl = finalUrl.replace(/limit=\d+/, "limit=3000");
  } else {
    finalUrl += (finalUrl.includes("?") ? "&" : "?") + "limit=3000";
  }

  logger.info(`[RewardsCatchUp] Fetching MIPS data: ${finalUrl}`);
  const response = await axios.get(finalUrl);
  return response.data;
}

/**
 * Build inclusive [start, end] work dates to process.
 * Returns null when lastCalculated >= eligibleEnd (already up to date).
 */
function computeDateRange(
  eligibleEnd: DateTime,
  lastCalculated: string | null
): { start: DateTime; end: DateTime; gapDays: number } | null {
  const end = eligibleEnd;
  let start: DateTime;

  if (!lastCalculated) {
    // Fresh system: only eligible end (one day), never multi-year backfill
    start = end;
  } else {
    const last = DateTime.fromISO(lastCalculated, { zone: getDubaiZone() }).startOf("day");
    if (last >= end) return null;
    start = last.plus({ days: 1 });
  }

  // Cap span to MAX_GAP_DAYS
  const spanDays = end.diff(start, "days").days;
  if (spanDays > MAX_GAP_DAYS - 1) {
    start = end.minus({ days: MAX_GAP_DAYS - 1 });
  }

  const gapDays = Math.floor(end.diff(start, "days").days) + 1;
  return { start, end, gapDays };
}

export function isCatchupInProgress(): boolean {
  return isRewardCalculationInProgress();
}

/**
 * Main entry — dashboard and cron both call this.
 * Days run sequentially (CM wallet needs previous day's balance).
 */
export async function triggerBackgroundRewardsCatchUp(): Promise<CatchUpResult> {
  const started = Date.now();
  const eligibleEnd = getEligibleEndDate();
  const eligibleEndStr = eligibleEnd.toISODate()!;

  // ── Step 1: Process lock (blocks manual/bulk/cron overlap for whole run) ──
  if (!tryAcquireRewardCalculationLock()) {
    return {
      status: "skipped",
      eligibleEndDate: eligibleEndStr,
      lastCalculatedBefore: null,
      gapDays: 0,
      processed: [],
      durationMs: Date.now() - started,
    };
  }

  try {
    // ── Step 2: Gap detection ──
    const lastCalculated = await getLastCalculatedWorkDate();
    const lastEu = await getLatestEuRewardWorkDate();
    const lastUnit = await getLatestUnitRewardWorkDate();
    const range = computeDateRange(eligibleEnd, lastCalculated);

    // ── Step 3: Nothing to do ──
    if (!range) {
      logger.info(
        `[RewardsCatchUp] Already up to date (eligibleEnd=${eligibleEndStr}, lastEu=${lastEu}, lastUnit=${lastUnit}, effectiveLast=${lastCalculated})`
      );
      return {
        status: "up_to_date",
        eligibleEndDate: eligibleEndStr,
        lastCalculatedBefore: lastCalculated,
        gapDays: 0,
        processed: [],
        durationMs: Date.now() - started,
      };
    }

    logger.info(
      `[RewardsCatchUp] Gap detected: ${range.start.toISODate()} → ${range.end.toISODate()} (${range.gapDays} day(s)); lastEu=${lastEu}, lastUnit=${lastUnit}`
    );

    // ── Step 4: MIPS prefetch (once per run) ──
    let providedMipsData: any = null;
    try {
      providedMipsData = await prefetchMipsData();
    } catch (err: any) {
      logger.error("[RewardsCatchUp] MIPS prefetch failed:", err.message);
    }

    // ── Step 5: Process each missing work day in order ──
    const processed: DayProcessResult[] = [];
    let failures = 0;
    let current = range.start;

    while (current <= range.end) {
      const workDateStr = current.toFormat("yyyy-MM-dd");

      // 5a: No MIPS payload at all
      if (!providedMipsData) {
        failures++;
        processed.push({
          date: workDateStr,
          status: "failed",
          error: "MIPS_REWARD_URL not set or prefetch failed",
        });
        await sendRewardsCatchUpAlert(
          "mips_missing",
          workDateStr,
          "MIPS data could not be loaded."
        );
        current = current.plus({ days: 1 });
        continue;
      }

      // 5b: MIPS loaded but no row for this work day (mips date = work+1)
      if (!findMipsRecordForWorkDate(providedMipsData, current)) {
        failures++;
        const mipsExpected = current.plus({ days: 1 }).toFormat("yyyy-MM-dd");
        processed.push({
          date: workDateStr,
          status: "failed",
          error: `No MIPS record for mips date ${mipsExpected}`,
        });
        await sendRewardsCatchUpAlert(
          "mips_missing",
          workDateStr,
          `Expected MIPS date: ${mipsExpected}`
        );
        current = current.plus({ days: 1 });
        continue;
      }

      // 5c: Run existing master calculator (EU + CL + CM wallet) — unlocked; outer lock held
      try {
        await runMasterRewardDistribution(current.toJSDate(), providedMipsData);
        processed.push({ date: workDateStr, status: "success" });
      } catch (err: any) {
        failures++;
        processed.push({
          date: workDateStr,
          status: "failed",
          error: err.message,
        });
        await sendRewardsCatchUpAlert("calculation_failed", workDateStr, err.message);
        logger.error(`[RewardsCatchUp] Failed for ${workDateStr}:`, err.message);
      }

      current = current.plus({ days: 1 });
    }

    // ── Step 6: Aggregate status for cron / logs ──
    const status: CatchUpStatus =
      failures === 0 ? "success" : failures === processed.length ? "failed" : "partial";

    logger.info(
      `[RewardsCatchUp] Done status=${status} days=${processed.length} failures=${failures}`
    );

    return {
      status,
      eligibleEndDate: eligibleEndStr,
      lastCalculatedBefore: lastCalculated,
      gapDays: range.gapDays,
      processed,
      durationMs: Date.now() - started,
    };
  } catch (err: any) {
    logger.error("[RewardsCatchUp] Unexpected error:", err.message);
    return {
      status: "failed",
      eligibleEndDate: eligibleEndStr,
      lastCalculatedBefore: null,
      gapDays: 0,
      processed: [],
      durationMs: Date.now() - started,
    };
  } finally {
    // ── Step 7: Always release lock ──
    releaseRewardCalculationLock();
  }
}
