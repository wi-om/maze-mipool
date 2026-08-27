/**
 * Azure cron HTTP handler — POST /api/rewards/daily/cron
 *
 * Request flow (in order):
 *   1. Route: dailyReward.routes → verifyCronSecret → rewardsCronJobHandler (this file)
 *   2. Read today's cron failure count (Dubai date) from SystemSettings
 *   3. If count ≥ max → return 200 max_failures_reached + optional priority email (once/day)
 *   4. await triggerBackgroundRewardsCatchUp() — same engine as dashboard GET /api/yields
 *   5. On failed/partial → increment failure count; at max → priority email + stopRetry
 *   6. Always HTTP 200 for business outcomes (Azure must not retry on MIPS gaps as 500)
 *
 * Dashboard path differs: GET /api/yields → sendRewardsList → fire-and-forget (no await, no failure counter).
 */
import { Request, Response } from "express";
import { logger } from "@common";
import { triggerBackgroundRewardsCatchUp } from "../../service/backgroundRewardsCatchUp";
import {
  getCronFailuresToday,
  getMaxCronFailuresPerDay,
  incrementCronFailuresToday,
  isCronFailureLimitReached,
  markPriorityEmailSentToday,
  wasPriorityEmailSentToday,
} from "../../service/cronFailureTracker";
import { sendRewardsCatchUpAlert } from "../../service/rewardsCatchUpAlerts";

/**
 * Priority email helper — at most one CRITICAL email per Dubai calendar day.
 * Flow: wasPriorityEmailSentToday (read) → send alert → markPriorityEmailSentToday (write).
 */
async function sendPriorityEmailOncePerDay(
  dubaiDate: string,
  detail: string
): Promise<void> {
  // Step A: skip if we already notified admins today for this Dubai date
  if (await wasPriorityEmailSentToday(dubaiDate)) {
    return;
  }
  // Step B: send CRITICAL email to ADMIN_EMAIL
  await sendRewardsCatchUpAlert("cron_priority", dubaiDate, detail);
  // Step C: persist flag so repeated cron hits today do not spam
  await markPriorityEmailSentToday(dubaiDate);
}

/**
 * POST /api/rewards/daily/cron — Azure Timer entry point.
 * Blocks until catch-up finishes (dashboard does not await this).
 */
export async function rewardsCronJobHandler(req: Request, res: Response) {
  const started = Date.now();

  try {
    // ── Step 1: Load failure budget for today (Dubai YYYY-MM-DD key in SystemSettings) ──
    const { count: failuresBefore, dubaiDate } = await getCronFailuresToday();

    // ── Step 2: Hard stop if we already exhausted retries today (no more calculate) ──
    if (isCronFailureLimitReached(failuresBefore)) {
      await sendPriorityEmailOncePerDay(
        dubaiDate,
        `Failure count was already ${failuresBefore} before this request.`
      );

      return res.status(200).json({
        message: "Cron job blocked — max failures reached for today",
        status: "max_failures_reached",
        stopRetry: true, // Azure: do not schedule more POST /cron today
        failuresToday: failuresBefore,
        dubaiDate,
        maxFailuresPerDay: getMaxCronFailuresPerDay(),
        durationMs: Date.now() - started,
      });
    }

    // ── Step 3: Run shared catch-up engine (gap detect → MIPS prefetch → per-day master calc) ──
    const result = await triggerBackgroundRewardsCatchUp();

    // ── Step 4a: Another caller holds isCatchupRunning (dashboard or prior cron) ──
    if (result.status === "skipped") {
      return res.status(200).json({
        message: "Cron job skipped — catch-up already in progress",
        status: "skipped",
        stopRetry: false, // Azure may retry at next fixed slot (07:30, etc.)
        failuresToday: failuresBefore,
        dubaiDate,
        durationMs: result.durationMs,
      });
    }

    // ── Step 4b: Map engine result to cron failure counter ──
    let failuresToday = failuresBefore;
    let stopRetry = false;

    // Only failed/partial increment the daily counter (success / up_to_date do not)
    if (result.status === "failed" || result.status === "partial") {
      failuresToday = await incrementCronFailuresToday();
      if (isCronFailureLimitReached(failuresToday)) {
        stopRetry = true;
        await sendPriorityEmailOncePerDay(
          dubaiDate,
          `Last run status: ${result.status}. Processed: ${JSON.stringify(result.processed)}`
        );
      }
    }

    // ── Step 5: Normalize status for Azure (success/up_to_date pass through; else reflect stopRetry) ──
    const httpStatus =
      result.status === "up_to_date" || result.status === "success"
        ? result.status
        : stopRetry
          ? "max_failures_reached"
          : result.status;

    // ── Step 6: Return 200 + JSON contract (Azure reads status, stopRetry, failuresToday) ──
    return res.status(200).json({
      message: "Cron job completed",
      status: httpStatus,
      stopRetry,
      failuresToday,
      dubaiDate,
      eligibleEndDate: result.eligibleEndDate,
      lastCalculatedBefore: result.lastCalculatedBefore,
      gapDays: result.gapDays,
      processed: result.processed,
      maxFailuresPerDay: getMaxCronFailuresPerDay(),
      durationMs: Date.now() - started,
    });
  } catch (err: any) {
    // ── Unexpected throw (DB down, etc.) — still 200 so Azure timer does not hard-fail ──
    logger.error("[RewardsCron] Handler error:", err.message);
    const { count, dubaiDate } = await getCronFailuresToday().catch(() => ({
      count: 0,
      dubaiDate: "",
    }));
    let failuresToday = count;
    try {
      failuresToday = await incrementCronFailuresToday();
    } catch {
      /* ignore counter write errors */
    }

    const stopRetry = isCronFailureLimitReached(failuresToday);

    return res.status(200).json({
      message: "Cron job error",
      status: stopRetry ? "max_failures_reached" : "failed",
      stopRetry,
      failuresToday,
      dubaiDate,
      error: err.message,
      maxFailuresPerDay: getMaxCronFailuresPerDay(),
      durationMs: Date.now() - started,
    });
  }
}
