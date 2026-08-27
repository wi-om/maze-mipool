import { useState, useEffect, useRef } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import axios from "axios";
import apiClient from "../../api/client";
import { dashboardPanelClass } from "../common/panelStyles";
import ChartPanelSkeleton from "./ChartPanelSkeleton";
import { cn } from "@/lib/utils";

function formatPH(value: number) {
    return +(value / 1e15).toFixed(2); // PH/s, 2 decimals
}

type SeriesType = { name: string; data: number[] };

export default function StatisticsChart() {
    const [series, setSeries] = useState<SeriesType[]>([{ name: "Total Hashrate", data: [] }]);
    const [timeLabels, setTimeLabels] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const intervalRef = useRef<any>(null);

    useEffect(() => {
        return () => {
            if (intervalRef.current !== null) clearInterval(intervalRef.current);
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let initialLoad = true;

        const fetchAndAppend = async () => {
            try {
                const { data } = await apiClient.get("/api/mips/btc/workers", { signal: controller.signal });
                const totals = data?.total_hashrate ?? { hashrate: 0 };
                const phValue = formatPH(totals?.hashrate ?? 0);

                const now = new Date();
                const label = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

                setSeries((prev) => [
                    {
                        ...prev[0],
                        data: [...prev[0].data, phValue].slice(-20),
                    },
                ]);
                setTimeLabels((prev) => [...prev, label].slice(-20));

                setError(false);
                if (initialLoad) {
                    initialLoad = false;
                    setLoading(false);
                }
            } catch (err: any) {
                if (axios.isCancel?.(err) || err?.name === "CanceledError") return;
                setError(true);
                if (initialLoad) {
                    initialLoad = false;
                    setLoading(false);
                }
            }
        };

        const startTimer = window.setTimeout(() => {
            void fetchAndAppend();
            intervalRef.current = setInterval(fetchAndAppend, 6000);
        }, 150);

        return () => {
            window.clearTimeout(startTimer);
            if (intervalRef.current !== null) clearInterval(intervalRef.current);
            controller.abort();
        };
    }, []);

    const allValues = series[0].data;
    const maxValue = allValues.length > 0 ? Math.max(...allValues) : 10;
    const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
    const yMin = Math.max(0, Math.floor(minValue - 2));
    const yMax = Math.ceil(maxValue + 2);

    const options: ApexOptions = {
        legend: { show: true, position: "top", horizontalAlign: "left" },
        colors: ["#101828"],
        chart: {
            fontFamily: "Poppins, sans-serif",
            height: 310,
            type: "line",
            toolbar: { show: false },
            zoom: { enabled: false },
        },
        stroke: {
            curve: "smooth",
            width: 2,
            colors: ["#101828"],
        },
        markers: {
            size: 4,
            colors: ["#101828"],
            strokeColors: "#fff",
            strokeWidth: 2,
            hover: {
                size: 6,
            },
        },
        grid: {
            borderColor: "#f1f1f1",
            xaxis: { lines: { show: true } },
            yaxis: { lines: { show: true } },
        },
        dataLabels: { enabled: false },
        tooltip: {
            enabled: true,
            x: {
                formatter: (_val, opts) =>
                    opts?.w?.config?.xaxis?.categories?.[opts.dataPointIndex ?? 0] || "",
            },
            y: { formatter: (val: number) => `${val.toFixed(2)} PH/s` },
        },
        xaxis: {
            type: "category",
            categories: timeLabels,
            labels: {
                style: { fontSize: "12px", colors: "#6B7280" },
                formatter: (value: string) => {
                    if (!value) return "";
                    if (timeLabels.length > 24) {
                        const index = timeLabels.indexOf(value);
                        return index % 6 === 0 ? value : "";
                    }
                    return value;
                },
            },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            min: yMin,
            max: yMax,
            tickAmount: 5,
            labels: {
                style: { fontSize: "12px", colors: ["#6B7280"] },
                formatter: (val: number) => `${val.toFixed(0)} PH/s`,
            },
        },
    };

    if (loading) {
        return (
            <ChartPanelSkeleton
                titleWidth="w-52"
                subtitleWidth="w-72"
                chartHeight="h-[310px]"
            />
        );
    }

    if (error || allValues.length === 0) {
        return (
            <div className={cn(dashboardPanelClass, "min-h-[390px]")}>
                <div className="h-[310px] flex items-center justify-center text-gray-500 dark:text-gray-400">
                    No chart data available
                </div>
            </div>
        );
    }

    return (
        <div className={cn(dashboardPanelClass, "min-h-[390px]")}>
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Hashrate Live Chart</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Hourly hashrate performance (12 AM - 12 PM)
                </p>
            </div>
            <div className="max-w-full overflow-hidden custom-scrollbar">
                <div className="min-w-[1000px] xl:min-w-full">
                    <Chart options={options} series={series} type="line" height={310} />
                </div>
            </div>
        </div>
    );
}
