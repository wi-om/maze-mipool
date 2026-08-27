import dotenv from "dotenv";
import Pyroscope from "@pyroscope/nodejs";

dotenv.config();

const serverAddress = process.env.PYROSCOPE_SERVER_ADDRESS;
const basicAuthUser = process.env.PYROSCOPE_BASIC_AUTH_USER;
const basicAuthPassword = process.env.PYROSCOPE_BASIC_AUTH_PASSWORD;
const appName = process.env.PYROSCOPE_APPLICATION_NAME || "ms-api";

if (!serverAddress || !basicAuthUser || !basicAuthPassword) {
  console.log(
    "[profiles] Pyroscope disabled because required env vars are missing"
  );
} else {
  Pyroscope.init({
    serverAddress,
    appName,
    basicAuthUser,
    basicAuthPassword,
    tags: {
      environment: "dev",
      namespace: "mips",
      service: "ms-api",
    },
    wall: {
      collectCpuTime: true,
    },
  });

  Pyroscope.start();

  console.log(`[profiles] Pyroscope started for service: ${appName}`);

  process.on("SIGTERM", () => {
    Pyroscope.stop()
      .then(() => console.log("[profiles] Pyroscope stopped"))
      .catch((err) =>
        console.error("[profiles] Error stopping Pyroscope", err)
      );
  });
}
