import { Pool } from "pg";

export interface DbConfig {
  databaseUrl: string;
}

export function createDbPool(config: DbConfig) {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10
  });
}
