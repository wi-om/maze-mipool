import { Router } from "express";
import { getAccountByClientid, registerAccount, getAllAccounts } from "../../controllers/account/account.controller";

const router = Router();

router.post("/register", registerAccount);
router.get("/", getAllAccounts);
router.get("/by-clientid/:clientid", getAccountByClientid);

export default router;
