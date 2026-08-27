import { Router } from "express";
import { verifyMipsToken } from "@common";
import {
  getAllPayouts,
  getPayoutsByClientId,
  getPayoutSummary,
  getPayoutClients,
  getPayoutPending,
  previewPayout,
  completePayout,
  importPayoutTxidFees,
  deductPayoutTxidFees,
  syncPayoutFeesFromPeriodHandler,
  getPayoutTxnSummary,
  previewBlockchainPayout,
  importBlockchainPayout,
  compareBlockchainPayouts,
  listBlockchainPayouts,
  listPayoutAddressIssues,
  getDailyReconciliation,
} from "../../controllers/payouts/payout.controller";

const router = Router();

// Reads used by mca-delta / mcc-delta (APIM key only — no mipcc JWT).
router.get("/pending", getPayoutPending);
router.get("/summary", getPayoutSummary);
router.get("/txn-summary", getPayoutTxnSummary);
router.get("/clients", getPayoutClients);
router.get("/blockchain/compare", compareBlockchainPayouts);
router.get("/blockchain/list", listBlockchainPayouts);
router.get("/blockchain/address-issues", listPayoutAddressIssues);
router.get("/daily-compare", getDailyReconciliation);
router.get("/", getAllPayouts);
router.get("/client/:clientid", getPayoutsByClientId);

// mipcc-only mutations — require admin JWT so expired/missing tokens cannot complete payouts.
router.post("/preview", verifyMipsToken, previewPayout);
router.post("/complete", verifyMipsToken, completePayout);
router.post("/txid-fees/import", verifyMipsToken, importPayoutTxidFees);
router.post("/txid-fees/deduct", verifyMipsToken, deductPayoutTxidFees);
router.post("/txid-fees/sync-from-period", verifyMipsToken, syncPayoutFeesFromPeriodHandler);
router.post("/blockchain/preview", verifyMipsToken, previewBlockchainPayout);
router.post("/blockchain/import", verifyMipsToken, importBlockchainPayout);

export default router;
