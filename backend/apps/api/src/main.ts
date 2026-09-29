import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { StatusExceptionFilter } from "./status-exception.filter.js";
import { config, useEmbeddedPostgres } from "./config.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "./embedded-postgres.js";
import { closeAllPools, getControlPool } from "./db/pool.js";
import { startTalkWorker, stopTalkWorker } from "./talk/worker.js";
import { startRollupWorker, stopRollupWorker } from "./web/rollupWorker.js";
import type { NextFunction, Request, Response } from "express";

async function bootstrap() {
  if (useEmbeddedPostgres) {
    await startEmbeddedPostgres();
  }
  // Fail fast if the control DB is unreachable.
  await getControlPool();

  const app = await NestFactory.create(AppModule, { logger: ["log", "error", "warn"] });
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (config.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
  app.enableCors({
    origin: config.WEB_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  app.useGlobalFilters(new StatusExceptionFilter());
  app.enableShutdownHooks();
  startTalkWorker();
  startRollupWorker();
  await app.listen(config.PORT);
  console.log(`[api] Mandela API ready on http://localhost:${config.PORT}`);
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received — shutting down`);
  try {
    stopTalkWorker();
    stopRollupWorker();
    await stopEmbeddedPostgres();
    await closeAllPools();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error("[api] unhandled rejection", err);
});

void bootstrap().catch((err) => {
  console.error("[api] fatal bootstrap error:", err);
  void shutdown("fatal");
  process.exit(1);
});
