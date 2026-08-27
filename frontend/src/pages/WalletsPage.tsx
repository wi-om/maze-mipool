import { useEffect, useMemo, useState } from "react";
import {
    getEuWallets,
    getWalletLedger,
    type EuWallet,
    type WalletLedger,
} from "../api/services/walletService";
import { DataTable, type Column } from "../components/common/DataTable";
import MetricCard from "../components/common/MetricCard";
import PageHeader from "../components/layout/PageHeader";
import WalletLedgerDialog from "../components/wallets/WalletLedgerDialog";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Wallet, Eye, EyeOff, AlertTriangle, BookOpen } from "lucide-react";

export default function WalletsPage() {
    const [wallets, setWallets] = useState<EuWallet[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSensitiveData, setShowSensitiveData] = useState(true);
    const [ledgerOpen, setLedgerOpen] = useState(false);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [ledger, setLedger] = useState<WalletLedger | null>(null);
    const [selectedWallet, setSelectedWallet] = useState<EuWallet | null>(null);

    useEffect(() => {
        const fetchWallets = async () => {
            try {
                const data = await getEuWallets();
                setWallets(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("Failed to fetch EU wallets", error);
            } finally {
                setLoading(false);
            }
        };
        fetchWallets();
    }, []);

    const openLedger = async (wallet: EuWallet) => {
        if (!wallet.parentClientid) return;
        setSelectedWallet(wallet);
        setLedgerOpen(true);
        setLedgerLoading(true);
        setLedger(null);
        try {
            const data = await getWalletLedger(wallet.parentClientid);
            setLedger(data);
        } catch (error) {
            console.error("Failed to fetch wallet ledger", error);
        } finally {
            setLedgerLoading(false);
        }
    };

    const totalBalance = useMemo(
        () => wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0),
        [wallets],
    );
    const withWallet = wallets.filter((w) => w.hasWallet && w.isActive).length;
    const withBalance = wallets.filter((w) => w.balance > 0).length;

    const columns: Column<EuWallet>[] = [
        {
            header: "Client ID",
            accessor: (item) => (
                <div className="flex min-h-14 items-center">{item.parentClientid || "—"}</div>
            ),
            sortable: true,
            sortKey: "parentClientid",
        },
        {
            header: "AcNo",
            accessor: (item) => <div className="flex min-h-14 items-center">{item.acNo}</div>,
            sortable: true,
            sortKey: "acNo",
        },
        {
            header: "BTC Address",
            accessor: (item) => (
                <div className="flex min-h-14 max-w-[220px] items-center">
                    {!item.hasWallet || !item.btcAddr ? (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            No wallet
                        </span>
                    ) : item.btcAddr === "HOLD" ? (
                        <Badge variant="outline" className="text-amber-600">
                            HOLD
                        </Badge>
                    ) : (
                        <span className="truncate font-mono text-xs">{item.btcAddr}</span>
                    )}
                </div>
            ),
            sortable: true,
            sortKey: "btcAddr",
            searchValue: (item) => item.btcAddr || (item.hasWallet ? "" : "no wallet"),
        },
        {
            header: "Balance",
            accessor: (item) => (
                <div className="flex min-h-14 items-center">
                    <span className="font-semibold tabular-nums text-brand-600">
                        {showSensitiveData ? `${Number(item.balance).toFixed(8)} BTC` : "•••••••• BTC"}
                    </span>
                </div>
            ),
            sortable: true,
            sortKey: "balance",
        },
        {
            header: "Status",
            accessor: (item) => (
                <div className="flex min-h-14 items-center">
                    <Badge variant={item.isActive && item.hasWallet ? "default" : "secondary"}>
                        {!item.hasWallet ? "Missing" : item.isActive ? "Active" : "Inactive"}
                    </Badge>
                </div>
            ),
            sortable: true,
            sortKey: "isActive",
            searchValue: (item) => (!item.hasWallet ? "missing" : item.isActive ? "active" : "inactive"),
        },
        {
            header: "Ledger",
            accessor: (item) => (
                <div className="flex min-h-14 items-center">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 min-w-[4.5rem] gap-1.5 shadow-none"
                        disabled={!item.parentClientid}
                        onClick={(e) => {
                            e.stopPropagation();
                            openLedger(item);
                        }}
                    >
                        <BookOpen className="h-3.5 w-3.5" />
                        View
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <PageHeader title="EU Wallets" breadcrumbs={pageBreadcrumbs.wallets} />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title="EU Accounts"
                    value={wallets.length}
                    icon={<Wallet />}
                    iconColor="text-brand-600"
                    loading={loading}
                    valueClassName="min-w-[4ch]"
                />
                <MetricCard
                    title="Active Wallets"
                    value={withWallet}
                    icon={<Wallet />}
                    iconColor="text-emerald-600"
                    loading={loading}
                    valueClassName="min-w-[4ch]"
                />
                <MetricCard
                    title="With Balance"
                    value={withBalance}
                    icon={<span>฿</span>}
                    iconColor="text-accent-600"
                    loading={loading}
                    valueClassName="min-w-[4ch]"
                />
                <MetricCard
                    title="Total Balance"
                    value={showSensitiveData ? `${totalBalance.toFixed(8)} BTC` : "•••••••• BTC"}
                    icon={<span>฿</span>}
                    iconColor="text-accent-600"
                    loading={loading}
                    valueClassName="min-w-[16ch]"
                />
            </div>

            <DataTable
                data={wallets}
                columns={columns}
                loading={loading}
                lastColumnSkeleton="action"
                emptyMessage="No EU wallets found"
                searchPlaceholder="Search client ID, account no, BTC address, balance…"
                searchKeys={["parentClientid", "acNo", "btcAddr", "balance"]}
                rightActions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSensitiveData(!showSensitiveData)}
                        disabled={loading}
                        className="flex h-9 min-w-[9.5rem] items-center gap-2 shadow-none"
                    >
                        {showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {showSensitiveData ? "Hide Balances" : "Show Balances"}
                    </Button>
                }
            />

            <WalletLedgerDialog
                open={ledgerOpen}
                onOpenChange={setLedgerOpen}
                ledger={ledger}
                loading={ledgerLoading}
                showSensitiveData={showSensitiveData}
            />

            {selectedWallet && ledger && !ledgerLoading && (
                <p className="sr-only">
                    Ledger for {selectedWallet.parentClientid} — {ledger.entries.length} entries
                </p>
            )}
        </div>
    );
}
