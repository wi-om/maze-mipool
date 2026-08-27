import { dashboardPanelClass } from "../common/panelStyles";
import { cn } from "@/lib/utils";

type ChartPanelSkeletonProps = {
    titleWidth?: string;
    subtitleWidth?: string;
    chartHeight?: string;
    className?: string;
};

export default function ChartPanelSkeleton({
    titleWidth = "w-48",
    subtitleWidth = "w-64",
    chartHeight = "h-[310px]",
    className,
}: ChartPanelSkeletonProps) {
    return (
        <div className={cn(dashboardPanelClass, className, "min-h-[390px]")}>
            <div className="mb-4 space-y-2">
                <div className={cn("h-6 animate-pulse rounded bg-gray-200 dark:bg-gray-700", titleWidth)} />
                <div className={cn("h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800", subtitleWidth)} />
            </div>
            <div
                className={cn(
                    "animate-pulse rounded-md bg-gray-100 dark:bg-gray-800/80",
                    chartHeight,
                )}
                aria-hidden
            />
        </div>
    );
}
