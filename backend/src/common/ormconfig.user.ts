// src/ormconfig.user.ts
import { DataSource } from "typeorm";
import { User } from "./entities/User";

const userDbHost = process.env.USER_DB_HOST ?? "";
const useSsl =
  process.env.DB_SSL !== "false" &&
  userDbHost !== "127.0.0.1" &&
  userDbHost !== "localhost";

export const UserAppDataSource = new DataSource({
  type: "postgres",
  host: process.env.USER_DB_HOST,
  port: process.env.USER_DB_PORT ? parseInt(process.env.USER_DB_PORT) : 5432,
  username: process.env.USER_DB_USERNAME,
  password: process.env.USER_DB_PASSWORD,
  database: process.env.USER_DB_NAME,
  schema: process.env.USER_DB_SCHEMA || "public",
  synchronize: false,
  logging: false,
  entities: [User],
  ...(useSsl
    ? {
        ssl: { rejectUnauthorized: false },
        extra: { ssl: { require: true } },
      }
    : {}),
});
