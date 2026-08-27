import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { dashboardPanelClass } from "./panelStyles";

type MetricCardProps = {
    title: string;
    value: ReactNode;
    subValue?: ReactNode;
    icon: ReactNode;
    iconColor?: string;
    badge?: string | number;
    loading?: boolean;
    valueClassName?: string;
};

export default function MetricCard({
    title,
    value,
    subValue,
    icon,
    iconColor = "text-brand-600",
    badge,
    loading,
    valueClassName,
}: MetricCardProps) {
    return (
        <div className={cn(dashboardPanelClass, "min-h-[104px] min-w-0 overflow-hidden")}>
            <div
                className={cn(
                    "pointer-events-none absolute right-2 bottom-2 opacity-[0.12] dark:opacity-[0.16]",
                    iconColor,
                )}
                aria-hidden
            >
                <div className="flex h-14 w-14 items-center justify-center [&_svg]:h-14 [&_svg]:w-14 [&_span]:text-4xl [&_span]:leading-none">
                    {icon}
                </div>
            </div>

            <div className="relative min-w-0 pr-12 sm:pr-14">
                <div className="flex min-h-5 items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
                    <span
                        className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            loading || badge === undefined
                                ? "invisible bg-transparent"
                                : "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
                        )}
                        aria-hidden={loading || badge === undefined}
                    >
                        {badge ?? "0"}
                    </span>
                </div>
                <div className="mt-2 min-h-8 sm:min-h-9">
                    {loading ? (
                        <div
                            className={cn(
                                "h-8 w-28 max-w-full animate-pulse rounded bg-gray-200 sm:h-9 dark:bg-gray-700",
                                valueClassName,
                            )}
                            aria-busy="true"
                            aria-label="Loading metric"
                        />
                    ) : (
                        <>
                            <p
                                className={cn(
                                    "truncate text-lg font-bold tabular-nums text-gray-900 sm:text-2xl dark:text-white",
                                    valueClassName,
                                )}
                            >
                                {value}
                            </p>
                            {subValue != null && (
                                <p className="mt-0.5 truncate text-xs font-medium tabular-nums text-gray-400 dark:text-gray-500">
                                    {subValue}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
