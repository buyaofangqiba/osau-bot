import { Pool } from "pg";
import type { AppConfig } from "../config.js";

export function createDbPool(config: AppConfig) {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10
  });
}
