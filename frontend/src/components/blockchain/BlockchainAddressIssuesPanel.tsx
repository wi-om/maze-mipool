import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import DateTimeCell from "../../components/common/DateTimeCell";
import type { AddressIssueKind, PayoutAddressIssue } from "../../api/services/blockchainDataService";
import { toast } from "sonner";

type Props = {
    issues: PayoutAddressIssue[];
    loading?: boolean;
    showSensitiveData?: boolean;
};

const KIND_LABEL: Record<AddressIssueKind, string> = {
    dual_txid: "Dual TXID",
    paid_different_output: "Different output",
    wallet_not_on_chain: "Not on chain",
    no_blockchain_import: "Not imported",
};

function kindVariant(kind: AddressIssueKind): "destructive" | "secondary" | "outline" {
    if (kind === "paid_different_output") return "destructive";
    if (kind === "dual_txid") return "secondary";
    return "outline";
}

function truncateTxid(txid: string, head = 8, tail = 6): string {
    if (txid.length <= head + tail + 3) return txid;
    return `${txid.slice(0, head)}…${txid.slice(-tail)}`;
}

function truncateAddr(addr: string, head = 10, tail = 6): string {
    if (addr.length <= head + tail + 3) return addr;
    return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function copyText(label: string, value: string) {
    navigator.clipboard.writeText(value).then(
        () => toast.success(`${label} copied`),
        () => toast.error(`Failed to copy ${label}`),
    );
}

export default function BlockchainAddressIssuesPanel({
    issues,
    loading = false,
    showSensitiveData = true,
}: Props) {
    const [expanded, setExpanded] = useState(true);

    const byTxid = useMemo(() => {
        const map = new Map<string, PayoutAddressIssue[]>();
        for (const issue of issues) {
            const key = issue.txid;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(issue);
        }
        return map;
    }, [issues]);

    if (loading) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                Checking payout vs on-chain addresses…
            </div>
        );
    }

    if (!issues.length) {
        return null;
    }

    return (
        <div className="overflow-hidden rounded-lg border border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/40">
            <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded((v) => !v)}
            >
                <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                        <p className="font-semibold text-amber-950 dark:text-amber-50">
                            Payout address not on blockchain ({issues.length} row
                            {issues.length === 1 ? "" : "s"}, {byTxid.size} TXID
                            {byTxid.size === 1 ? "" : "s"})
                        </p>
                        <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200/90">
                            Payout wallet exists in MIPCC but is not an output of the linked transaction — or TXID
                            format prevents matching.
                        </p>
                    </div>
                </div>
                {expanded ? (
                    <ChevronDown className="h-5 w-5 shrink-0 text-amber-700" />
                ) : (
                    <ChevronRight className="h-5 w-5 shrink-0 text-amber-700" />
                )}
            </button>

            {expanded && (
                <div className="border-t border-amber-200/80 px-2 pb-2 dark:border-amber-800/80">
                    <div className="overflow-x-auto admin-scroll">
                        <table className="w-full min-w-[960px] text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-amber-900/70 dark:text-amber-200/70">
                                    <th className="px-3 py-2 font-medium">Date</th>
                                    <th className="px-3 py-2 font-medium">Account</th>
                                    <th className="px-3 py-2 font-medium">TXID</th>
                                    <th className="px-3 py-2 font-medium">Payout / wallet BTC</th>
                                    <th className="px-3 py-2 font-medium">On-chain BTC (same amt)</th>
                                    <th className="px-3 py-2 font-medium">Issue</th>
                                    <th className="px-3 py-2 font-medium">Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {issues.map((issue) => (
                                    <tr
                                        key={issue.payoutId}
                                        className="border-t border-amber-200/60 dark:border-amber-900/50"
                                    >
                                        <td className="px-3 py-2 align-top whitespace-nowrap">
                                            <DateTimeCell value={issue.payoutDate} />
                                        </td>
                                        <td className="px-3 py-2 align-top font-mono text-xs">{issue.acNo}</td>
                                        <td className="px-3 py-2 align-top">
                                            <div className="flex items-center gap-1">
                                                <span
                                                    className="font-mono text-xs break-all"
                                                    title={issue.txid}
                                                >
                                                    {issue.txid.includes(",")
                                                        ? `${truncateTxid(issue.txid.split(",")[0])} +1`
                                                        : truncateTxid(issue.txid)}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="text-amber-700/70 hover:text-amber-900"
                                                    onClick={() => copyText("TXID", issue.txid)}
                                                    aria-label="Copy TXID"
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <div className="flex items-center gap-1">
                                                <span
                                                    className="font-mono text-xs text-red-700 dark:text-red-300"
                                                    title={issue.payoutAddr}
                                                >
                                                    {truncateAddr(issue.payoutAddr)}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="text-amber-700/70 hover:text-amber-900"
                                                    onClick={() => copyText("Payout address", issue.payoutAddr)}
                                                    aria-label="Copy payout address"
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            {issue.onChainAddr ? (
                                                <div className="flex items-center gap-1">
                                                    <span
                                                        className="font-mono text-xs text-emerald-700 dark:text-emerald-300"
                                                        title={issue.onChainAddr}
                                                    >
                                                        {truncateAddr(issue.onChainAddr)}
                                                        {issue.onChainAcNo && issue.onChainAcNo !== issue.acNo ? (
                                                            <span className="ml-1 text-[10px] text-gray-500">
                                                                ({issue.onChainAcNo})
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="text-amber-700/70 hover:text-amber-900"
                                                        onClick={() => copyText("On-chain address", issue.onChainAddr!)}
                                                        aria-label="Copy on-chain address"
                                                    >
                                                        <Copy className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <Badge variant={kindVariant(issue.kind)}>{KIND_LABEL[issue.kind]}</Badge>
                                        </td>
                                        <td className="max-w-xs px-3 py-2 align-top text-xs text-gray-700 dark:text-gray-300">
                                            {issue.reason}
                                            {showSensitiveData && (
                                                <span className="mt-1 block text-gray-500">
                                                    Amount: BTC {issue.amount.toFixed(8)}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-amber-300 bg-white/80 text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-100"
                            onClick={() => {
                                const text = issues
                                    .map(
                                        (i) =>
                                            `${i.payoutDate.slice(0, 10)}\t${i.acNo}\t${i.txid}\t${i.payoutAddr}\t${i.onChainAddr ?? ""}\t${i.kind}`,
                                    )
                                    .join("\n");
                                copyText("Issue report", text);
                            }}
                        >
                            Copy report
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
