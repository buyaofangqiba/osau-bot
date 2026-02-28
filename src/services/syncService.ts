import type { Pool } from "pg";
import { GgeClient } from "../api/ggeClient.js";
import type { AppConfig } from "../config.js";
import type { AppLogger } from "../logger.js";

export class SyncService {
  constructor(
    private readonly pool: Pool,
    private readonly ggeClient: GgeClient,
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
    private readonly onAfterSync?: () => Promise<void>
  ) {}

  startScheduler() {
    const intervalMs = this.config.syncIntervalHours * 60 * 60 * 1000;
    setInterval(() => {
      void this.runFullSync("scheduled");
    }, intervalMs);
  }

  async runFullSync(source: "scheduled" | "manual") {
    const started = await this.pool.query(
      `INSERT INTO sync_runs (status, message) VALUES ('running', $1) RETURNING id`,
      [`${source} sync started`]
    );
    const syncRunId = started.rows[0]?.id as number;
    this.logger.info({ syncRunId, source }, "Sync started");

    let processedPlayers = 0;
    const seenPlayerIds = new Set<number>();

    try {
      for (const allianceId of this.config.gge.syncAllianceIds) {
        const alliance = await this.ggeClient.getAllianceById(allianceId);
        processedPlayers += alliance.players.length;

        for (const player of alliance.players) {
          seenPlayerIds.add(player.player_id);
          await this.pool.query(
            `
            INSERT INTO players (id, current_name, current_alliance_id, current_alliance_rank, level, might, loot, honor, last_seen_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (id)
            DO UPDATE SET
              current_name = EXCLUDED.current_name,
              current_alliance_id = EXCLUDED.current_alliance_id,
              current_alliance_rank = EXCLUDED.current_alliance_rank,
              level = EXCLUDED.level,
              might = EXCLUDED.might,
              loot = EXCLUDED.loot,
              honor = EXCLUDED.honor,
              last_seen_at = NOW(),
              updated_at = NOW()
            `,
            [
              player.player_id,
              player.player_name,
              allianceId,
              player.alliance_rank,
              player.level ?? null,
              player.might ?? null,
              player.loot ?? null,
              player.honor ?? null
            ]
          );
        }
      }

      const seenIds = Array.from(seenPlayerIds);
      await this.pool.query(
        `
        UPDATE players
        SET
          current_alliance_id = NULL,
          current_alliance_rank = NULL,
          updated_at = NOW()
        WHERE current_alliance_id = ANY($1::bigint[])
          AND NOT (id = ANY($2::bigint[]))
        `,
        [this.config.gge.syncAllianceIds, seenIds.length > 0 ? seenIds : [-1]]
      );

      if (this.onAfterSync) {
        await this.onAfterSync();
      }

      await this.pool.query(
        `UPDATE sync_runs SET status = 'success', finished_at = NOW(), processed_players = $1, message = 'sync completed' WHERE id = $2`,
        [processedPlayers, syncRunId]
      );
      this.logger.info({ syncRunId, processedPlayers }, "Sync completed");
    } catch (error) {
      await this.pool.query(
        `UPDATE sync_runs SET status = 'failed', finished_at = NOW(), message = $1, errors_count = errors_count + 1 WHERE id = $2`,
        [String(error), syncRunId]
      );
      this.logger.error({ error, syncRunId }, "Sync failed");
      throw error;
    }
  }
}
