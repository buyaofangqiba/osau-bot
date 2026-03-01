import type { RoutedChatCommand } from "./commandRouting.js";

export interface ChatCommandExecutorHandlers {
  onManualSyncByActor(discordUserId: string): Promise<void>;
  onLinkSet(actorDiscordUserId: string, playerName: string, targetDiscordUserId: string): Promise<string>;
  onLinkRemove(actorDiscordUserId: string, playerName: string): Promise<string>;
}

export interface ChatCommandExecutorInteraction {
  actorDiscordUserId: string;
  reply(content: string): Promise<void>;
}

export async function executeChatCommandRoute(
  route: RoutedChatCommand,
  interaction: ChatCommandExecutorInteraction,
  handlers: ChatCommandExecutorHandlers
): Promise<void> {
  if (route.type === "sync_now") {
    await handlers.onManualSyncByActor(interaction.actorDiscordUserId);
    await interaction.reply("Manual sync started.");
    return;
  }

  if (route.type === "link_set") {
    const message = await handlers.onLinkSet(
      interaction.actorDiscordUserId,
      route.playerName,
      route.targetDiscordUserId
    );
    await interaction.reply(message);
    return;
  }

  if (route.type === "link_remove") {
    const message = await handlers.onLinkRemove(interaction.actorDiscordUserId, route.playerName);
    await interaction.reply(message);
    return;
  }

  await interaction.reply("Command scaffolding only: not yet implemented.");
}
