import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ThreadAutoArchiveDuration,
  type GuildMember
} from "discord.js";
import type { AppConfig } from "../config.js";
import { ALLIANCE_RANKS } from "../constants/ranks.js";
import { COMPONENT_PREFIXES, routeComponentInteraction } from "./componentRouting.js";
import { executeComponentRoute } from "./componentRouteExecutor.js";
import { handleDiscordInteractionCreate } from "./clientInteractionHandler.js";
import type { AppLogger } from "../logger.js";
import type { ClaimSubmission, ClaimablePlayer } from "../services/verificationService.js";
import { COMMAND_DEFINITIONS } from "./commands.js";

export interface DiscordHandlers {
  onManualSync(): Promise<void>;
  onManualSyncByActor(discordUserId: string): Promise<void>;
  onLinkSet(actorDiscordUserId: string, playerName: string, targetDiscordUserId: string): Promise<string>;
  onLinkRemove(actorDiscordUserId: string, playerName: string): Promise<string>;
  onMemberJoin(member: GuildMember): Promise<void>;
  onMemberLeave(member: GuildMember): Promise<void>;
  onJustVisiting(discordUserId: string): Promise<void>;
  getClaimablePlayers(
    allianceId: number,
    rankCode: number,
    page: number
  ): Promise<{ players: ClaimablePlayer[]; hasNextPage: boolean }>;
  onClaimSubmit(discordUserId: string, playerId: number): Promise<ClaimSubmission>;
  onApproveClaim(claimId: number, reviewerDiscordUserId: string): Promise<{ discordUserId: string } | null>;
  onDenyClaim(claimId: number, reviewerDiscordUserId: string): Promise<{ discordUserId: string } | null>;
}

function toSafeUsername(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "member";
}

function buildVerificationThreadName(username: string): string {
  return `verify-${toSafeUsername(username)}`;
}

function buildAllianceRow(ownerDiscordUserId: string, selectedAllianceId?: number) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${COMPONENT_PREFIXES.verifyAlliance}${ownerDiscordUserId}_select`)
    .setPlaceholder("Select alliance")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Dark Warriors")
        .setValue("530061")
        .setDefault(selectedAllianceId === 530061),
      new StringSelectMenuOptionBuilder()
        .setLabel("La Muerte")
        .setValue("10061")
        .setDefault(selectedAllianceId === 10061)
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildRankRow(ownerDiscordUserId: string, allianceId?: number, selectedRankCode?: number) {
  const options = Object.entries(ALLIANCE_RANKS)
    .map(([code, name]) => ({ code: Number(code), name }))
    .sort((a, b) => a.code - b.code)
    .map((entry) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(entry.name)
        .setValue(String(entry.code))
        .setDefault(selectedRankCode === entry.code)
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${COMPONENT_PREFIXES.verifyRank}${ownerDiscordUserId}_${allianceId ?? 0}`)
    .setPlaceholder(allianceId ? "Select rank" : "Select alliance first")
    .setDisabled(!allianceId)
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildMemberRow(
  ownerDiscordUserId: string,
  allianceId?: number,
  rankCode?: number,
  page = 0,
  players: ClaimablePlayer[] = []
) {
  const hasContext = allianceId !== undefined && rankCode !== undefined;
  const hasPlayers = players.length > 0;
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${COMPONENT_PREFIXES.verifyMember}${ownerDiscordUserId}_${allianceId ?? 0}_${rankCode ?? -1}_${page}`)
    .setPlaceholder(
      !hasContext
        ? "Select alliance and rank first"
        : hasPlayers
          ? "Select your player"
          : "No unlinked players found for this rank"
    )
    .setDisabled(!hasContext || !hasPlayers)
    .addOptions(
      hasPlayers
        ? players.map((player) =>
            new StringSelectMenuOptionBuilder().setLabel(player.playerName).setValue(String(player.playerId))
          )
        : [new StringSelectMenuOptionBuilder().setLabel("No players available").setValue("none")]
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildPagingRow(
  ownerDiscordUserId: string,
  allianceId?: number,
  rankCode?: number,
  page = 0,
  hasNextPage = false
) {
  const hasContext = allianceId !== undefined && rankCode !== undefined;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${COMPONENT_PREFIXES.verifyPage}${ownerDiscordUserId}_prev_${allianceId ?? 0}_${rankCode ?? -1}_${page}`
      )
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasContext || page <= 0),
    new ButtonBuilder()
      .setCustomId(
        `${COMPONENT_PREFIXES.verifyPage}${ownerDiscordUserId}_next_${allianceId ?? 0}_${rankCode ?? -1}_${page}`
      )
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasContext || !hasNextPage)
  );
}

function buildVisitorRow(ownerDiscordUserId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COMPONENT_PREFIXES.verifyVisitor}${ownerDiscordUserId}_go`)
      .setLabel("Just Visiting, Not Joining Alliance")
      .setStyle(ButtonStyle.Primary)
  );
}

function getAllianceLabel(allianceId?: number) {
  if (allianceId === 530061) {
    return "Dark Warriors";
  }
  if (allianceId === 10061) {
    return "La Muerte";
  }
  return null;
}

function getRankLabel(rankCode?: number) {
  if (rankCode === undefined) {
    return null;
  }
  return ALLIANCE_RANKS[rankCode as keyof typeof ALLIANCE_RANKS] ?? null;
}

function buildVerificationContent(allianceId?: number, rankCode?: number, page = 0, playersCount = 0) {
  const allianceLabel = getAllianceLabel(allianceId);
  const rankLabel = getRankLabel(rankCode);
  const status =
    allianceLabel && rankLabel
      ? `\n\nSelected: ${allianceLabel} • ${rankLabel}`
      : allianceLabel
        ? `\n\nSelected alliance: ${allianceLabel}`
        : "";
  const pageNote = allianceLabel && rankLabel && playersCount > 0 ? `\nPlayers shown: ${playersCount}` : "";

  return (
    `Hey there, friend. Let's get you ID'd and on your way.\n` +
    `Select your alliance below then your rank and player.${status}${pageNote}\n` +
    `\n` +
    `Leadership will be by shortly to verify.`
  );
}

function buildVerificationComponents(
  ownerDiscordUserId: string,
  allianceId?: number,
  rankCode?: number,
  page = 0,
  players: ClaimablePlayer[] = [],
  hasNextPage = false
): Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>> {
  return [
    buildAllianceRow(ownerDiscordUserId, allianceId) as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
    buildRankRow(ownerDiscordUserId, allianceId, rankCode) as ActionRowBuilder<
      ButtonBuilder | StringSelectMenuBuilder
    >,
    buildMemberRow(ownerDiscordUserId, allianceId, rankCode, page, players) as ActionRowBuilder<
      ButtonBuilder | StringSelectMenuBuilder
    >,
    buildPagingRow(ownerDiscordUserId, allianceId, rankCode, page, hasNextPage) as ActionRowBuilder<
      ButtonBuilder | StringSelectMenuBuilder
    >,
    buildVisitorRow(ownerDiscordUserId) as ActionRowBuilder<
      ButtonBuilder | StringSelectMenuBuilder
    >
  ];
}

function buildLeadershipDecisionComponents(claimId: number, threadId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${COMPONENT_PREFIXES.leadClaimApprove}${claimId}_${threadId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${COMPONENT_PREFIXES.leadClaimDeny}${claimId}_${threadId}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

export function createDiscordClient(config: AppConfig, logger: AppLogger, handlers: DiscordHandlers) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
  });

  const leadershipRoleIds = new Set<string>([
    config.roleIds.leader,
    config.roleIds.deputy,
    config.roleIds.warMarshall,
    config.roleIds.treasurer,
    config.roleIds.diplomat,
    config.roleIds.recruiter
  ]);

  async function actorIsLeadership(discordUserId: string): Promise<boolean> {
    const guild = await client.guilds.fetch(config.discord.guildId);
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      return false;
    }
    return member.roles.cache.some((role) => leadershipRoleIds.has(role.id));
  }

  client.once(Events.ClientReady, async () => {
    logger.info("Discord client connected");
    const rest = new REST({ version: "10" }).setToken(config.discord.botToken);
    await rest.put(Routes.applicationGuildCommands(client.user!.id, config.discord.guildId), {
      body: COMMAND_DEFINITIONS
    });
    logger.info({ count: COMMAND_DEFINITIONS.length }, "Registered slash commands");
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await handlers.onMemberJoin(member);
    } catch (error) {
      logger.error({ error, memberId: member.id }, "GuildMemberAdd handler failed");
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const resolved = member.partial ? await member.fetch().catch(() => null) : member;
      if (resolved) {
        await handlers.onMemberLeave(resolved);
      }
    } catch (error) {
      logger.error({ error, memberId: member.id }, "GuildMemberRemove handler failed");
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await handleDiscordInteractionCreate(interaction, {
      logger,
      actorIsLeadership,
      chatHandlers: handlers,
      componentHandlers: handlers,
      componentHelpers: {
        buildVerificationContent,
        buildVerificationComponents,
        closeVerificationThreadById,
        postLeadershipClaimReview
      },
      leadershipChannelId: config.discord.leadershipChannelId,
      verificationParentChannelId: config.discord.verificationParentChannelId
    });
  });

  async function createVerificationThreadForMember(member: GuildMember) {
    const parent = await client.channels.fetch(config.discord.verificationParentChannelId);
    if (!parent) {
      logger.warn("Verification parent channel not found; skipping thread creation");
      return;
    }
    if (parent.type === ChannelType.GuildForum) {
      await parent.threads.create({
        name: buildVerificationThreadName(member.user.username),
        message: {
          content: buildVerificationContent(),
          components: buildVerificationComponents(member.id)
        },
        reason: "Auto-create verification thread on member join"
      });
      return;
    }
    if (parent.type === ChannelType.GuildText) {
      const thread = await parent.threads.create({
        name: buildVerificationThreadName(member.user.username),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        type: ChannelType.PrivateThread,
        reason: "Auto-create verification thread on member join"
      });
      await thread.members.add(member.id).catch(() => {
        logger.warn({ memberId: member.id }, "Could not add member to private verification thread");
      });
      await thread.send({
        content: buildVerificationContent(),
        components: buildVerificationComponents(member.id)
      });
      return;
    }
    logger.warn({ channelType: parent.type }, "Unsupported verification parent channel type");
  }

  async function postLeadershipClaimReview(claim: ClaimSubmission, threadId: string) {
    const leadershipChannel = await client.channels.fetch(config.discord.leadershipChannelId);
    if (!leadershipChannel || !leadershipChannel.isTextBased() || !("send" in leadershipChannel)) {
      logger.warn("Leadership channel not found or not text-based; could not post claim review");
      return;
    }
    await leadershipChannel.send({
      content:
        `New claim submitted.\n` +
        `\n` +
        `Claim ID: ${claim.claimId}\n` +
        `Discord User: <@${claim.discordUserId}>\n` +
        `Player: ${claim.playerName} (${claim.playerId})`,
      components: buildLeadershipDecisionComponents(claim.claimId, threadId)
    });
  }

  async function closeVerificationThreadById(threadId: string, reason: string) {
    const channel = await client.channels.fetch(threadId).catch(() => null);
    if (channel?.isThread()) {
      await channel.delete(reason).catch(() => null);
    }
  }

  async function deleteVerificationThreadForUser(discordUserId: string, reason: string, username?: string) {
    const parent = await client.channels.fetch(config.discord.verificationParentChannelId).catch(() => null);
    if (!parent || !("threads" in parent)) {
      return;
    }
    const targetName = username ? buildVerificationThreadName(username) : null;
    const active = await parent.threads.fetchActive();
    for (const [, thread] of active.threads) {
      if (targetName && thread.name === targetName) {
        await thread.delete(reason).catch(() => null);
        continue;
      }
      if (thread.ownerId === discordUserId || thread.members.cache.has(discordUserId)) {
        await thread.delete(reason).catch(() => null);
      }
    }
  }

  return {
    client,
    start: async () => {
      await client.login(config.discord.botToken);
    },
    createVerificationThreadForMember,
    deleteVerificationThreadForUser
  };
}
