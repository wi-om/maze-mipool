import { DateTime } from "luxon";

/**
 * DB `timestamp without time zone` helpers — store Dubai business date as
 * YYYY-MM-DD 00:00:00 UTC literal so Azure and local pgAdmin match.
 */

/** Work date string → CreatedOn / RewardOn / rewardDate (00:00:00.000 UTC). */
export function workDateStrToDbTimestamp(workDateStr: string): Date {
  const [y, m, d] = workDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function workDateStrToDbDayEnd(workDateStr: string): Date {
  const [y, m, d] = workDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

/** Bounds for DELETE — covers new calendar storage and legacy Dubai-instant rows. */
export function getWorkDateDeleteBounds(workDateStr: string, dubaiZone: string) {
  const target = DateTime.fromFormat(workDateStr, "yyyy-MM-dd", { zone: dubaiZone }).startOf("day");
  return {
    newStart: workDateStrToDbTimestamp(workDateStr),
    newEnd: workDateStrToDbDayEnd(workDateStr),
    legacyStart: target.toJSDate(),
    legacyEnd: target.endOf("day").toJSDate(),
  };
}

/** SQL fragment for CreatedOn / RewardOn / rewardDate cleanup (both storage formats). */
export const WORK_DATE_COLUMN_DELETE_SQL =
  "((column BETWEEN :newStart AND :newEnd) OR (column BETWEEN :legacyStart AND :legacyEnd))";

export function workDateDeleteWhere(columnName: string): string {
  return WORK_DATE_COLUMN_DELETE_SQL.replace(/column/g, columnName);
}

/** Read any CreatedOn/RewardOn → Dubai business date YYYY-MM-DD. */
export function dbTimestampToDubaiWorkDate(value: Date, dubaiZone: string): string {
  return DateTime.fromISO(value.toISOString(), { zone: "utc" })
    .setZone(dubaiZone)
    .startOf("day")
    .toISODate()!;
}
