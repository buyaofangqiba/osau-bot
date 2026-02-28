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

  async unlinkByPlayer(playerId: number, actorDiscordUserId: string) {
    await this.pool.query(
      `UPDATE discord_links SET unlinked_at = NOW(), updated_at = NOW() WHERE player_id = $1 AND unlinked_at IS NULL`,
      [playerId]
    );
    this.logger.info({ playerId, actorDiscordUserId }, "Unlinked player from Discord user");
  }
}
