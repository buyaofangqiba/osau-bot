import type { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ComponentRouteResult } from "./componentRouting.js";
import type { ClaimSubmission, ClaimablePlayer } from "../services/verificationService.js";

export interface ComponentExecutorHandlers {
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

export interface ComponentExecutorInteraction {
  userId: string;
  channelId: string;
  isThreadChannel: boolean;
  reply(content: string): Promise<void>;
  update(content: string, components: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>>): Promise<void>;
  deleteThread(reason: string): Promise<void>;
}

export interface ComponentExecutorHelpers {
  buildVerificationContent(
    allianceId?: number,
    rankCode?: number,
    page?: number,
    playersCount?: number
  ): string;
  buildVerificationComponents(
    ownerDiscordUserId: string,
    allianceId?: number,
    rankCode?: number,
    page?: number,
    players?: ClaimablePlayer[],
    hasNextPage?: boolean
  ): Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>>;
  closeVerificationThreadById(threadId: string, reason: string): Promise<void>;
  postLeadershipClaimReview(claim: ClaimSubmission, threadId: string): Promise<void>;
}

export async function executeComponentRoute(
  route: ComponentRouteResult,
  interaction: ComponentExecutorInteraction,
  handlers: ComponentExecutorHandlers,
  helpers: ComponentExecutorHelpers
): Promise<void> {
  if (route.type === "lead_claim_approve") {
    const approved = await handlers.onApproveClaim(route.claimId, interaction.userId);
    if (!approved) {
      await interaction.reply("Claim is no longer pending.");
      return;
    }
    await helpers.closeVerificationThreadById(route.threadId, "Claim approved");
    await interaction.update(`Claim approved by <@${interaction.userId}> for <@${approved.discordUserId}>.`, []);
    return;
  }

  if (route.type === "lead_claim_deny") {
    const denied = await handlers.onDenyClaim(route.claimId, interaction.userId);
    if (!denied) {
      await interaction.reply("Claim is no longer pending.");
      return;
    }
    await helpers.closeVerificationThreadById(route.threadId, "Claim denied");
    await interaction.update(`Claim denied by <@${interaction.userId}> for <@${denied.discordUserId}>.`, []);
    return;
  }

  if (route.type === "verify_visitor") {
    if (!interaction.isThreadChannel) {
      return;
    }
    await handlers.onJustVisiting(interaction.userId);
    await interaction.reply("Marked as just visiting. Closing verification thread.");
    await interaction.deleteThread("User selected just visiting");
    return;
  }

  if (route.type === "verify_alliance") {
    await interaction.update(
      helpers.buildVerificationContent(route.allianceId),
      helpers.buildVerificationComponents(route.ownerDiscordUserId, route.allianceId)
    );
    return;
  }

  if (route.type === "verify_rank") {
    const { players, hasNextPage } = await handlers.getClaimablePlayers(route.allianceId, route.rankCode, 0);
    await interaction.update(
      helpers.buildVerificationContent(route.allianceId, route.rankCode, 0, players.length),
      helpers.buildVerificationComponents(route.ownerDiscordUserId, route.allianceId, route.rankCode, 0, players, hasNextPage)
    );
    return;
  }

  if (route.type === "verify_page") {
    const nextPage = route.direction === "next" ? route.page + 1 : Math.max(0, route.page - 1);
    const { players, hasNextPage } = await handlers.getClaimablePlayers(route.allianceId, route.rankCode, nextPage);
    await interaction.update(
      helpers.buildVerificationContent(route.allianceId, route.rankCode, nextPage, players.length),
      helpers.buildVerificationComponents(route.ownerDiscordUserId, route.allianceId, route.rankCode, nextPage, players, hasNextPage)
    );
    return;
  }

  if (route.type === "verify_member") {
    if (!interaction.isThreadChannel) {
      return;
    }
    const claim = await handlers.onClaimSubmit(interaction.userId, route.selectedPlayerId);
    await helpers.postLeadershipClaimReview(claim, interaction.channelId);
    await interaction.update("Claim submitted for leadership review. This thread will be closed after approval or denial.", []);
  }
}
