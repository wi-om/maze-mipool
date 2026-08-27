import { DateTime } from "luxon";

const DUBAI_ZONE = process.env.TIMEZONE || "Asia/Dubai";

export function getDubaiZone(): string {
  return DUBAI_ZONE;
}

export function dubaiTodayIso(): string {
  return DateTime.now().setZone(DUBAI_ZONE).toISODate()!;
}

/** Default pay-through = yesterday (work today, pay tomorrow). */
export function dubaiYesterdayIso(): string {
  return DateTime.now().setZone(DUBAI_ZONE).minus({ days: 1 }).toISODate()!;
}

export function rewardWorkDateFromCreatedOn(createdOn: Date): string {
  return DateTime.fromISO(createdOn.toISOString(), { zone: "utc" })
    .setZone(DUBAI_ZONE)
    .startOf("day")
    .toISODate()!;
}

export function inferPaidThroughFromPayoutCreatedOn(createdOn: Date): string {
  return DateTime.fromJSDate(createdOn).setZone(DUBAI_ZONE).minus({ days: 1 }).toISODate()!;
}

export function normalizePaidThroughDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).setZone(DUBAI_ZONE).toISODate();
  }
  const trimmed = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export function resolvePaidThroughDate(input?: string | null): string {
  const normalized = input ? normalizePaidThroughDate(input) : null;
  return normalized ?? dubaiYesterdayIso();
}

export function validatePaidThroughDate(
  input: string
): { ok: true; value: string } | { ok: false; error: string } {
  const value = normalizePaidThroughDate(input);
  if (!value) {
    return { ok: false, error: "paidThroughDate must be YYYY-MM-DD" };
  }
  const max = dubaiYesterdayIso();
  if (value > max) {
    return {
      ok: false,
      error: `paidThroughDate cannot be after ${max} (yesterday Dubai — today's work pays tomorrow)`,
    };
  }
  return { ok: true, value };
}

export function isRewardInPayableRange(
  workDate: string,
  lastPaidThrough: string | null,
  paidThroughDate: string
): boolean {
  if (lastPaidThrough && workDate <= lastPaidThrough) return false;
  if (workDate > paidThroughDate) return false;
  return true;
}
