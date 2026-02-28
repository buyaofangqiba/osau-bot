import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
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
import type { AppLogger } from "../logger.js";
import type { ClaimSubmission, ClaimablePlayer } from "../services/verificationService.js";
import { COMMAND_DEFINITIONS } from "./commands.js";

export interface DiscordHandlers {
  onManualSync(): Promise<void>;
  onRefresh(): Promise<void>;
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

const VERIFY_ALLIANCE_PREFIX = "verify_alliance_";
const VERIFY_RANK_PREFIX = "verify_rank_";
const VERIFY_MEMBER_PREFIX = "verify_member_";
const VERIFY_PAGE_PREFIX = "verify_page_";
const VERIFY_VISITOR_PREFIX = "verify_visitor_";
const LEAD_CLAIM_APPROVE_PREFIX = "lead_claim_approve_";
const LEAD_CLAIM_DENY_PREFIX = "lead_claim_deny_";

function toSafeUsername(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "member";
}

function buildVerificationThreadName(username: string): string {
  return `verify-${toSafeUsername(username)}`;
}

function parseOwnedCustomId(prefix: string, customId: string): { ownerDiscordUserId: string; rest: string } | null {
  if (!customId.startsWith(prefix)) {
    return null;
  }
  const body = customId.slice(prefix.length);
  const sepIndex = body.indexOf("_");
  if (sepIndex === -1) {
    return null;
  }
  return {
    ownerDiscordUserId: body.slice(0, sepIndex),
    rest: body.slice(sepIndex + 1)
  };
}

function buildAllianceRow(ownerDiscordUserId: string, selectedAllianceId?: number) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${VERIFY_ALLIANCE_PREFIX}${ownerDiscordUserId}_select`)
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
    .setCustomId(`${VERIFY_RANK_PREFIX}${ownerDiscordUserId}_${allianceId ?? 0}`)
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
    .setCustomId(`${VERIFY_MEMBER_PREFIX}${ownerDiscordUserId}_${allianceId ?? 0}_${rankCode ?? -1}_${page}`)
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
      .setCustomId(`${VERIFY_PAGE_PREFIX}${ownerDiscordUserId}_prev_${allianceId ?? 0}_${rankCode ?? -1}_${page}`)
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasContext || page <= 0),
    new ButtonBuilder()
      .setCustomId(`${VERIFY_PAGE_PREFIX}${ownerDiscordUserId}_next_${allianceId ?? 0}_${rankCode ?? -1}_${page}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasContext || !hasNextPage)
  );
}

function buildVisitorRow(ownerDiscordUserId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${VERIFY_VISITOR_PREFIX}${ownerDiscordUserId}_go`)
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
        .setCustomId(`${LEAD_CLAIM_APPROVE_PREFIX}${claimId}_${threadId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${LEAD_CLAIM_DENY_PREFIX}${claimId}_${threadId}`)
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
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "sync") {
          const subcommand = interaction.options.getSubcommand(false);
          if (subcommand === "now") {
            await handlers.onManualSync();
            await interaction.reply({ content: "Manual sync started.", ephemeral: true });
            return;
          }
        }
        if (interaction.commandName === "link") {
          const subcommand = interaction.options.getSubcommand(false);
          await interaction.reply({
            content: `Link subcommand '${subcommand ?? "unknown"}' is scaffolded and not implemented yet.`,
            ephemeral: true
          });
          return;
        }
        if (interaction.commandName === "refresh") {
          await handlers.onRefresh();
          await interaction.reply({ content: "Refresh started.", ephemeral: true });
          return;
        }
        await interaction.reply({ content: "Command scaffolding only: not yet implemented.", ephemeral: true });
        return;
      }

      if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith(LEAD_CLAIM_APPROVE_PREFIX)) {
        if (interaction.channelId !== config.discord.leadershipChannelId) {
          await interaction.reply({ content: "This action is only allowed in leadership channel.", ephemeral: true });
          return;
        }
        const payload = interaction.customId.slice(LEAD_CLAIM_APPROVE_PREFIX.length);
        const [claimIdRaw, threadId] = payload.split("_");
        const claimId = Number(claimIdRaw);
        if (!Number.isFinite(claimId) || !threadId) {
          await interaction.reply({ content: "Invalid claim payload.", ephemeral: true });
          return;
        }
        const approved = await handlers.onApproveClaim(claimId, interaction.user.id);
        if (!approved) {
          await interaction.reply({ content: "Claim is no longer pending.", ephemeral: true });
          return;
        }
        await closeVerificationThreadById(threadId, "Claim approved");
        await interaction.update({
          content: `Claim approved by <@${interaction.user.id}> for <@${approved.discordUserId}>.`,
          components: []
        });
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith(LEAD_CLAIM_DENY_PREFIX)) {
        if (interaction.channelId !== config.discord.leadershipChannelId) {
          await interaction.reply({ content: "This action is only allowed in leadership channel.", ephemeral: true });
          return;
        }
        const payload = interaction.customId.slice(LEAD_CLAIM_DENY_PREFIX.length);
        const [claimIdRaw, threadId] = payload.split("_");
        const claimId = Number(claimIdRaw);
        if (!Number.isFinite(claimId) || !threadId) {
          await interaction.reply({ content: "Invalid claim payload.", ephemeral: true });
          return;
        }
        const denied = await handlers.onDenyClaim(claimId, interaction.user.id);
        if (!denied) {
          await interaction.reply({ content: "Claim is no longer pending.", ephemeral: true });
          return;
        }
        await closeVerificationThreadById(threadId, "Claim denied");
        await interaction.update({
          content: `Claim denied by <@${interaction.user.id}> for <@${denied.discordUserId}>.`,
          components: []
        });
        return;
      }

      const interactionChannel = interaction.channel;
      if (
        !interactionChannel?.isThread() ||
        interactionChannel.parentId !== config.discord.verificationParentChannelId
      ) {
        return;
      }

      const customId = interaction.customId;

      if (interaction.isButton() && customId.startsWith(VERIFY_VISITOR_PREFIX)) {
        const parsed = parseOwnedCustomId(VERIFY_VISITOR_PREFIX, customId);
        if (!parsed || parsed.ownerDiscordUserId !== interaction.user.id) {
          await interaction.reply({ content: "Only the owner can use these controls.", ephemeral: true });
          return;
        }
        await handlers.onJustVisiting(interaction.user.id);
        await interaction.reply({ content: "Marked as just visiting. Closing verification thread.", ephemeral: true });
        await interactionChannel.delete("User selected just visiting");
        return;
      }

      if (interaction.isStringSelectMenu() && customId.startsWith(VERIFY_ALLIANCE_PREFIX)) {
        const parsed = parseOwnedCustomId(VERIFY_ALLIANCE_PREFIX, customId);
        if (!parsed || parsed.ownerDiscordUserId !== interaction.user.id) {
          await interaction.reply({ content: "Only the owner can use these controls.", ephemeral: true });
          return;
        }
        const allianceId = Number(interaction.values[0]);
        if (!Number.isFinite(allianceId)) {
          await interaction.reply({ content: "Invalid alliance selection.", ephemeral: true });
          return;
        }
        await interaction.update({
          content: buildVerificationContent(allianceId),
          components: buildVerificationComponents(parsed.ownerDiscordUserId, allianceId)
        });
        return;
      }

      if (interaction.isStringSelectMenu() && customId.startsWith(VERIFY_RANK_PREFIX)) {
        const parsed = parseOwnedCustomId(VERIFY_RANK_PREFIX, customId);
        if (!parsed || parsed.ownerDiscordUserId !== interaction.user.id) {
          await interaction.reply({ content: "Only the owner can use these controls.", ephemeral: true });
          return;
        }
        const allianceId = Number(parsed.rest);
        if (!Number.isFinite(allianceId) || allianceId === 0) {
          await interaction.reply({ content: "Select an alliance first.", ephemeral: true });
          return;
        }
        const rankCode = Number(interaction.values[0]);
        const { players, hasNextPage } = await handlers.getClaimablePlayers(allianceId, rankCode, 0);
        await interaction.update({
          content: buildVerificationContent(allianceId, rankCode, 0, players.length),
          components: buildVerificationComponents(parsed.ownerDiscordUserId, allianceId, rankCode, 0, players, hasNextPage)
        });
        return;
      }

      if (interaction.isButton() && customId.startsWith(VERIFY_PAGE_PREFIX)) {
        const parsed = parseOwnedCustomId(VERIFY_PAGE_PREFIX, customId);
        if (!parsed || parsed.ownerDiscordUserId !== interaction.user.id) {
          await interaction.reply({ content: "Only the owner can use these controls.", ephemeral: true });
          return;
        }
        const [direction, allianceIdRaw, rankCodeRaw, pageRaw] = parsed.rest.split("_");
        const allianceId = Number(allianceIdRaw);
        const rankCode = Number(rankCodeRaw);
        const page = Number(pageRaw);
        if (!Number.isFinite(allianceId) || !Number.isFinite(rankCode) || !Number.isFinite(page)) {
          await interaction.reply({ content: "Invalid page selection.", ephemeral: true });
          return;
        }
        const nextPage = direction === "next" ? page + 1 : Math.max(0, page - 1);
        const { players, hasNextPage } = await handlers.getClaimablePlayers(allianceId, rankCode, nextPage);
        await interaction.update({
          content: buildVerificationContent(allianceId, rankCode, nextPage, players.length),
          components: buildVerificationComponents(
            parsed.ownerDiscordUserId,
            allianceId,
            rankCode,
            nextPage,
            players,
            hasNextPage
          )
        });
        return;
      }

      if (interaction.isStringSelectMenu() && customId.startsWith(VERIFY_MEMBER_PREFIX)) {
        const parsed = parseOwnedCustomId(VERIFY_MEMBER_PREFIX, customId);
        if (!parsed || parsed.ownerDiscordUserId !== interaction.user.id) {
          await interaction.reply({ content: "Only the owner can use these controls.", ephemeral: true });
          return;
        }
        const selectedPlayerId = Number(interaction.values[0]);
        if (!Number.isFinite(selectedPlayerId)) {
          await interaction.reply({ content: "Invalid player selection.", ephemeral: true });
          return;
        }
        const claim = await handlers.onClaimSubmit(interaction.user.id, selectedPlayerId);
        await postLeadershipClaimReview(claim, interactionChannel.id);
        await interaction.update({
          content: "Claim submitted for leadership review. This thread will be closed after approval or denial.",
          components: []
        });
      }
    } catch (error) {
      logger.error(
        {
          error,
          interactionId: interaction.id,
          customId: "customId" in interaction ? interaction.customId : undefined
        },
        "InteractionCreate handler failed"
      );
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Something went wrong while processing this action.", ephemeral: true });
      }
    }
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

  return {
    client,
    start: async () => {
      await client.login(config.discord.botToken);
    },
    createVerificationThreadForMember
  };
}
