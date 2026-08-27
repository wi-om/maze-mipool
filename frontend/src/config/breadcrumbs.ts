import type { BreadcrumbItem } from "../components/layout/PageHeader";

export const homeCrumb: BreadcrumbItem = { label: "Home", href: "/dashboard" };

export const pageBreadcrumbs = {
    dashboard: [{ ...homeCrumb }, { label: "Dashboard" }],
    euContract: [{ ...homeCrumb }, { label: "Contracts" }, { label: "EU Contract" }],
    clContract: [{ ...homeCrumb }, { label: "Contracts" }, { label: "CL Contract" }],
    wallets: [{ ...homeCrumb }, { label: "Wallets", href: "/wallets" }, { label: "EU Wallets" }],
    walletTransactions: [{ ...homeCrumb }, { label: "Wallets", href: "/wallets" }, { label: "Transactions" }],
    euRewards: [{ ...homeCrumb }, { label: "Rewards" }, { label: "EU Rewards" }],
    rewardsCompare: [{ ...homeCrumb }, { label: "Rewards" }, { label: "Compare" }],
    clRewards: [{ ...homeCrumb }, { label: "Rewards" }, { label: "CL Rewards" }],
    cmWallet: [{ ...homeCrumb }, { label: "Rewards" }, { label: "CM Wallet" }],
    liveDistribution: [{ ...homeCrumb }, { label: "Rewards" }, { label: "Live Distribution" }],
    rewards: [{ ...homeCrumb }, { label: "Rewards" }],
    payouts: [{ ...homeCrumb }, { label: "Payouts" }],
    blockchainData: [{ ...homeCrumb }, { label: "Blockchain Data" }],
    addPayout: [{ ...homeCrumb }, { label: "Payouts", href: "/payouts" }, { label: "Add Payout" }],
    confirmPayout: [
        { ...homeCrumb },
        { label: "Payouts", href: "/payouts" },
        { label: "Add Payout", href: "/payouts/add" },
        { label: "Confirm" },
    ],
    accounts: [{ ...homeCrumb }, { label: "Accounts" }],
    settings: [{ ...homeCrumb }, { label: "Settings" }],
};
