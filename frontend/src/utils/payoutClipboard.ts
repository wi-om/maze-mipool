import type { PayoutClient } from "../api/services/payoutService";

/** `bc1q…, 0.00044700` — address, space, amount (8 decimal places, no BTC suffix). */
export function formatPayoutClipboardLine(btcAddr: string, amount: number): string {
    return `${btcAddr}, ${Number(amount).toFixed(8)}`;
}

export function getCopyablePayoutClients(clients: PayoutClient[]): PayoutClient[] {
    return clients.filter((c) => c.hasActiveWallet && c.btcAddr && c.btcAddr !== "HOLD");
}

export function buildPayoutClipboardText(clients: PayoutClient[]): string {
    return getCopyablePayoutClients(clients)
        .map((c) => formatPayoutClipboardLine(c.btcAddr!, c.payableBalance))
        .join("\n");
}
