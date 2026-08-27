import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    getPayoutPending,
    previewPayout,
    type PayoutClient,
    type PayoutSummary,
} from "../../api/services/payoutService";
import { DataTable, type Column } from "../../components/common/DataTable";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { buildPayoutClipboardText, getCopyablePayoutClients } from "../../utils/payoutClipboard";
import { PAYOUT_TXID_LENGTH, validatePayoutTxid } from "../../utils/payoutTxid";
import { cn } from "@/lib/utils";
import type { PayoutConfirmState } from "./payoutConfirmState";

type AddPayoutLocationState = {
    selectedAcNos?: string[];
    txid?: string;
    paidThroughDate?: string;
};

type AddPayoutPageProps = {
    onSummaryChange?: (summary: PayoutSummary) => void;
    onSummaryLoadingChange?: (loading: boolean) => void;
};

export default function AddPayoutPage({ onSummaryChange, onSummaryLoadingChange }: AddPayoutPageProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [clients, setClients] = useState<PayoutClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [txidModalOpen, setTxidModalOpen] = useState(false);
    const [txid, setTxid] = useState("");
    const [previewLoading, setPreviewLoading] = useState(false);
    const [txidError, setTxidError] = useState("");
    const [paidThroughDate, setPaidThroughDate] = useState("");
    const [maxPaidThroughDate, setMaxPaidThroughDate] = useState("");

    const loadClients = async (payThrough?: string) => {
        try {
            setLoading(true);
            onSummaryLoadingChange?.(true);
            const { summary, clients: data } = await getPayoutPending(payThrough);
            onSummaryChange?.(summary);
            const date = payThrough ?? summary.paidThroughDate;
            setPaidThroughDate(date);
            setMaxPaidThroughDate(summary.maxPaidThroughDate);
            setClients(data);
            const restore = (location.state as AddPayoutLocationState | null)?.selectedAcNos;
            if (restore?.length) {
                const valid = new Set(data.map((r) => r.acNo));
                setSelected(new Set(restore.filter((acNo) => valid.has(acNo))));
            } else {
                setSelected(new Set(data.map((r) => r.acNo)));
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to load payout clients");
        } finally {
            setLoading(false);
            onSummaryLoadingChange?.(false);
        }
    };

    useEffect(() => {
        const restored = location.state as AddPayoutLocationState | null;
        loadClients(restored?.paidThroughDate);
    }, []);

    useEffect(() => {
        const restoredTxid = (location.state as AddPayoutLocationState | null)?.txid;
        if (restoredTxid) {
            setTxid(restoredTxid);
        }
    }, [location.state]);

    const allSelected = clients.length > 0 && selected.size === clients.length;

    const toggleAll = () => {
        if (allSelected) {
            setSelected(new Set());
        } else {
            setSelected(new Set(clients.map((r) => r.acNo)));
        }
    };

    const toggleOne = (acNo: string) => {
        const next = new Set(selected);
        if (next.has(acNo)) next.delete(acNo);
        else next.add(acNo);
        setSelected(next);
    };

    const selectedClients = useMemo(
        () => clients.filter((r) => selected.has(r.acNo)),
        [clients, selected],
    );

    const selectedTotal = selectedClients.reduce((s, r) => s + r.payableBalance, 0);
    const copyableClients = useMemo(() => getCopyablePayoutClients(selectedClients), [selectedClients]);
    const clipboardText = useMemo(() => buildPayoutClipboardText(selectedClients), [selectedClients]);
    const skippedCopyCount = selectedClients.length - copyableClients.length;
    const txidIsValid = useMemo(() => validatePayoutTxid(txid).ok, [txid]);
    const txidProgress = Math.min(100, (txid.length / PAYOUT_TXID_LENGTH) * 100);

    const handleOpenCopyModal = () => {
        if (!selected.size) {
            toast.error("Select at least one client");
            return;
        }
        if (!copyableClients.length) {
            toast.error("No selected clients have an active BTC address to copy");
            return;
        }
        setCopyModalOpen(true);
    };

    const handleCopyClipboard = () => {
        navigator.clipboard.writeText(clipboardText).then(
            () => toast.success("Payout list copied to clipboard"),
            () => toast.error("Failed to copy to clipboard"),
        );
    };

    const handleCopyModalContinue = () => {
        setCopyModalOpen(false);
        setTxid("");
        setTxidError("");
        setTxidModalOpen(true);
    };

    const handleTxidSubmit = async () => {
        const txidResult = validatePayoutTxid(txid);
        if (!txidResult.ok) {
            setTxidError(txidResult.error);
            return;
        }
        setTxidError("");
        setTxid(txidResult.value);
        setPreviewLoading(true);
        try {
            const rows = await previewPayout([...selected], paidThroughDate);
            setTxidModalOpen(false);
            const confirmState: PayoutConfirmState = {
                acNos: [...selected],
                txid: txidResult.value,
                paidThroughDate,
                previewRows: rows,
            };
            navigate("/payouts/add/confirm", { state: confirmState });
        } catch (err) {
            console.error(err);
            toast.error("Failed to load payout preview");
        } finally {
            setPreviewLoading(false);
        }
    };

    const columns: Column<PayoutClient>[] = [
        {
            header: (
                <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                />
            ),
            accessor: (item) => (
                <input
                    type="checkbox"
                    checked={selected.has(item.acNo)}
                    onChange={() => toggleOne(item.acNo)}
                    aria-label={`Select ${item.acNo}`}
                />
            ),
        },
        {
            header: "Client ID",
            accessor: (item) => item.parentClientid || "-",
            sortable: true,
            sortKey: "parentClientid",
        },
        { header: "AcNo", accessor: "acNo", sortable: true },
        {
            header: "BTC Address",
            accessor: (item) => {
                if (!item.hasActiveWallet) {
                    return (
                        <span className="text-amber-600 flex items-center gap-1 text-xs">
                            <AlertTriangle className="h-3 w-3" />
                            {item.btcAddr === "HOLD" ? "HOLD" : "No active wallet"}
                        </span>
                    );
                }
                return <span className="font-mono text-xs">{item.btcAddr}</span>;
            },
            sortable: true,
            sortKey: "btcAddr",
            searchValue: (item) => item.btcAddr || (item.hasActiveWallet ? "" : "no wallet hold"),
        },
        {
            header: "Payable",
            accessor: (item) => (
                <span className="font-semibold text-brand-600">{Number(item.payableBalance).toFixed(8)} BTC</span>
            ),
            sortable: true,
            sortKey: "payableBalance",
        },
        {
            header: "Days Pending",
            accessor: (item) => item.daysPending,
            sortable: true,
            sortKey: "daysPending",
        },
        {
            header: "Hashrate",
            accessor: (item) =>
                `${Number(item.totalHashrateTH || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} TH/s`,
            sortable: true,
            sortKey: "totalHashrateTH",
        },
        {
            header: "Warnings",
            accessor: (item) => (
                <div className="flex min-h-14 w-full flex-col justify-center gap-1">
                    {item.balanceDrift && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                            Balance drift
                        </Badge>
                    )}
                    {!item.hasActiveWallet && (
                        <Badge variant="outline" className="text-red-600 border-red-300 text-xs">
                            Wallet issue
                        </Badge>
                    )}
                </div>
            ),
            searchValue: (item) => {
                const parts: string[] = [];
                if (item.balanceDrift) parts.push("balance drift");
                if (!item.hasActiveWallet) parts.push("wallet issue");
                return parts.join(" ");
            },
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1.5">
                    <label htmlFor="paid-through-date" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Pay rewards through (Dubai work date)
                    </label>
                    <Input
                        id="paid-through-date"
                        type="date"
                        value={paidThroughDate}
                        max={maxPaidThroughDate}
                        onChange={(e) => {
                            const next = e.target.value;
                            setPaidThroughDate(next);
                            loadClients(next);
                        }}
                        onClick={(e) => {
                            const el = e.currentTarget;
                            try {
                                el.showPicker?.();
                            } catch {
                                /* browser may block if already open or unsupported */
                            }
                        }}
                        className="h-9 w-[200px] cursor-pointer shadow-none"
                        disabled={loading && !paidThroughDate}
                        aria-busy={loading && !paidThroughDate}
                    />
                    <p className="min-h-4 text-xs text-gray-500">
                        {maxPaidThroughDate
                            ? `Max ${maxPaidThroughDate} — today\u2019s work pays tomorrow`
                            : "\u00A0"}
                    </p>
                </div>
                <Button
                    onClick={handleOpenCopyModal}
                    disabled={!selected.size || loading}
                    className="h-9 min-w-[9.5rem] bg-brand-500 tabular-nums hover:bg-brand-600 text-white shadow-none"
                >
                    Complete ({loading ? "…" : selected.size})
                </Button>
            </div>

            <DataTable
                data={clients}
                columns={columns}
                loading={loading}
                emptyMessage="No clients with pending balance"
                searchPlaceholder="Search client ID, account no, BTC address, balance…"
                searchKeys={["parentClientid", "acNo", "btcAddr", "payableBalance", "daysPending", "totalHashrateTH"]}
            />

            <Dialog open={copyModalOpen} onOpenChange={setCopyModalOpen}>
                <DialogContent className="w-full max-w-[min(96vw,720px)] rounded-md border border-gray-200 p-0 shadow-none dark:border-gray-700 overflow-hidden">
                    <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                        <DialogHeader className="mb-0">
                            <DialogTitle>Copy payout list</DialogTitle>
                            <DialogDescription>
                                Copy each line below into your wallet software ({copyableClients.length} recipient
                                {copyableClients.length === 1 ? "" : "s"},{" "}
                                <span className="font-semibold text-gray-700 dark:text-gray-300">
                                    {selectedTotal.toFixed(8)} BTC
                                </span>
                                ). Format: address, amount — one line per recipient.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="space-y-3 px-6 py-4">
                        {skippedCopyCount > 0 && (
                            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                {skippedCopyCount} selected client{skippedCopyCount === 1 ? "" : "s"} skipped (no active
                                wallet).
                            </p>
                        )}
                        <div className="relative">
                            <pre className="max-h-[min(50vh,360px)] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                                {clipboardText}
                            </pre>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="absolute right-2 top-2 h-8 gap-1.5 bg-white shadow-none dark:bg-gray-800"
                                onClick={handleCopyClipboard}
                            >
                                <Copy className="h-3.5 w-3.5" />
                                Copy all
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/30">
                        <Button variant="outline" onClick={() => setCopyModalOpen(false)} className="h-9 shadow-none">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCopyModalContinue}
                            className="h-9 bg-brand-500 text-white shadow-none hover:bg-brand-600"
                        >
                            Continue to transaction ID
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={txidModalOpen}
                onOpenChange={(open) => {
                    setTxidModalOpen(open);
                    if (!open) setTxidError("");
                }}
            >
                <DialogContent className="w-full max-w-[min(96vw,720px)] rounded-md border border-gray-200 p-0 shadow-none dark:border-gray-700 overflow-hidden">
                    <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                        <DialogHeader className="mb-0">
                            <DialogTitle>Enter Transaction ID</DialogTitle>
                            <DialogDescription>
                                Provide the on-chain txid for this batch payout ({selected.size} client(s),{" "}
                                <span className="font-semibold text-gray-700 dark:text-gray-300">
                                    {selectedTotal.toFixed(8)} BTC
                                </span>{" "}
                                payable through {paidThroughDate}).
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="space-y-3 px-6 py-4">
                        <Input
                            placeholder="Enter transaction ID"
                            value={txid}
                            maxLength={PAYOUT_TXID_LENGTH}
                            onChange={(e) => {
                                setTxid(e.target.value.replace(/[^a-zA-Z0-9]/g, ""));
                                if (txidError) setTxidError("");
                            }}
                            className={cn(
                                "w-full font-mono text-sm font-semibold tracking-tight",
                                txidError && "border-red-500 focus-visible:ring-red-500/30",
                                txidIsValid && "border-emerald-500 focus-visible:ring-emerald-500/30",
                            )}
                            aria-invalid={Boolean(txidError)}
                            aria-describedby="txid-validation"
                        />
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-3">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-200",
                                            txidIsValid ? "bg-emerald-500" : "bg-brand-500",
                                        )}
                                        style={{ width: `${txidProgress}%` }}
                                    />
                                </div>
                                <span
                                    className={cn(
                                        "shrink-0 text-sm font-bold tabular-nums",
                                        txidIsValid ? "text-emerald-600" : "text-gray-700 dark:text-gray-300",
                                    )}
                                >
                                    {txid.length}/{PAYOUT_TXID_LENGTH}
                                </span>
                            </div>
                            <div id="txid-validation" className="flex min-h-5 items-center justify-end">
                                {txidError ? (
                                    <p className="text-xs font-medium text-red-600">{txidError}</p>
                                ) : txidIsValid ? (
                                    <p className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Valid transaction ID
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-500">Enter all 64 characters</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/30">
                        <Button variant="outline" onClick={() => setTxidModalOpen(false)} className="h-9 shadow-none">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleTxidSubmit}
                            disabled={previewLoading || !txidIsValid}
                            className="h-9 bg-brand-500 text-white shadow-none hover:bg-brand-600 disabled:opacity-50"
                        >
                            {previewLoading ? "Loading preview…" : "Continue"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
