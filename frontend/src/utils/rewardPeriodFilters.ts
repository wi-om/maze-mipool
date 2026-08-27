import { format, subDays, subMonths, subYears } from "date-fns";
import type { DateRange } from "react-day-picker";

export type RewardFilterPeriod =
    | "today"
    | "yesterday"
    | "7days"
    | "30days"
    | "quarterly"
    | "yearly"
    | "all"
    | "custom";

export function periodToDateRange(
    period: RewardFilterPeriod,
    custom?: DateRange,
): { dateFrom?: string; dateTo?: string } {
    const today = new Date();
    const fmt = (d: Date) => format(d, "yyyy-MM-dd");

    switch (period) {
        case "all":
            return {};
        case "today":
            return { dateFrom: fmt(today), dateTo: fmt(today) };
        case "yesterday": {
            const y = subDays(today, 1);
            return { dateFrom: fmt(y), dateTo: fmt(y) };
        }
        case "7days":
            return { dateFrom: fmt(subDays(today, 7)), dateTo: fmt(today) };
        case "30days":
            return { dateFrom: fmt(subDays(today, 30)), dateTo: fmt(today) };
        case "quarterly":
            return { dateFrom: fmt(subMonths(today, 3)), dateTo: fmt(today) };
        case "yearly":
            return { dateFrom: fmt(subYears(today, 1)), dateTo: fmt(today) };
        case "custom":
            if (custom?.from) {
                return { dateFrom: fmt(custom.from), dateTo: fmt(custom.to ?? custom.from) };
            }
            return {};
    }
}
