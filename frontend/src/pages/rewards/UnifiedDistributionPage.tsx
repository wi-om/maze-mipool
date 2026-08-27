import { useState, useEffect, useRef } from "react";
import { getAllRewards, getCLRewards, getCMWalletEntries, calculateDailyRewards, checkBulkDailyRewardsExist, fetchLatestUnitReward } from "../../api/services/rewardService";
import PageHeader from "../../components/layout/PageHeader";
import { pageBreadcrumbs } from "../../config/breadcrumbs";
import MetricCard from "../../components/common/MetricCard";
import { dashboardPanelClass } from "../../components/common/panelStyles";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { Calculator, Zap, Users, Building2, CheckCircle2, CircleDashed, Info, Wallet } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";

export default function UnifiedDistributionPage() {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [loading, setLoading] = useState(false);
    const [bulkState, setBulkState] = useState<{
        isOpen: boolean;
        total: number;
        current: number;
        currentDate: string;
        logs: { date: string, status: 'pending'|'success'|'error', message?: string }[];
    } | null>(null);
    const cancelRef = useRef(false);
    const [stats, setStats] = useState<{
        euTotal: number;
        clTotal: number;
        cmTotal: number;
    }>({ euTotal: 0, clTotal: 0, cmTotal: 0 });

    // Overwrite Confirmation Modal State
    const [overwriteModal, setOverwriteModal] = useState<{ isOpen: boolean; start: string; end?: string } | null>(null);

    // Missing MIPS Data Modal State
    const [missingDataModal, setMissingDataModal] = useState<{ 
        isOpen: boolean; 
        dates: string[];
        manualValues: Record<string, { income: string; hashrate: string }>;
    } | null>(null);

    const fetchData = async () => {
        try {
            const todayStr = format(new Date(), "yyyy-MM-dd");
            const dateParams = startDate
                ? { dateFrom: startDate, dateTo: endDate || startDate, summaryOnly: true as const }
                : { dateFrom: todayStr, dateTo: todayStr, summaryOnly: true as const };

            const [eu, cl, cm] = await Promise.all([
                getAllRewards({ ...dateParams, summaryOnly: true }),
                getCLRewards({ ...dateParams, summaryOnly: true }),
                getCMWalletEntries({ ...dateParams, summaryOnly: true }),
            ]);

            const totalEu = eu.pagination.totalAmount;
            const totalCl = cl.pagination.totalAmount;
            const totalCm = cm.pagination.totalAmount;

            setStats({ euTotal: totalEu, clTotal: totalCl, cmTotal: totalCm });
        } catch (error) {
            console.error("Failed to fetch distribution data", error);
        }
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    // Persistent Manual Values for Bulk Resume
    const [persistentManualValues, setPersistentManualValues] = useState<Record<string, { income: string; hashrate: string }>>({});
    
    // Memory Ref for rolling defaults (survives across loops and re-renders)
    const lastSuccessfulIncomeRef = useRef<string>("");
    const lastSuccessfulHashrateRef = useRef<string>("250");

    // Bootstrap memory from database on load
    useEffect(() => {
        const bootstrap = async () => {
            try {
                const latest = await fetchLatestUnitReward();
                if (latest && latest.RewardPerTH) {
                    lastSuccessfulIncomeRef.current = latest.RewardPerTH.toString();
                }
            } catch (e) {
                console.error("Failed to bootstrap unit reward memory:", e);
            }
        };
        bootstrap();
    }, []);

    const initiateBulkProcessing = async (startString: string, endString?: string, manualValues?: Record<string, { income: string; hashrate: string }>, resumeFromIndex: number = 0) => {
        try {
            if (manualValues) {
                setPersistentManualValues(prev => ({ ...prev, ...manualValues }));
            }
            
            const datesToProcess: string[] = [];
            let tempDate = parseISO(startString);
            const end = parseISO(endString || startString);
            
            while (tempDate <= end) {
                datesToProcess.push(format(tempDate, "yyyy-MM-dd"));
                tempDate = addDays(tempDate, 1);
            }

            if (resumeFromIndex === 0) {
                setBulkState({
                    isOpen: true,
                    total: datesToProcess.length,
                    current: 0,
                    currentDate: datesToProcess[0],
                    logs: datesToProcess.map(d => ({ date: d, status: 'pending' }))
                });
            }

            cancelRef.current = false;
            let errorsCount = 0;
            let consecutiveErrors = 0;
            


            for (let i = resumeFromIndex; i < datesToProcess.length; i++) {
                if (cancelRef.current) {
                    toast.info("Bulk sequence manually aborted.");
                    break;
                }
                
                const dStr = datesToProcess[i];
                setBulkState(prev => prev ? ({ ...prev, current: i + 1, currentDate: dStr }) : null);

                // Use values from manualValues argument if provided OR persistent state
                const manualEntry = manualValues?.[dStr] || persistentManualValues[dStr];
                const manualData = manualEntry ? {
                    income: parseFloat(manualEntry.income),
                    hashrate: parseFloat(manualEntry.hashrate)
                } : undefined;

                try {
                    const result = await calculateDailyRewards({ date: dStr, manualData });
                    consecutiveErrors = 0;
                    
                    // Update our rolling memory
                    if (result?.dailyReward) {
                        const newIncome = result.dailyReward.income?.toFixed(8) || lastSuccessfulIncomeRef.current;
                        const newHashrate = result.dailyReward.totalHashrate ? (Number(result.dailyReward.totalHashrate) / 1e12).toFixed(3) : lastSuccessfulHashrateRef.current;
                        lastSuccessfulIncomeRef.current = newIncome;
                        lastSuccessfulHashrateRef.current = newHashrate;
                    }

                    setBulkState(prev => {
                        if (!prev) return prev;
                        const newLogs = [...prev.logs];
                        newLogs[i] = { date: dStr, status: 'success' };
                        return { ...prev, logs: newLogs };
                    });
                } catch (e: any) {
                    errorsCount++;
                    consecutiveErrors++;
                    const errorMsg = e.response?.data?.error || e.message;
                    
                    setBulkState(prev => {
                        if (!prev) return prev;
                        const newLogs = [...prev.logs];
                        newLogs[i] = { 
                            date: dStr, 
                            status: 'error', 
                            message: errorMsg,
                            manualIncome: lastSuccessfulIncomeRef.current,
                            manualHashrate: lastSuccessfulHashrateRef.current
                        } as any;
                        return { ...prev, logs: newLogs };
                    });
                    
                    if (errorMsg.includes('No external reward data')) {
                        toast.warning(`Paused: Missing data for ${dStr}. Please enter manually.`);
                        return; // Stop here and wait for manual resolution
                    }

                    if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED') || consecutiveErrors >= 3) {
                        toast.error(`Process auto-terminated. Disconnected from DB or critical failure.`);
                        break;
                    }
                }
            }
            
            setBulkState(prev => prev ? ({ ...prev, current: datesToProcess.length, currentDate: "Completed" }) : null);

            if (errorsCount === 0 && !cancelRef.current) {
                toast.success("Unified rewards calculated for date range successfully!");
            } else if (!cancelRef.current) {
                toast.warning(`Bulk run finished with ${errorsCount} error(s).`);
            }
            
            await fetchData();
        } catch (error: any) {
             toast.error(error.message || "Unified calculation failed");
        }
    };

    const handleCalculateAll = async () => {
        setLoading(true);
        try {
            if (startDate) {
                // 1. Overwrite check
                toast.loading("Verifying date range...", { id: 'preflight' });
                const check = await checkBulkDailyRewardsExist({ startDate, endDate: endDate || startDate });
                toast.dismiss('preflight');
                
                if (check.exists) {
                    setOverwriteModal({ isOpen: true, start: startDate, end: endDate });
                    setLoading(false);
                    return; 
                }

                // 2. MIPS Data check
                await performMipsCheck(startDate, endDate);

            } else {
                await calculateDailyRewards();
                toast.success("Unified rewards calculated successfully!");
                
                await fetchData();
            }
        } catch (error: any) {
            toast.dismiss('preflight');
            toast.error(error.response?.data?.error || error.message || "Unified calculation failed");
        } finally {
            setLoading(false);
        }
    };

    const performMipsCheck = async (start: string, end?: string) => {
        // We now skip the pre-flight modal and let the inline error box handle missing data
        // as requested by the user.
        await initiateBulkProcessing(start, end);
    };

    const statsPeriodLabel = startDate
        ? endDate && endDate !== startDate
            ? `${startDate} to ${endDate}`
            : startDate
        : "Today";

    return (
        <div className="space-y-4">
            <PageHeader title="Live Distribution" breadcrumbs={pageBreadcrumbs.liveDistribution} />

            <div className={dashboardPanelClass}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-3">
                        <Zap className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Unified reward distribution</p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Execute the master distribution pot. EU accounts are paid first; the remaining balance
                                is allocated to parent CL agencies.
                            </p>
                            <p className="mt-2 text-xs text-gray-400">
                                Summary period: <span className="font-medium text-gray-600 dark:text-gray-300">{statsPeriodLabel}</span>
                                {!startDate && " · Leave dates empty to run today only"}
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                        <span className="text-sm text-gray-400">to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            min={startDate}
                            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                        <Button
                            onClick={handleCalculateAll}
                            disabled={loading || (!!startDate && !endDate)}
                            className="h-9 bg-brand-500 text-white shadow-none hover:bg-brand-600 disabled:opacity-50"
                        >
                            <Calculator className="h-4 w-4 mr-2" />
                            {loading ? "Running…" : startDate && endDate ? "Run bulk" : "Run distribution"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricCard
                    title="EU Reward"
                    value={`${stats.euTotal.toFixed(8)} BTC`}
                    icon={<Users className="h-5 w-5" />}
                    iconColor="text-brand-600"
                />
                <MetricCard
                    title="CL Reward"
                    value={`${stats.clTotal.toFixed(8)} BTC`}
                    icon={<Building2 className="h-5 w-5" />}
                    iconColor="text-emerald-600"
                />
                <MetricCard
                    title="CM Wallet"
                    value={`${stats.cmTotal.toFixed(8)} BTC`}
                    icon={<Wallet className="h-5 w-5" />}
                    iconColor="text-purple-600"
                />
            </div>

            {/* Bulk Calculation Progress Modal */}
            {bulkState && bulkState.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className={`${dashboardPanelClass} flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden p-0`}>
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                                <Calculator className={`h-5 w-5 text-brand-600 ${bulkState.currentDate !== "Completed" ? "animate-pulse" : ""}`} />
                                {bulkState.currentDate === "Completed" ? "Calculation complete" : "Bulk processing"}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                                {bulkState.current} of {bulkState.total} days completed
                            </p>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                    className="h-full rounded-full bg-brand-500 transition-all duration-300"
                                    style={{ width: `${(bulkState.current / bulkState.total) * 100}%` }}
                                />
                            </div>
                        </div>

                        <div className="max-h-80 flex-1 overflow-y-auto admin-scroll divide-y divide-gray-100 dark:divide-gray-800">
                                {bulkState.logs.map((log, idx) => (
                                    <div key={idx} className={`p-4 transition-colors ${log.status === 'pending' ? 'opacity-50' : ''} ${log.status === 'error' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                                        <div className="flex items-center gap-3">
                                            {log.status === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                                            {log.status === 'pending' && <CircleDashed className={`w-5 h-5 text-gray-400 shrink-0 ${bulkState.currentDate === log.date ? 'animate-spin text-brand-500' : ''}`} />}
                                            {log.status === 'error' && <CircleDashed className="w-5 h-5 text-red-500 shrink-0" />}
                                            
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                    {log.date}
                                                </p>
                                                {log.status === 'error' && (
                                                    <p className="text-xs text-red-600 dark:text-red-400 truncate mt-0.5">
                                                        {log.message || "Calculation failed"}
                                                    </p>
                                                )}
                                                {log.status === 'success' && (
                                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                                                        Generated CMWallet & EU/CL ledgers
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Inline Manual Input for Errors */}
                                        {log.status === 'error' && log.message?.includes('No external reward data') && (
                                            <div className="mt-4 ml-8 space-y-3 rounded-md border border-red-100 bg-white p-4 dark:border-red-900/30 dark:bg-gray-800">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Unit reward (per 250 TH)</label>
                                                        <input
                                                            type="number"
                                                            placeholder="0.0001..."
                                                            defaultValue={(log as any).manualIncome}
                                                            className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                (log as any).manualIncome = val;
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Sampling size (TH)</label>
                                                        <input
                                                            type="number"
                                                            placeholder="250"
                                                            defaultValue={(log as any).manualHashrate || "250"}
                                                            className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                (log as any).manualHashrate = val;
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    className="h-9 w-full bg-brand-500 text-white shadow-none hover:bg-brand-600"
                                                    onClick={async () => {
                                                        const mIncome = (log as any).manualIncome;
                                                        const mHashrate = (log as any).manualHashrate || "250";
                                                        if (!mIncome) {
                                                            toast.error("Please provide a Unit Reward value");
                                                            return;
                                                        }
                                                        
                                                        toast.loading(`Processing ${log.date} manually...`, { id: 'manual-retry' });
                                                        try {
                                                            await calculateDailyRewards({ 
                                                                date: log.date, 
                                                                manualData: { 
                                                                    income: parseFloat(mIncome), 
                                                                    hashrate: parseFloat(mHashrate) 
                                                                } 
                                                            });
                                                            setBulkState(prev => {
                                                                if (!prev) return prev;
                                                                const newLogs = [...prev.logs];
                                                                newLogs[idx] = { ...log, status: 'success' };
                                                                return { ...prev, logs: newLogs };
                                                            });
                                                            
                                                            setPersistentManualValues(prev => ({
                                                                ...prev,
                                                                [log.date]: { income: mIncome, hashrate: mHashrate }
                                                            }));

                                                            toast.success(`Processed ${log.date} successfully. Resuming sequence...`, { id: 'manual-retry' });
                                                            
                                                            // Resume the sequence for the rest
                                                            setTimeout(() => {
                                                                initiateBulkProcessing(startDate, endDate, {}, idx + 1);
                                                            }, 1000);
                                                            
                                                        } catch (err: any) {
                                                            toast.error(err.message, { id: 'manual-retry' });
                                                        }
                                                    }}
                                                >
                                                    Process & Continue
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>

                        {bulkState.currentDate === "Completed" ? (
                            <div className="border-t border-gray-200 px-6 py-4 text-right dark:border-gray-700">
                                <Button
                                    onClick={() => setBulkState(null)}
                                    className="h-9 bg-brand-500 text-white shadow-none hover:bg-brand-600"
                                >
                                    Close
                                </Button>
                            </div>
                        ) : (
                            <div className="border-t border-gray-200 px-6 py-4 text-right dark:border-gray-700">
                                <Button
                                    onClick={() => { cancelRef.current = true; }}
                                    variant="destructive"
                                    className="h-9 shadow-none"
                                >
                                    Stop processing
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Overwrite Confirmation Modal */}
            {overwriteModal && overwriteModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className={`${dashboardPanelClass} w-full max-w-md p-0`}>
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Overwrite existing data?</h3>
                        </div>
                        <div className="px-6 py-4">
                            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                                Financial reward entries already exist for one or more dates in your selected range (
                                {overwriteModal.start} to {overwriteModal.end || overwriteModal.start}). Running this
                                will clear existing unlocked entries and recalculate them.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                            <Button variant="outline" className="h-9 shadow-none" onClick={() => setOverwriteModal(null)}>
                                Cancel
                            </Button>
                            <Button
                                className="h-9 bg-brand-500 text-white shadow-none hover:bg-brand-600"
                                onClick={() => {
                                    const { start, end } = overwriteModal;
                                    setOverwriteModal(null);
                                    performMipsCheck(start, end || start);
                                }}
                            >
                                Overwrite & recalculate
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Missing MIPS Data Modal */}
            {missingDataModal && missingDataModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className={`${dashboardPanelClass} flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden p-0`}>
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                                <Info className="h-5 w-5 text-amber-600" />
                                Missing MIPS records
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                                The following dates have no external reward data. Provide manual values to continue.
                            </p>
                        </div>

                        <div className="max-h-[50vh] flex-1 overflow-y-auto admin-scroll">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800/80">
                                    <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Income (BTC)</th>
                                        <th className="px-4 py-3">Total hashrate (TH)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {missingDataModal.dates.map((date) => (
                                        <tr key={date} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{date}</td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    placeholder="0.00000000"
                                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
                                                    value={missingDataModal.manualValues[date]?.income || ""}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setMissingDataModal(prev => prev ? ({
                                                            ...prev,
                                                            manualValues: {
                                                                ...prev.manualValues,
                                                                [date]: { ...prev.manualValues[date], income: val }
                                                            }
                                                        }) : null);
                                                    }}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    placeholder="0.000"
                                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
                                                    value={missingDataModal.manualValues[date]?.hashrate || ""}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setMissingDataModal(prev => prev ? ({
                                                            ...prev,
                                                            manualValues: {
                                                                ...prev.manualValues,
                                                                [date]: { ...prev.manualValues[date], hashrate: val }
                                                            }
                                                        }) : null);
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                            <Button variant="outline" className="h-9 shadow-none" onClick={() => setMissingDataModal(null)}>
                                Cancel
                            </Button>
                            <Button
                                className="h-9 bg-brand-500 text-white shadow-none hover:bg-brand-600 disabled:opacity-50"
                                disabled={!Object.values(missingDataModal.manualValues).every(v => v.income && v.hashrate)}
                                onClick={() => {
                                    const values = { ...missingDataModal.manualValues };
                                    setMissingDataModal(null);
                                    initiateBulkProcessing(startDate, endDate, values);
                                }}
                            >
                                Proceed with manual values
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
