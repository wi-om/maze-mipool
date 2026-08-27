import { Router } from "express";
import { getSetting, updateSetting, getAllSettings } from "../../controllers/settings/settings.controller";
import { verifyMipsToken } from "@common";

const router = Router();

router.get("/", verifyMipsToken as any, getAllSettings);
router.get("/:key", verifyMipsToken as any, getSetting);
router.post("/update", verifyMipsToken as any, updateSetting as any);

export default router;
