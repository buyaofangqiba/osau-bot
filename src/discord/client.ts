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
import type { ClaimablePlayer, ClaimSubmission } from "../services/verificationService.js";
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
const VERIFY_RESET_ID = "verify_reset";
const LEAD_CLAIM_APPROVE_PREFIX = "lead_claim_approve_";
const LEAD_CLAIM_DENY_PREFIX = "lead_claim_deny_";

function parseVerificationOwnerIdFromThreadName(name: string): string | null {
  const parts = name.split("-");
  const maybeUserId = parts[parts.length - 1] ?? "";
  if (/^\d{16,22}$/.test(maybeUserId)) {
    return maybeUserId;
  }
  return null;
}

function isVerificationThreadForUser(memberId: string, channelName: string): boolean {
  const ownerId = parseVerificationOwnerIdFromThreadName(channelName);
  return ownerId === memberId;
}

function buildAllianceRow(selectedAllianceId?: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${VERIFY_ALLIANCE_PREFIX}530061`)
      .setLabel("Dark Warriors")
      .setStyle(selectedAllianceId === 530061 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${VERIFY_ALLIANCE_PREFIX}10061`)
      .setLabel("La Muerte")
      .setStyle(selectedAllianceId === 10061 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${VERIFY_ALLIANCE_PREFIX}visitor`)
      .setLabel("Just Visiting")
      .setStyle(ButtonStyle.Danger)
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

function buildRankRow(allianceId?: number, selectedRankCode?: number) {
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
    .setCustomId(allianceId ? `${VERIFY_RANK_PREFIX}${allianceId}` : `${VERIFY_RANK_PREFIX}disabled`)
    .setPlaceholder(allianceId ? "Select rank" : "Select alliance first")
    .setDisabled(!allianceId)
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildMemberRow(
  allianceId?: number,
  rankCode?: number,
  page = 0,
  players: ClaimablePlayer[] = []
) {
  const hasContext = allianceId !== undefined && rankCode !== undefined;
  const hasPlayers = players.length > 0;
  const select = new StringSelectMenuBuilder()
    .setCustomId(
      hasContext ? `${VERIFY_MEMBER_PREFIX}${allianceId}_${rankCode}_${page}` : `${VERIFY_MEMBER_PREFIX}disabled`
    )
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
        ? players.map((player) => new StringSelectMenuOptionBuilder().setLabel(player.playerName).setValue(String(player.playerId)))
        : [new StringSelectMenuOptionBuilder().setLabel("No players available").setValue("none")]
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildPagingRow(allianceId?: number, rankCode?: number, page = 0, hasNextPage = false) {
  const hasContext = allianceId !== undefined && rankCode !== undefined;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        hasContext ? `${VERIFY_PAGE_PREFIX}prev_${allianceId}_${rankCode}_${page}` : `${VERIFY_PAGE_PREFIX}prev_disabled`
      )
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasContext || page <= 0),
    new ButtonBuilder()
      .setCustomId(
        hasContext ? `${VERIFY_PAGE_PREFIX}next_${allianceId}_${rankCode}_${page}` : `${VERIFY_PAGE_PREFIX}next_disabled`
      )
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasContext || !hasNextPage)
  );
}

function buildResetRow(allianceId?: number, rankCode?: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIFY_RESET_ID)
      .setLabel("Reset")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(allianceId === undefined && rankCode === undefined)
  );
}

function buildVerificationContent(
  allianceId?: number,
  rankCode?: number,
  page = 0,
  playersCount = 0
) {
  const allianceLabel = getAllianceLabel(allianceId);
  const rankLabel = getRankLabel(rankCode);
  const step = allianceId === undefined ? 1 : rankCode === undefined ? 2 : 3;
  const pageLabel = step === 3 ? `\n- Page: ${page + 1}` : "";
  const playerLabel = step === 3 ? `\n- Players on page: ${playersCount}` : "";

  return (
    `Verification (Step ${step}/3)\n` +
    `1) Choose alliance (buttons)\n` +
    `2) Choose rank (dropdown)\n` +
    `3) Choose your player (dropdown)\n\n` +
    `Current selection:\n` +
    `- Alliance: ${allianceLabel ?? "Not selected"}\n` +
    `- Rank: ${rankLabel ?? "Not selected"}` +
    pageLabel +
    playerLabel +
    `\n\nOnly you can use these controls in this thread.`
  );
}

function buildVerificationComponents(
  allianceId?: number,
  rankCode?: number,
  page = 0,
  players: ClaimablePlayer[] = [],
  hasNextPage = false
): Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>> {
  return [
    buildAllianceRow(allianceId) as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
    buildRankRow(allianceId, rankCode) as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
    buildMemberRow(allianceId, rankCode, page, players) as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
    buildPagingRow(allianceId, rankCode, page, hasNextPage) as ActionRowBuilder<
      ButtonBuilder | StringSelectMenuBuilder
    >,
    buildResetRow(allianceId, rankCode) as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>
  ];
}

function buildLeadershipDecisionComponents(claimId: number) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LEAD_CLAIM_APPROVE_PREFIX}${claimId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${LEAD_CLAIM_DENY_PREFIX}${claimId}`)
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
    await handlers.onMemberJoin(member);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const resolved = member.partial ? await member.fetch().catch(() => null) : member;
    if (resolved) {
      await handlers.onMemberLeave(resolved);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
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
      const claimId = Number(interaction.customId.replace(LEAD_CLAIM_APPROVE_PREFIX, ""));
      if (!Number.isFinite(claimId)) {
        await interaction.reply({ content: "Invalid claim id.", ephemeral: true });
        return;
      }
      const approved = await handlers.onApproveClaim(claimId, interaction.user.id);
      if (!approved) {
        await interaction.reply({ content: "Claim is no longer pending.", ephemeral: true });
        return;
      }
      await closeVerificationThreadForUser(approved.discordUserId, "Claim approved");
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
      const claimId = Number(interaction.customId.replace(LEAD_CLAIM_DENY_PREFIX, ""));
      if (!Number.isFinite(claimId)) {
        await interaction.reply({ content: "Invalid claim id.", ephemeral: true });
        return;
      }
      const denied = await handlers.onDenyClaim(claimId, interaction.user.id);
      if (!denied) {
        await interaction.reply({ content: "Claim is no longer pending.", ephemeral: true });
        return;
      }
      await closeVerificationThreadForUser(denied.discordUserId, "Claim denied");
      await interaction.update({
        content: `Claim denied by <@${interaction.user.id}> for <@${denied.discordUserId}>.`,
        components: []
      });
      return;
    }

    const interactionChannel = interaction.channel;
    if (!interactionChannel?.isThread() || !isVerificationThreadForUser(interaction.user.id, interactionChannel.name)) {
      await interaction.reply({
        content: "Only the member who owns this verification thread can use these controls.",
        ephemeral: true
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(VERIFY_ALLIANCE_PREFIX)) {
      const selectedAlliance = interaction.customId.replace(VERIFY_ALLIANCE_PREFIX, "");
      if (selectedAlliance === "visitor") {
        await handlers.onJustVisiting(interaction.user.id);
        await interaction.reply({ content: "Marked as just visiting. Closing verification thread.", ephemeral: true });
        await interactionChannel.delete("User selected just visiting");
        return;
      }

      const allianceId = Number(selectedAlliance);
      await interaction.update({
        content: buildVerificationContent(allianceId),
        components: buildVerificationComponents(allianceId)
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === VERIFY_RESET_ID) {
      await interaction.update({
        content: buildVerificationContent(),
        components: buildVerificationComponents()
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(VERIFY_RANK_PREFIX)) {
      const allianceIdRaw = interaction.customId.replace(VERIFY_RANK_PREFIX, "");
      if (allianceIdRaw === "disabled") {
        await interaction.reply({ content: "Select an alliance first.", ephemeral: true });
        return;
      }
      const allianceId = Number(allianceIdRaw);
      const rankCode = Number(interaction.values[0]);
      const { players, hasNextPage } = await handlers.getClaimablePlayers(allianceId, rankCode, 0);

      await interaction.update({
        content: buildVerificationContent(allianceId, rankCode, 0, players.length),
        components: buildVerificationComponents(allianceId, rankCode, 0, players, hasNextPage)
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(VERIFY_PAGE_PREFIX)) {
      const payload = interaction.customId.replace(VERIFY_PAGE_PREFIX, "");
      if (payload.endsWith("disabled")) {
        await interaction.reply({ content: "Select alliance and rank first.", ephemeral: true });
        return;
      }

      const [direction, allianceIdRaw, rankCodeRaw, pageRaw] = payload.split("_");
      const allianceId = Number(allianceIdRaw);
      const rankCode = Number(rankCodeRaw);
      const page = Number(pageRaw);
      const nextPage = direction === "next" ? page + 1 : Math.max(0, page - 1);

      const { players, hasNextPage } = await handlers.getClaimablePlayers(allianceId, rankCode, nextPage);
      await interaction.update({
        content: buildVerificationContent(allianceId, rankCode, nextPage, players.length),
        components: buildVerificationComponents(allianceId, rankCode, nextPage, players, hasNextPage)
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(VERIFY_MEMBER_PREFIX)) {
      const payload = interaction.customId.replace(VERIFY_MEMBER_PREFIX, "");
      if (payload === "disabled") {
        await interaction.reply({ content: "Select alliance and rank first.", ephemeral: true });
        return;
      }
      const selectedPlayerId = Number(interaction.values[0]);
      if (!Number.isFinite(selectedPlayerId)) {
        await interaction.reply({ content: "Invalid player selection.", ephemeral: true });
        return;
      }
      const claim = await handlers.onClaimSubmit(interaction.user.id, selectedPlayerId);
      await postLeadershipClaimReview(claim);
      await interaction.update({
        content:
          "Claim submitted for leadership review. This thread will be closed after approval or denial.",
        components: []
      });
      return;
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
        name: `verify-${member.user.username}-${member.user.id}`,
        message: {
          content: buildVerificationContent(),
          components: buildVerificationComponents()
        },
        reason: "Auto-create verification thread on member join"
      });
      return;
    }
    if (parent.type === ChannelType.GuildText) {
      const thread = await parent.threads.create({
        name: `verify-${member.user.username}-${member.user.id}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        type: ChannelType.PrivateThread,
        reason: "Auto-create verification thread on member join"
      });
      await thread.members.add(member.id).catch(() => {
        logger.warn({ memberId: member.id }, "Could not add member to private verification thread");
      });
      await thread.send(
        {
          content: buildVerificationContent(),
          components: buildVerificationComponents()
        }
      );
      return;
    }
    logger.warn({ channelType: parent.type }, "Unsupported verification parent channel type");
  }

  async function postLeadershipClaimReview(claim: ClaimSubmission) {
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
      components: buildLeadershipDecisionComponents(claim.claimId)
    });
  }

  async function closeVerificationThreadForUser(discordUserId: string, reason: string) {
    const parent = await client.channels.fetch(config.discord.verificationParentChannelId).catch(() => null);
    if (!parent || !("threads" in parent)) {
      return;
    }
    const active = await parent.threads.fetchActive();
    for (const [, thread] of active.threads) {
      if (isVerificationThreadForUser(discordUserId, thread.name)) {
        await thread.delete(reason).catch(() => null);
      }
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
