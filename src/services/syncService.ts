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
        const allianceName = alliance.alliance_name ?? `Alliance ${allianceId}`;

        await this.pool.query(
          `
          INSERT INTO alliances (id, name)
          VALUES ($1, $2)
          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = NOW()
          `,
          [allianceId, allianceName]
        );

        processedPlayers += alliance.players.length;
        await this.upsertAlliancePlayers(allianceId, alliance.players, seenPlayerIds);
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

  private async upsertAlliancePlayers(
    allianceId: number,
    players: Array<{
      player_id: number;
      player_name: string;
      alliance_rank: number;
      level?: number;
      might?: number;
      loot?: number;
      honor?: number;
    }>,
    seenPlayerIds: Set<number>
  ) {
    if (players.length === 0) {
      return;
    }

    const ids: number[] = [];
    const names: string[] = [];
    const allianceIds: number[] = [];
    const rankCodes: number[] = [];
    const levels: Array<number | null> = [];
    const mights: Array<number | null> = [];
    const loots: Array<number | null> = [];
    const honors: Array<number | null> = [];

    for (const player of players) {
      const parsedId = Number(player.player_id);
      if (!Number.isFinite(parsedId)) {
        continue;
      }
      seenPlayerIds.add(parsedId);
      ids.push(parsedId);
      names.push(player.player_name);
      allianceIds.push(allianceId);
      rankCodes.push(player.alliance_rank);
      levels.push(player.level ?? null);
      mights.push(player.might ?? null);
      loots.push(player.loot ?? null);
      honors.push(player.honor ?? null);
    }

    if (ids.length === 0) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO players (
        id,
        current_name,
        current_alliance_id,
        current_alliance_rank,
        level,
        might,
        loot,
        honor,
        last_seen_at
      )
      SELECT
        t.id,
        t.current_name,
        t.current_alliance_id,
        t.current_alliance_rank,
        t.level,
        t.might,
        t.loot,
        t.honor,
        NOW()
      FROM UNNEST(
        $1::bigint[],
        $2::text[],
        $3::bigint[],
        $4::smallint[],
        $5::integer[],
        $6::bigint[],
        $7::bigint[],
        $8::bigint[]
      ) AS t(
        id,
        current_name,
        current_alliance_id,
        current_alliance_rank,
        level,
        might,
        loot,
        honor
      )
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
      [ids, names, allianceIds, rankCodes, levels, mights, loots, honors]
    );
  }
}
