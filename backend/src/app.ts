import "reflect-metadata";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import {
  AppDataSource,
  UserAppDataSource,
  httpLogger,
  logger,
} from "./common";
import { sendOpsAlert } from "./common/service/opsAlerts";

// ── Auth Routes ────────────────────────────────────────────────
import authRoutes from "./modules/auth/routes/auth/auth.routes";

// ── CRM Routes ────────────────────────────────────────────────
import clientRoutes from "./modules/crm/routes/clients/client.routes";
import accountRoutes from "./modules/crm/routes/accounts/account.routes";

import contractRoutes from "./modules/crm/routes/contract/contract.routes";
import walletRoutes from "./modules/crm/routes/wallet/wallet.routes";
import settingRoutes from "./modules/crm/routes/settings/settings.routes";

// ── Engine Routes ─────────────────────────────────────────────
import rewardRoutes from "./modules/engine/routes/rewards/reward.routes";
import dailyRewardRoutes from "./modules/engine/routes/rewards/dailyReward.routes";
import mipsWorkerRoutes from "./modules/engine/routes/worker/mips.routes";
import payoutRoutes from "./modules/engine/routes/payouts/payout.routes";

dotenv.config();

const app = express();

// ── Security ──────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: [
      "https://cmb-d.defitech.net",
      "http://localhost:5173",
      "http://localhost:5175",
      "https://mipcc-dpabarewhbfcb3h5.uaenorth-01.azurewebsites.net"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-api-pass"],
    credentials: true,
  })
);
app.use(express.json());
app.use(httpLogger);
app.set("trust proxy", 1);

// ── Health ────────────────────────────────────────────────────
app.get("/", (req: Request, res: Response) => {
  res.json({ status: "UP", service: "MIPS API", timestamp: new Date() });
});

app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "UP",
    db: AppDataSource.isInitialized ? "connected" : "disconnected",
    timestamp: new Date(),
  });
});

// ── Routes ────────────────────────────────────────────────────
// Public / shared with mca-delta + mcc-delta (they send APIM key only, not mipcc JWT).
// Do NOT mount verifyMipsToken here — it would break customer registration, contracts, rewards, wallets.
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/contracts", contractRoutes); // CL routes still enforce JWT inside the router
app.use("/api/wallets", walletRoutes);
app.use("/api/settings", settingRoutes); // settings routes enforce JWT inside the router
app.use("/api/yields", rewardRoutes);
app.use("/api/rewards/daily", dailyRewardRoutes); // cron = secret; rest used by mca-delta
app.use("/api/payouts", payoutRoutes); // mutations used only by mipcc enforce JWT inside the router
app.use("/api/mips", mipsWorkerRoutes);

// ── Global Error Handler ──────────────────────────────────────
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(err, "Unhandled error");
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    const path = `${req.method} ${req.originalUrl || req.url}`;
    void sendOpsAlert(
      "api_error",
      err?.message || String(err),
      { path, key: `api_error:${path}` },
    );
  }
  res.status(status).json({
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;
