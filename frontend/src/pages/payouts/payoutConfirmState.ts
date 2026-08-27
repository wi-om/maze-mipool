import type { PreviewRow } from "../../api/services/payoutService";

export type PayoutConfirmState = {
    acNos: string[];
    txid: string;
    paidThroughDate: string;
    previewRows: PreviewRow[];
};
