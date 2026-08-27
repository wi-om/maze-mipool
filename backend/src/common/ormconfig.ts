import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { Account } from "./entities/Account";
import { Client } from "./entities/Client";
import { Contract } from "./entities/Contract";
import { Hashrate1Hr } from "./entities/Hashrate1Hr";
import { Hashrate24 } from "./entities/Hashrate24";
import { Payout } from "./entities/Payouts";
import { Reward } from "./entities/Rewards";

import { MipsUser } from "./entities/MipsUser";
import { MipsOtp } from "./entities/MipsOtp";
import { SystemSetting } from "./entities/SystemSetting";
import { UnitReward } from "./entities/UnitReward";
import { CLContract } from "./entities/CLContract";
import { CLReward } from "./entities/CLReward";
import { CLPayout } from "./entities/CLPayout";
import { CMWallet } from "./entities/CMWallet";
import { Wallet } from "./entities/Wallet";
import { WalletAudit } from "./entities/WalletAudit";
import { WalletTxn } from "./entities/WalletTxn";
import { BlockchainPayout } from "./entities/BlockchainPayout";
import { BlockchainRawTx } from "./entities/BlockchainRawTx";


dotenv.config();

const dbHost = process.env.DB_HOST ?? "";
const useSsl =
  process.env.DB_SSL !== "false" &&
  dbHost !== "127.0.0.1" &&
  dbHost !== "localhost";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  schema: process.env.DB_SCHEMA || "public",
  synchronize: true,
  logging: false,
  entities: [
    Account,
    Client,
    Contract,
    Hashrate1Hr,
    Hashrate24,
    Payout,
    Reward,

    MipsUser,
    MipsOtp,
    SystemSetting,
    UnitReward,
    CLContract,
    CLReward,
    CLPayout,
    CMWallet,
    Wallet,
    WalletAudit,
    WalletTxn,
    BlockchainPayout,
    BlockchainRawTx,
  ],
  migrations: [],
  ...(useSsl
    ? {
        ssl: { rejectUnauthorized: false },
        extra: { ssl: { require: true } },
      }
    : {}),
});
