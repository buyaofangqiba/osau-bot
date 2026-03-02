import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import type { AppLogger } from "../logger.js";

export type PlayerNameResolution =
  | { status: "resolved"; player: { playerId: number; playerName: string } }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: Array<{ playerId: number; playerName: string }> };

export class LinkService {
  private readonly trackedAllianceIds: Set<number>;

  constructor(
    private readonly pool: Pool,
    private readonly config: AppConfig,
    private readonly logger: AppLogger
  ) {
    this.trackedAllianceIds = new Set(this.config.gge.syncAllianceIds);
  }

  async linkPlayerToDiscordUser(playerId: number, discordUserId: string, actorDiscordUserId: string) {
    await this.pool.query(
      `
      INSERT INTO discord_links (discord_user_id, player_id, linked_by_discord_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (discord_user_id)
      DO UPDATE SET
        player_id = EXCLUDED.player_id,
        linked_by_discord_user_id = EXCLUDED.linked_by_discord_user_id,
        unlinked_at = NULL,
        updated_at = NOW()
      `,
      [discordUserId, playerId, actorDiscordUserId]
    );

    this.logger.info({ playerId, discordUserId, actorDiscordUserId }, "Linked player to Discord user");
  }

  async unlinkByPlayer(playerId: number, actorDiscordUserId: string): Promise<string[]> {
    const existing = await this.pool.query<{ discord_user_id: string }>(
      `SELECT discord_user_id FROM discord_links WHERE player_id = $1 AND unlinked_at IS NULL`,
      [playerId]
    );
    await this.pool.query(
      `UPDATE discord_links SET unlinked_at = NOW(), updated_at = NOW() WHERE player_id = $1 AND unlinked_at IS NULL`,
      [playerId]
    );
    this.logger.info({ playerId, actorDiscordUserId }, "Unlinked player from Discord user");
    return existing.rows.map((row) => row.discord_user_id);
  }

  async resolvePlayerByName(playerName: string): Promise<PlayerNameResolution> {
    const result = await this.pool.query<{
      playerId: number;
      playerName: string;
      currentAllianceId: number | string | null;
    }>(
      `
      SELECT
        id AS "playerId",
        current_name AS "playerName",
        current_alliance_id AS "currentAllianceId"
      FROM players
      WHERE LOWER(current_name) = LOWER($1)
      ORDER BY last_seen_at DESC NULLS LAST, id DESC
      LIMIT 25
      `,
      [playerName]
    );

    if (result.rows.length === 0) {
      return { status: "not_found" };
    }

    const tracked = result.rows.filter((row) => {
      if (row.currentAllianceId === null) {
        return false;
      }
      const allianceId = Number(row.currentAllianceId);
      return Number.isFinite(allianceId) && this.trackedAllianceIds.has(allianceId);
    });
    if (tracked.length === 1) {
      return {
        status: "resolved",
        player: { playerId: tracked[0].playerId, playerName: tracked[0].playerName }
      };
    }
    if (tracked.length > 1) {
      return {
        status: "ambiguous",
        candidates: tracked.slice(0, 5).map((row) => ({ playerId: row.playerId, playerName: row.playerName }))
      };
    }

    if (result.rows.length === 1) {
      return {
        status: "resolved",
        player: { playerId: result.rows[0].playerId, playerName: result.rows[0].playerName }
      };
    }

    return {
      status: "ambiguous",
      candidates: result.rows.slice(0, 5).map((row) => ({ playerId: row.playerId, playerName: row.playerName }))
    };
  }
}
