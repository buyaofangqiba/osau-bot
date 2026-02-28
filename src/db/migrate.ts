import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
import { createDbPool } from "./pool.js";

async function run() {
  const migrationEnv = z
    .object({
      DATABASE_URL: z.string().min(1)
    })
    .parse(process.env);
  const config = {
    databaseUrl: migrationEnv.DATABASE_URL
  };
  const pool = createDbPool(config);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const alreadyApplied = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1",
        [version]
      );
      if (alreadyApplied.rowCount) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await pool.query("COMMIT");
        process.stdout.write(`Applied migration ${version}\n`);
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  process.stderr.write(`Migration failed: ${String(error)}\n`);
  process.exitCode = 1;
});
