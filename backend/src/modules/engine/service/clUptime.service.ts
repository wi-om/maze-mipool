import { AppDataSource } from "@common";
import { CLReward } from "@common";
import { DateTime } from "luxon";

const DUBAI = process.env.TIMEZONE || "Asia/Dubai";

export type CLUptimePeriodKey = "today" | "yesterday" | "thisMonth" | "lastMonth" | "thisYear";

export type CLUptimeStats = Record<CLUptimePeriodKey, number | null>;

async function avgSlaBetween(start: DateTime, end: DateTime): Promise<number | null> {
  const row = await AppDataSource.getRepository(CLReward)
    .createQueryBuilder("r")
    .select("AVG(r.sla)", "avgSla")
    .where("r.sla IS NOT NULL")
    .andWhere("r.RewardOn >= :start", { start: start.toUTC().toJSDate() })
    .andWhere("r.RewardOn <= :end", { end: end.toUTC().toJSDate() })
    .getRawOne();

  if (row?.avgSla == null) return null;
  const avg = Number(row.avgSla);
  return Number.isFinite(avg) ? avg : null;
}

/**
 * Uptime = average SLA from CLR Rewards per calendar period (Dubai timezone).
 * SLA is stored as a decimal factor (e.g. 0.993351 ≈ 99.34% uptime).
 */
export async function getCLUptimeStats(): Promise<CLUptimeStats> {
  const now = DateTime.now().setZone(DUBAI);

  const todayStart = now.startOf("day");
  const todayEnd = now.endOf("day");

  const yesterdayStart = now.minus({ days: 1 }).startOf("day");
  const yesterdayEnd = now.minus({ days: 1 }).endOf("day");

  const thisMonthStart = now.startOf("month");
  const thisMonthEnd = now.endOf("month");

  const lastMonthStart = now.minus({ months: 1 }).startOf("month");
  const lastMonthEnd = now.minus({ months: 1 }).endOf("month");

  const thisYearStart = now.startOf("year");
  const thisYearEnd = now.endOf("year");

  const [today, yesterday, thisMonth, lastMonth, thisYear] = await Promise.all([
    avgSlaBetween(todayStart, todayEnd),
    avgSlaBetween(yesterdayStart, yesterdayEnd),
    avgSlaBetween(thisMonthStart, thisMonthEnd),
    avgSlaBetween(lastMonthStart, lastMonthEnd),
    avgSlaBetween(thisYearStart, thisYearEnd),
  ]);

  return { today, yesterday, thisMonth, lastMonth, thisYear };
}
