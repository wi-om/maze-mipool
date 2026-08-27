import { Router } from "express";
import { signup, login, verifyOtp, getMe } from "../../controllers/auth/auth.controller";
import { verifyMipsToken, limiter } from "@common";

const router = Router();

router.post("/signup", limiter, signup);
router.post("/login", limiter, login);
router.post("/verify", limiter, verifyOtp);
router.get("/me", verifyMipsToken as any, getMe);

export default router;
