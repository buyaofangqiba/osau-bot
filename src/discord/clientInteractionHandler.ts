import { MessageFlags, type ActionRowBuilder, type ButtonBuilder, type StringSelectMenuBuilder } from "discord.js";
import { routeChatCommand } from "./commandRouting.js";
import { routeComponentInteraction } from "./componentRouting.js";
import { executeChatCommandRoute, type ChatCommandExecutorHandlers } from "./chatCommandExecutor.js";
import {
  executeComponentRoute,
  type ComponentExecutorHandlers,
  type ComponentExecutorHelpers
} from "./componentRouteExecutor.js";
import type { AppLogger } from "../logger.js";
import type { ClaimablePlayer } from "../services/verificationService.js";

type ComponentBuilders = Pick<
  ComponentExecutorHelpers,
  "buildVerificationContent" | "buildVerificationComponents"
>;

interface InteractionDeps {
  logger: AppLogger;
  actorIsLeadership(discordUserId: string): Promise<boolean>;
  chatHandlers: ChatCommandExecutorHandlers;
  componentHandlers: ComponentExecutorHandlers;
  componentHelpers: Omit<ComponentExecutorHelpers, keyof ComponentBuilders> & ComponentBuilders;
  leadershipChannelId: string;
  verificationParentChannelId: string;
}

export async function handleDiscordInteractionCreate(interaction: any, deps: InteractionDeps): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      if (!(await deps.actorIsLeadership(interaction.user.id))) {
        await interaction.reply({
          content: "You do not have permission to run this command.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const route = routeChatCommand({
        commandName: interaction.commandName,
        subcommand: interaction.options.getSubcommand(false),
        playerName: interaction.options.getString("player_name", false),
        targetDiscordUserId: interaction.options.getUser("user", false)?.id
      });

      await executeChatCommandRoute(
        route,
        {
          actorDiscordUserId: interaction.user.id,
          reply: async (content) => {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral });
          }
        },
        deps.chatHandlers
      );
      return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
      return;
    }

    const interactionChannel = interaction.channel;
    const isVerificationThread =
      interactionChannel?.isThread() === true &&
      interactionChannel.parentId === deps.verificationParentChannelId;
    const route = routeComponentInteraction({
      customId: interaction.customId,
      controlType: interaction.isButton() ? "button" : "select",
      actorDiscordUserId: interaction.user.id,
      channelId: interaction.channelId,
      leadershipChannelId: deps.leadershipChannelId,
      actorIsLeadership: await deps.actorIsLeadership(interaction.user.id),
      isVerificationThread,
      selectedValues: interaction.isStringSelectMenu() ? interaction.values : undefined
    });

    if (route.type === "ignore") {
      return;
    }
    if (route.type === "error") {
      await interaction.reply({ content: route.message, flags: MessageFlags.Ephemeral });
      return;
    }

    await executeComponentRoute(
      route,
      {
        userId: interaction.user.id,
        channelId: interaction.channelId,
        isThreadChannel: interactionChannel?.isThread() === true,
        reply: async (content) => {
          await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        },
        update: async (
          content: string,
          components: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>>
        ) => {
          await interaction.update({ content, components });
        },
        deleteThread: async (reason) => {
          if (interactionChannel?.isThread()) {
            await interactionChannel.delete(reason);
          }
        }
      },
      deps.componentHandlers,
      deps.componentHelpers
    );
  } catch (error) {
    deps.logger.error(
      {
        error,
        interactionId: interaction.id,
        customId: "customId" in interaction ? interaction.customId : undefined
      },
      "InteractionCreate handler failed"
    );
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Something went wrong while processing this action.", flags: MessageFlags.Ephemeral });
    }
  }
}

export type { InteractionDeps, ClaimablePlayer };
