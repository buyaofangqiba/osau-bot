import { describe, expect, it, vi } from "vitest";
import { handleDiscordInteractionCreate } from "../src/discord/clientInteractionHandler.js";

function createDeps(overrides?: Partial<any>) {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    actorIsLeadership: vi.fn().mockResolvedValue(true),
    chatHandlers: {
      onManualSyncByActor: vi.fn().mockResolvedValue(undefined),
      onLinkSet: vi.fn().mockResolvedValue("linked"),
      onLinkRemove: vi.fn().mockResolvedValue("removed")
    },
    componentHandlers: {
      onJustVisiting: vi.fn().mockResolvedValue(undefined),
      getClaimablePlayers: vi.fn().mockResolvedValue({ players: [], hasNextPage: false }),
      onClaimSubmit: vi.fn().mockResolvedValue({ claimId: 1, discordUserId: "u", playerId: 1, playerName: "A" }),
      onApproveClaim: vi.fn().mockResolvedValue(null),
      onDenyClaim: vi.fn().mockResolvedValue(null)
    },
    componentHelpers: {
      buildVerificationContent: vi.fn().mockReturnValue("content"),
      buildVerificationComponents: vi.fn().mockReturnValue([]),
      closeVerificationThreadById: vi.fn().mockResolvedValue(undefined),
      postLeadershipClaimReview: vi.fn().mockResolvedValue(undefined)
    },
    leadershipChannelId: "lead",
    verificationParentChannelId: "verify-parent",
    ...overrides
  };
}

describe("clientInteractionHandler", () => {
  it("rejects chat commands for non-leadership users", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      id: "i1",
      user: { id: "user-1" },
      replied: false,
      deferred: false,
      isRepliable: () => true,
      isChatInputCommand: () => true,
      isButton: () => false,
      isStringSelectMenu: () => false,
      options: {
        getSubcommand: vi.fn(),
        getString: vi.fn(),
        getUser: vi.fn()
      },
      reply
    } as any;
    const deps = createDeps({
      actorIsLeadership: vi.fn().mockResolvedValue(false)
    });

    await handleDiscordInteractionCreate(interaction, deps);

    expect(reply).toHaveBeenCalledWith({
      content: "You do not have permission to run this command.",
      flags: expect.any(Number)
    });
  });

  it("executes sync-now chat route for leadership user", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      id: "i2",
      user: { id: "leader-1" },
      replied: false,
      deferred: false,
      isRepliable: () => true,
      isChatInputCommand: () => true,
      isButton: () => false,
      isStringSelectMenu: () => false,
      commandName: "sync",
      options: {
        getSubcommand: vi.fn().mockReturnValue("now"),
        getString: vi.fn().mockReturnValue(null),
        getUser: vi.fn().mockReturnValue(null)
      },
      reply
    } as any;
    const deps = createDeps();

    await handleDiscordInteractionCreate(interaction, deps);

    expect(deps.chatHandlers.onManualSyncByActor).toHaveBeenCalledWith("leader-1");
    expect(reply).toHaveBeenCalledWith({
      content: "Manual sync started.",
      flags: expect.any(Number)
    });
  });

  it("returns component route error as ephemeral reply", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      id: "i3",
      user: { id: "intruder" },
      channelId: "thread-1",
      customId: "verify_visitor_owner_go",
      channel: {
        isThread: () => true,
        parentId: "verify-parent",
        delete: vi.fn()
      },
      replied: false,
      deferred: false,
      isRepliable: () => true,
      isChatInputCommand: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      reply,
      update: vi.fn()
    } as any;

    await handleDiscordInteractionCreate(interaction, createDeps());

    expect(reply).toHaveBeenCalledWith({
      content: "Only the owner can use these controls.",
      flags: expect.any(Number)
    });
  });

  it("logs and sends generic fallback when handler throws", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      id: "i4",
      user: { id: "leader-1" },
      replied: false,
      deferred: false,
      isRepliable: () => true,
      isChatInputCommand: () => true,
      isButton: () => false,
      isStringSelectMenu: () => false,
      commandName: "sync",
      options: {
        getSubcommand: vi.fn().mockReturnValue("now"),
        getString: vi.fn().mockReturnValue(null),
        getUser: vi.fn().mockReturnValue(null)
      },
      reply
    } as any;
    const deps = createDeps({
      actorIsLeadership: vi.fn().mockRejectedValue(new Error("guild fetch failed"))
    });

    await handleDiscordInteractionCreate(interaction, deps);

    expect(deps.logger.error).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith({
      content: "Something went wrong while processing this action.",
      flags: expect.any(Number)
    });
  });
});
