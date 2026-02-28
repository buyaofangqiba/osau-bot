import pino from "pino";
import type { AppConfig } from "./config.js";

export function createLogger(config: AppConfig) {
  return pino({
    level: config.logLevel,
    transport:
      config.nodeEnv === "development"
        ? {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" }
          }
        : undefined
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
