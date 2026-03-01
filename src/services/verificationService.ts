import type { Pool } from "pg";
import type { AppLogger } from "../logger.js";

export interface ClaimablePlayer {
  playerId: number;
  playerName: string;
}

export interface ClaimSubmission {
  claimId: number;
  discordUserId: string;
  playerId: number;
  playerName: string;
}

export interface ClaimDecisionResult {
  claimId: number;
  discordUserId: string;
  playerId: number;
  reviewerDiscordUserId: string;
}

export class VerificationService {
  constructor(
    private readonly pool: Pool,
    private readonly logger: AppLogger
  ) {}

  async recordClaim(discordUserId: string, playerId: number): Promise<ClaimSubmission> {
    const result = await this.pool.query<ClaimSubmission>(
      `
      WITH created AS (
        INSERT INTO claim_requests (discord_user_id, player_id, status, expires_at)
        VALUES ($1, $2, 'pending', NOW() + INTERVAL '7 days')
        RETURNING id, discord_user_id, player_id
      )
      SELECT
        c.id AS "claimId",
        c.discord_user_id AS "discordUserId",
        c.player_id AS "playerId",
        p.current_name AS "playerName"
      FROM created c
      JOIN players p ON p.id = c.player_id
      `,
      [discordUserId, playerId]
    );
    const claim = result.rows[0];
    this.logger.info({ discordUserId, playerId, claimId: claim.claimId }, "Claim recorded");
    return claim;
  }

  async getClaimablePlayersByAllianceRank(
    allianceId: number,
    rankCode: number,
    page: number,
    pageSize = 25
  ): Promise<{ players: ClaimablePlayer[]; hasNextPage: boolean }> {
    const safePage = Math.max(0, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 25));
    const offset = safePage * safePageSize;

    const result = await this.pool.query<ClaimablePlayer>(
      `
      SELECT
        p.id AS "playerId",
        p.current_name AS "playerName"
      FROM players p
      LEFT JOIN discord_links dl
        ON dl.player_id = p.id
        AND dl.unlinked_at IS NULL
      WHERE p.current_alliance_id = $1
        AND p.current_alliance_rank = $2
        AND dl.id IS NULL
      ORDER BY p.current_name ASC
      LIMIT $3
      OFFSET $4
      `,
      [allianceId, rankCode, safePageSize + 1, offset]
    );

    const hasNextPage = result.rows.length > safePageSize;
    const players = hasNextPage ? result.rows.slice(0, safePageSize) : result.rows;
    return { players, hasNextPage };
  }

  async markJustVisiting(discordUserId: string) {
    await this.pool.query(
      `INSERT INTO claim_requests (discord_user_id, player_id, status, expires_at)
       VALUES ($1, NULL, 'just_visiting', NOW() + INTERVAL '7 days')`,
      [discordUserId]
    );
    this.logger.info({ discordUserId }, "Marked user as just visiting");
  }

  async approveClaim(claimId: number, reviewerDiscordUserId: string): Promise<ClaimDecisionResult | null> {
    const result = await this.pool.query<ClaimDecisionResult>(
      `
      UPDATE claim_requests
      SET
        status = 'approved',
        reviewed_at = NOW(),
        reviewed_by_discord_user_id = $2
      WHERE id = $1
        AND status = 'pending'
      RETURNING
        id AS "claimId",
        discord_user_id AS "discordUserId",
        player_id AS "playerId",
        reviewed_by_discord_user_id AS "reviewerDiscordUserId"
      `,
      [claimId, reviewerDiscordUserId]
    );
    return result.rows[0] ?? null;
  }

  async approveClaimAndUpsertLink(
    claimId: number,
    reviewerDiscordUserId: string
  ): Promise<ClaimDecisionResult | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const approved = await client.query<ClaimDecisionResult>(
        `
        UPDATE claim_requests
        SET
          status = 'approved',
          reviewed_at = NOW(),
          reviewed_by_discord_user_id = $2
        WHERE id = $1
          AND status = 'pending'
        RETURNING
          id AS "claimId",
          discord_user_id AS "discordUserId",
          player_id AS "playerId",
          reviewed_by_discord_user_id AS "reviewerDiscordUserId"
        `,
        [claimId, reviewerDiscordUserId]
      );

      const row = approved.rows[0] ?? null;
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
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
        [row.discordUserId, row.playerId, row.reviewerDiscordUserId]
      );

      await client.query("COMMIT");
      return row;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async denyClaim(claimId: number, reviewerDiscordUserId: string): Promise<ClaimDecisionResult | null> {
    const result = await this.pool.query<ClaimDecisionResult>(
      `
      UPDATE claim_requests
      SET
        status = 'denied',
        reviewed_at = NOW(),
        reviewed_by_discord_user_id = $2
      WHERE id = $1
        AND status = 'pending'
      RETURNING
        id AS "claimId",
        discord_user_id AS "discordUserId",
        player_id AS "playerId",
        reviewed_by_discord_user_id AS "reviewerDiscordUserId"
      `,
      [claimId, reviewerDiscordUserId]
    );
    return result.rows[0] ?? null;
  }

  async purgeExpiredDeniedClaims(retentionDays: number): Promise<number> {
    const result = await this.pool.query(
      `
      DELETE FROM claim_requests
      WHERE status = 'denied'
        AND expires_at IS NOT NULL
        AND expires_at < NOW() - ($1::int * INTERVAL '1 day')
      `,
      [retentionDays]
    );
    return result.rowCount ?? 0;
  }
}
