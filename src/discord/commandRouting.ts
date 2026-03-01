export type RoutedChatCommand =
  | { type: "sync_now" }
  | { type: "link_set"; playerName: string; targetDiscordUserId: string }
  | { type: "link_remove"; playerName: string }
  | { type: "unknown" };

export interface ChatCommandRouteInput {
  commandName: string;
  subcommand: string | null;
  playerName?: string | null;
  targetDiscordUserId?: string | null;
}

export interface ClaimActionPermissionInput {
  channelId: string;
  leadershipChannelId: string;
  actorIsLeadership: boolean;
}

export type ClaimActionPermissionResult =
  | { ok: true }
  | { ok: false; reason: "wrong_channel" | "not_leadership" };

export function routeChatCommand(input: ChatCommandRouteInput): RoutedChatCommand {
  if (input.commandName === "sync" && input.subcommand === "now") {
    return { type: "sync_now" };
  }

  if (input.commandName === "link" && input.subcommand === "set") {
    if (!input.playerName || !input.targetDiscordUserId) {
      return { type: "unknown" };
    }
    return {
      type: "link_set",
      playerName: input.playerName,
      targetDiscordUserId: input.targetDiscordUserId
    };
  }

  if (input.commandName === "link" && input.subcommand === "remove") {
    if (!input.playerName) {
      return { type: "unknown" };
    }
    return {
      type: "link_remove",
      playerName: input.playerName
    };
  }

  return { type: "unknown" };
}

export function getClaimActionPermission(input: ClaimActionPermissionInput): ClaimActionPermissionResult {
  if (input.channelId !== input.leadershipChannelId) {
    return { ok: false, reason: "wrong_channel" };
  }
  if (!input.actorIsLeadership) {
    return { ok: false, reason: "not_leadership" };
  }
  return { ok: true };
}
