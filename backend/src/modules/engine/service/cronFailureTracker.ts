/**
 * Cron-only failure budget (dashboard catch-up does NOT use this).
 *
 * Storage: SystemSettings rows keyed by Dubai date:
 *   rewards_cron_failures_YYYY-MM-DD     → count of failed/partial runs today
 *   rewards_cron_priority_sent_YYYY-MM-DD → "1" if CRITICAL email already sent
 *
 * Flow with rewardsCronJobHandler:
 *   getCronFailuresToday → run catch-up → on failed/partial → incrementCronFailuresToday
 *   → isCronFailureLimitReached → stopRetry + priority email (once via was/mark)
 */
import { AppDataSource } from "@common";
import { SystemSetting } from "@common";
import { DateTime } from "luxon";

/** Max failed/partial cron attempts per Dubai day (env REWARDS_CRON_MAX_FAILURES_PER_DAY, default 5). */
export function getMaxCronFailuresPerDay(): number {
  const raw = process.env.REWARDS_CRON_MAX_FAILURES_PER_DAY;
  const n = raw ? parseInt(raw, 10) : 5;
  return Number.isNaN(n) || n < 1 ? 5 : n;
}

/** Current Dubai calendar date string for all keys today. */
function dubaiTodayKey(): string {
  const zone = process.env.TIMEZONE || "Asia/Dubai";
  return DateTime.now().setZone(zone).toFormat("yyyy-MM-dd");
}

function failuresKey(dubaiDate: string): string {
  return `rewards_cron_failures_${dubaiDate}`;
}

function prioritySentKey(dubaiDate: string): string {
  return `rewards_cron_priority_sent_${dubaiDate}`;
}

/** Read failure count for today; new Dubai day = no row = count 0. */
export async function getCronFailuresToday(): Promise<{ count: number; dubaiDate: string }> {
  const dubaiDate = dubaiTodayKey();
  const repo = AppDataSource.getRepository(SystemSetting);
  const row = await repo.findOne({ where: { Key: failuresKey(dubaiDate) } });
  const count = row?.Value ? parseInt(row.Value, 10) : 0;
  return { count: Number.isNaN(count) ? 0 : count, dubaiDate };
}

/** +1 after a failed or partial catch-up run (cron path only). */
export async function incrementCronFailuresToday(): Promise<number> {
  const dubaiDate = dubaiTodayKey();
  const repo = AppDataSource.getRepository(SystemSetting);
  const key = failuresKey(dubaiDate);
  const existing = await repo.findOne({ where: { Key: key } });
  const next = (existing?.Value ? parseInt(existing.Value, 10) : 0) + 1;
  const value = String(next);

  if (existing) {
    existing.Value = value;
    existing.UpdatedBy = "rewards-cron";
    await repo.save(existing);
  } else {
    await repo.save(
      repo.create({ Key: key, Value: value, UpdatedBy: "rewards-cron" })
    );
  }
  return next;
}

/** True when count >= max (default 5) — cron must stop retrying until tomorrow. */
export function isCronFailureLimitReached(count: number): boolean {
  return count >= getMaxCronFailuresPerDay();
}

/** Read-only: already sent priority email for this Dubai date? */
export async function wasPriorityEmailSentToday(dubaiDate: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(SystemSetting);
  const row = await repo.findOne({ where: { Key: prioritySentKey(dubaiDate) } });
  return row?.Value === "1";
}

/** Write-only: mark priority email sent (call after successful send). */
export async function markPriorityEmailSentToday(dubaiDate: string): Promise<void> {
  const repo = AppDataSource.getRepository(SystemSetting);
  const key = prioritySentKey(dubaiDate);
  const existing = await repo.findOne({ where: { Key: key } });
  if (existing) {
    existing.Value = "1";
    await repo.save(existing);
  } else {
    await repo.save(repo.create({ Key: key, Value: "1", UpdatedBy: "rewards-cron" }));
  }
}
