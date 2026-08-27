import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import type { WalletLedger, WalletLedgerEntry } from "../../api/services/walletService";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    ledger: WalletLedger | null;
    loading: boolean;
    showSensitiveData: boolean;
};

function fmtBtc(value: number, show: boolean) {
    if (!show) return "••••••";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(8)} BTC`;
}

export default function WalletLedgerDialog({
    open,
    onOpenChange,
    ledger,
    loading,
    showSensitiveData,
}: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full max-w-[min(96vw,1100px)] max-h-[85vh] overflow-hidden flex flex-col rounded-md border border-gray-200 p-0 shadow-none dark:border-gray-700">
                <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <DialogHeader className="mb-0">
                        <DialogTitle>Wallet distribution ledger</DialogTitle>
                        <DialogDescription>
                            EU wallet credits and payout debits from WalletTxn ledger.
                        </DialogDescription>
                    </DialogHeader>
                    {ledger && (
                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">AcNo</p>
                                <p className="font-mono font-medium">{ledger.acNo}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Current balance</p>
                                <p className="font-semibold text-brand-600">
                                    {showSensitiveData ? `${ledger.currentBalance.toFixed(8)} BTC` : "••••••"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Total credited</p>
                                <p className="font-medium text-emerald-600">
                                    {showSensitiveData ? `${ledger.totalCredited.toFixed(8)} BTC` : "••••••"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Asset</p>
                                <p className="font-medium">Bitcoin (BTC)</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-auto px-6 pb-6">
                    {loading ? (
                        <p className="py-12 text-center text-muted-foreground">Loading ledger…</p>
                    ) : !ledger?.entries.length ? (
                        <p className="py-12 text-center text-muted-foreground">No distribution history yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableCell className="font-medium">Date</TableCell>
                                    <TableCell className="font-medium">Type</TableCell>
                                    <TableCell className="font-medium">Source</TableCell>
                                    <TableCell className="font-medium">Destination</TableCell>
                                    <TableCell className="font-medium">Reference</TableCell>
                                    <TableCell className="font-medium text-right">Amount</TableCell>
                                    <TableCell className="font-medium text-right">Balance</TableCell>
                                    <TableCell className="font-medium">Txid</TableCell>
                                    <TableCell className="font-medium">Remark</TableCell>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ledger.entries.map((entry: WalletLedgerEntry, idx: number) => (
                                    <TableRow key={`${entry.date}-${entry.type}-${idx}`}>
                                        <TableCell className="whitespace-nowrap">{entry.date}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={entry.type === "reward" ? "default" : "secondary"}
                                                className={
                                                    entry.type === "reward"
                                                        ? "bg-emerald-600 hover:bg-emerald-600"
                                                        : "bg-rose-600 hover:bg-rose-600"
                                                }
                                            >
                                                {entry.type === "reward" ? "CREDIT" : "DEBIT"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{entry.source ?? "—"}</TableCell>
                                        <TableCell className="font-mono text-xs max-w-[120px] truncate" title={entry.destination}>
                                            {entry.destination ?? "—"}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{entry.reference ?? "—"}</TableCell>
                                        <TableCell
                                            className={`text-right font-mono font-semibold ${
                                                entry.amount >= 0 ? "text-emerald-600" : "text-rose-600"
                                            }`}
                                        >
                                            {fmtBtc(entry.amount, showSensitiveData)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {showSensitiveData
                                                ? `${entry.runningBalance.toFixed(8)} BTC`
                                                : "••••••"}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs max-w-[100px] truncate" title={entry.txid ?? ""}>
                                            {entry.txid ?? "—"}
                                        </TableCell>
                                        <TableCell className="text-sm">{entry.remark ?? entry.description}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
