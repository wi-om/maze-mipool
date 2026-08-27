import { Router } from "express";
import {
  setWallet,
  checkWallet,
  getActiveWallet,
  getWalletHistory,
  listWallets,
  getEuWallets,
  getWalletLedger,
  getWalletTxns,
  getWalletTxnsByAcNo,
} from "../../controllers/wallet/wallet.controller";

const router = Router();

router.get("/eu", getEuWallets);
router.get("/txn", getWalletTxns);
router.get("/txn/:acNo", getWalletTxnsByAcNo);
router.get("/ledger/:clientid", getWalletLedger);
router.post("/set", setWallet);
router.get("/check/:clientid", checkWallet);
router.get("/active/:clientid", getActiveWallet);
router.get("/list/:clientid", listWallets);
router.get("/history/:clientid", getWalletHistory);

export default router;
