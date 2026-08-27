import "./profiling";
import app from "./app";
import { AppDataSource, UserAppDataSource, logger } from "./common";

const PORT = parseInt(process.env.PORT || "3002", 10);

const bootstrap = async () => {
  try {
    // Initialize Databases
    await Promise.all([
      AppDataSource.initialize(),
      UserAppDataSource.initialize()
    ]);
    logger.info("✅ Databases connected successfully");

    // Start Server
    app.listen(PORT, () => {
      logger.info(`🚀 MIPS API running on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    logger.error(err, "❌ Bootstrap failed");
    process.exit(1);
  }
};

bootstrap();
