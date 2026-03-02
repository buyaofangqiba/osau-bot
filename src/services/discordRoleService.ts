import type { Pool } from "pg";
import type { Client, GuildMember } from "discord.js";
import type { AppConfig } from "../config.js";
import type { AppLogger } from "../logger.js";

interface LinkedMemberState {
  discordUserId: string;
  playerId: number | string;
  currentAllianceId: number | string | null;
  currentAllianceRank: number | string | null;
}

export class DiscordRoleService {
  private readonly rankRoleByCode: Record<number, string>;
  private readonly groupRoleIds: Set<string>;
  private readonly allianceGroupRoleById: Map<number, string>;

  constructor(
    private readonly pool: Pool,
    private readonly client: Client,
    private readonly config: AppConfig,
    private readonly logger: AppLogger
  ) {
    this.rankRoleByCode = {
      0: this.config.roleIds.leader,
      1: this.config.roleIds.deputy,
      2: this.config.roleIds.warMarshall,
      3: this.config.roleIds.treasurer,
      4: this.config.roleIds.diplomat,
      5: this.config.roleIds.recruiter,
      6: this.config.roleIds.general,
      7: this.config.roleIds.sergeant,
      8: this.config.roleIds.member,
      9: this.config.roleIds.novice
    };
    this.allianceGroupRoleById = new Map(
      Object.entries(this.config.roleIds.allianceById).map(([allianceId, roleId]) => [Number(allianceId), roleId])
    );
    this.groupRoleIds = new Set([
      this.config.roleIds.visitor,
      this.config.roleIds.alumni,
      ...this.allianceGroupRoleById.values()
    ]);
  }

  async handleMemberJoin(member: GuildMember): Promise<{ linked: boolean }> {
    const state = await this.getLinkedStateForDiscordUser(member.id);
    await this.applyMemberRoles(member, state);
    return { linked: Boolean(state) };
  }

  async reconcileAllLinkedMembers() {
    const states = await this.getAllLinkedStates();
    const guild = await this.client.guilds.fetch(this.config.discord.guildId);

    let updatedCount = 0;
    for (const state of states) {
      const member = await guild.members.fetch({ user: state.discordUserId, force: true }).catch(() => null);
      if (!member) {
        continue;
      }
      await this.applyMemberRoles(member, state);
      updatedCount += 1;
    }
    this.logger.info({ updatedCount }, "Reconciled roles for linked members");
  }

  async reconcileDiscordUser(discordUserId: string) {
    const guild = await this.client.guilds.fetch(this.config.discord.guildId);
    const member = await guild.members.fetch({ user: discordUserId, force: true }).catch(() => null);
    if (!member) {
      return;
    }
    const state = await this.getLinkedStateForDiscordUser(discordUserId);
    await this.applyMemberRoles(member, state);
  }

  private async getLinkedStateForDiscordUser(discordUserId: string): Promise<LinkedMemberState | null> {
    const result = await this.pool.query<LinkedMemberState>(
      `
      SELECT
        dl.discord_user_id AS "discordUserId",
        dl.player_id AS "playerId",
        p.current_alliance_id AS "currentAllianceId",
        p.current_alliance_rank AS "currentAllianceRank"
      FROM discord_links dl
      LEFT JOIN players p ON p.id = dl.player_id
      WHERE dl.discord_user_id = $1
        AND dl.unlinked_at IS NULL
      LIMIT 1
      `,
      [discordUserId]
    );
    return result.rows[0] ?? null;
  }

  private async getAllLinkedStates(): Promise<LinkedMemberState[]> {
    const result = await this.pool.query<LinkedMemberState>(
      `
      SELECT
        dl.discord_user_id AS "discordUserId",
        dl.player_id AS "playerId",
        p.current_alliance_id AS "currentAllianceId",
        p.current_alliance_rank AS "currentAllianceRank"
      FROM discord_links dl
      LEFT JOIN players p ON p.id = dl.player_id
      WHERE dl.unlinked_at IS NULL
      `
    );
    return result.rows;
  }

  private resolveGroupRoleId(allianceId: number | null, linked: boolean): string {
    if (!linked) {
      return this.config.roleIds.visitor;
    }
    if (allianceId !== null) {
      const mapped = this.allianceGroupRoleById.get(allianceId);
      if (mapped) {
        return mapped;
      }
    }
    return this.config.roleIds.alumni;
  }

  private resolveRankRoleId(rankCode: number | null, allianceId: number | null): string | null {
    if (allianceId === null || rankCode === null) {
      return null;
    }
    return this.rankRoleByCode[rankCode] ?? null;
  }

  private async applyMemberRoles(member: GuildMember, linkedState: LinkedMemberState | null) {
    const allianceId = this.toNullableNumber(linkedState?.currentAllianceId ?? null);
    const rankCode = this.toNullableNumber(linkedState?.currentAllianceRank ?? null);
    const targetGroupRoleId = this.resolveGroupRoleId(allianceId, Boolean(linkedState));
    const targetRankRoleId = this.resolveRankRoleId(rankCode, allianceId);
    const rankRoleIds = new Set(Object.values(this.rankRoleByCode));

    const currentRoleIds = new Set(member.roles.cache.keys());
    const rolesToRemove: string[] = [];
    const rolesToAdd: string[] = [];

    for (const roleId of this.groupRoleIds) {
      if (roleId !== targetGroupRoleId && currentRoleIds.has(roleId)) {
        rolesToRemove.push(roleId);
      }
    }
    for (const roleId of rankRoleIds) {
      if (roleId !== targetRankRoleId && currentRoleIds.has(roleId)) {
        rolesToRemove.push(roleId);
      }
    }

    if (!currentRoleIds.has(targetGroupRoleId)) {
      rolesToAdd.push(targetGroupRoleId);
    }
    if (targetRankRoleId && !currentRoleIds.has(targetRankRoleId)) {
      rolesToAdd.push(targetRankRoleId);
    }

    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove, "Role reconciliation");
    }
    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd, "Role reconciliation");
    }

    this.logger.info(
      {
        discordUserId: member.id,
        linked: Boolean(linkedState),
        playerId: this.toNullableNumber(linkedState?.playerId ?? null),
        currentAllianceId: allianceId,
        currentAllianceRank: rankCode,
        currentRoleIds: Array.from(currentRoleIds),
        targetGroupRoleId,
        targetRankRoleId,
        rolesToRemove,
        rolesToAdd
      },
      "Reconciled Discord roles for member"
    );
  }

  private toNullableNumber(value: number | string | null): number | null {
    if (value === null) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
