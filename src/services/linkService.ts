import type { Pool } from "pg";
import type { AppLogger } from "../logger.js";

export class LinkService {
  constructor(
    private readonly pool: Pool,
    private readonly logger: AppLogger
  ) {}

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

  async resolvePlayerByName(playerName: string): Promise<{ playerId: number; playerName: string } | null> {
    const result = await this.pool.query<{ playerId: number; playerName: string }>(
      `
      SELECT id AS "playerId", current_name AS "playerName"
      FROM players
      WHERE LOWER(current_name) = LOWER($1)
      LIMIT 1
      `,
      [playerName]
    );
    return result.rows[0] ?? null;
  }
}
