import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { completePayout, type PreviewRow } from "../../api/services/payoutService";
import { DataTable, type Column } from "../../components/common/DataTable";
import { dashboardPanelClass } from "../../components/common/panelStyles";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import { useNavigationLock } from "../../context/NavigationLockContext";
import type { PayoutConfirmState } from "./payoutConfirmState";

type Props = {
    state: PayoutConfirmState;
    onCommitted?: () => void;
};

const LOCK_REASON =
    "This payout has a txid. Click Confirm & Commit to finish — you cannot leave until then.";

const breakdownColumns: Column<PreviewRow>[] = [
    {
        header: "AcNo",
        accessor: (item) => <span className="font-semibold text-gray-900 dark:text-white">{item.acNo}</span>,
        sortable: true,
        sortKey: "acNo",
    },
    {
        header: "Contract",
        accessor: (item) => (
            <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{item.mipContractNo}</span>
        ),
        sortable: true,
        sortKey: "mipContractNo",
    },
    {
        header: "BTC Address",
        accessor: (item) => (
            <span className="max-w-[320px] break-all font-mono text-xs text-gray-700 dark:text-gray-300">
                {item.toAddr}
            </span>
        ),
        sortable: true,
        sortKey: "toAddr",
    },
    {
        header: "Amount (BTC)",
        accessor: (item) => (
            <span className="font-semibold tabular-nums text-brand-600">{item.amount.toFixed(8)}</span>
        ),
        sortable: true,
        sortKey: "amount",
        searchValue: (item) => item.amount.toFixed(8),
    },
];

export default function ConfirmPayoutPage({ state, onCommitted }: Props) {
    const navigate = useNavigate();
    const { setNavigationLocked } = useNavigationLock();
    const [committing, setCommitting] = useState(false);

    const { acNos, txid, paidThroughDate, previewRows } = state;
    const payableTotal = previewRows.reduce((s, r) => s + r.amount, 0);

    useEffect(() => {
        setNavigationLocked(true, LOCK_REASON);
        return () => setNavigationLocked(false);
    }, [setNavigationLocked]);

    const handleCommit = async () => {
        setCommitting(true);
        try {
            const result = await completePayout({ acNos, txid, paidThroughDate });
            if (result.errors?.length) {
                result.errors.forEach((e) => toast.error(`${e.acNo}: ${e.error}`));
            }
            if (result.created?.length) {
                toast.success(`Created ${result.created.length} payout row(s)`);
                onCommitted?.();
                setNavigationLocked(false);
                navigate("/payouts");
            } else if (!result.errors?.length) {
                toast.warning("No payouts were created");
            }
        } catch (err: any) {
            console.error(err);
            toast.error(err?.response?.data?.error || "Failed to commit payout");
        } finally {
            setCommitting(false);
        }
    };

    const tableRows = useMemo(
        () => previewRows.map((row, i) => ({ ...row, _rowKey: `${row.acNo}-${row.mipContractNo}-${i}` })),
        [previewRows],
    );

    return (
        <div className="relative space-y-4">
            {committing && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-950/55 backdrop-blur-sm"
                    role="alertdialog"
                    aria-busy="true"
                    aria-live="assertive"
                    aria-label="Committing payout"
                >
                    <div className="mx-4 w-full max-w-sm rounded-xl border border-white/10 bg-white p-8 text-center shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/15">
                            <Loader2 className="h-7 w-7 animate-spin text-brand-600" aria-hidden />
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">Committing payout…</p>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Creating on-chain payout records. Please keep this tab open.
                        </p>
                        <p className="mt-4 truncate font-mono text-[11px] text-gray-400" title={txid}>
                            {txid.slice(0, 18)}…{txid.slice(-12)}
                        </p>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-100">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                    <p>
                        Screen locked — sidebar and navigation are disabled until you{" "}
                        <span className="font-semibold">Confirm &amp; Commit</span>.
                    </p>
                </div>
                <Button
                    onClick={handleCommit}
                    disabled={committing || !previewRows.length}
                    className="h-9 bg-brand-500 text-white shadow-none hover:bg-brand-600 disabled:opacity-50"
                >
                    {committing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Committing…
                        </>
                    ) : (
                        "Confirm & Commit"
                    )}
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={`${dashboardPanelClass} py-3`}>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Pay through date</p>
                    <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">{paidThroughDate}</p>
                </div>
                <div className={`${dashboardPanelClass} py-3`}>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Transaction ID</p>
                    <p className="mt-1.5 overflow-x-auto font-mono text-sm font-semibold tracking-tight whitespace-nowrap text-gray-900 admin-scroll dark:text-white">
                        {txid}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={dashboardPanelClass}>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Payable total</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-brand-600">
                        {payableTotal.toFixed(8)} BTC
                    </p>
                </div>
                <div className={dashboardPanelClass}>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Contracts to pay</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                        {previewRows.length}
                    </p>
                </div>
            </div>

            <DataTable
                data={tableRows}
                columns={breakdownColumns}
                defaultPageSize={50}
                emptyMessage="No contracts in this payout"
                searchPlaceholder="Paste AcNo, contract, BTC address, or amount to validate…"
                searchKeys={["acNo", "mipContractNo", "toAddr", "amount", "parentClientid"]}
                searchContainerClassName="relative w-full max-w-[400px] sm:w-[400px]"
                searchInputClassName="font-mono text-xs tracking-tight"
                leftActions={
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                            <CheckCircle2 className="h-4 w-4 text-brand-600" />
                            Per-contract breakdown
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Paste a value to find and validate a row. No time limit before commit.
                        </p>
                    </div>
                }
            />
        </div>
    );
}

export function usePayoutConfirmState(): PayoutConfirmState | null {
    const location = useLocation();
    const state = location.state as PayoutConfirmState | null;
    if (!state?.acNos?.length || !state.txid || !state.paidThroughDate || !state.previewRows?.length) {
        return null;
    }
    return state;
}
