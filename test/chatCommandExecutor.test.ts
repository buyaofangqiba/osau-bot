import { describe, expect, it, vi } from "vitest";
import type { RoutedChatCommand } from "../src/discord/commandRouting.js";
import { executeChatCommandRoute } from "../src/discord/chatCommandExecutor.js";

function createDeps() {
  const interaction = {
    actorDiscordUserId: "actor-1",
    reply: vi.fn().mockResolvedValue(undefined)
  };

  const handlers = {
    onManualSyncByActor: vi.fn().mockResolvedValue(undefined),
    onLinkSet: vi.fn().mockResolvedValue("linked"),
    onLinkRemove: vi.fn().mockResolvedValue("removed")
  };

  return { interaction, handlers };
}

describe("chatCommandExecutor", () => {
  it("executes sync now route", async () => {
    const { interaction, handlers } = createDeps();
    const route: RoutedChatCommand = { type: "sync_now" };

    await executeChatCommandRoute(route, interaction, handlers);

    expect(handlers.onManualSyncByActor).toHaveBeenCalledWith("actor-1");
    expect(interaction.reply).toHaveBeenCalledWith("Manual sync started.");
  });

  it("executes link set route", async () => {
    const { interaction, handlers } = createDeps();
    const route: RoutedChatCommand = {
      type: "link_set",
      playerName: "Alpha",
      targetDiscordUserId: "target-1"
    };

    await executeChatCommandRoute(route, interaction, handlers);

    expect(handlers.onLinkSet).toHaveBeenCalledWith("actor-1", "Alpha", "target-1");
    expect(interaction.reply).toHaveBeenCalledWith("linked");
  });

  it("executes link remove route", async () => {
    const { interaction, handlers } = createDeps();
    const route: RoutedChatCommand = {
      type: "link_remove",
      playerName: "Alpha"
    };

    await executeChatCommandRoute(route, interaction, handlers);

    expect(handlers.onLinkRemove).toHaveBeenCalledWith("actor-1", "Alpha");
    expect(interaction.reply).toHaveBeenCalledWith("removed");
  });

  it("responds with scaffold message for unknown route", async () => {
    const { interaction, handlers } = createDeps();
    const route: RoutedChatCommand = { type: "unknown" };

    await executeChatCommandRoute(route, interaction, handlers);

    expect(interaction.reply).toHaveBeenCalledWith("Command scaffolding only: not yet implemented.");
  });
});
