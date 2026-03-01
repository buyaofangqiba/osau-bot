import type { Pool } from "pg";

export class AuditService {
  constructor(private readonly pool: Pool) {}

  async record(
    commandName: string,
    actorDiscordUserId: string,
    opts?: {
      targetDiscordUserId?: string;
      targetPlayerId?: number;
      payload?: Record<string, unknown>;
    }
  ) {
    await this.pool.query(
      `
      INSERT INTO command_audit (
        command_name,
        actor_discord_user_id,
        target_discord_user_id,
        target_player_id,
        payload_json
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        commandName,
        actorDiscordUserId,
        opts?.targetDiscordUserId ?? null,
        opts?.targetPlayerId ?? null,
        JSON.stringify(opts?.payload ?? {})
      ]
    );
  }
}
