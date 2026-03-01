import { describe, expect, it, vi } from "vitest";
import type { ComponentRouteResult } from "../src/discord/componentRouting.js";
import { executeComponentRoute } from "../src/discord/componentRouteExecutor.js";

function createDeps() {
  const interaction = {
    userId: "actor-1",
    channelId: "thread-1",
    isThreadChannel: true,
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deleteThread: vi.fn().mockResolvedValue(undefined)
  };

  const handlers = {
    onJustVisiting: vi.fn().mockResolvedValue(undefined),
    getClaimablePlayers: vi.fn().mockResolvedValue({
      players: [{ playerId: 1001, playerName: "Alpha" }],
      hasNextPage: false
    }),
    onClaimSubmit: vi.fn().mockResolvedValue({
      claimId: 7,
      discordUserId: "actor-1",
      playerId: 1001,
      playerName: "Alpha"
    }),
    onApproveClaim: vi.fn().mockResolvedValue({ discordUserId: "target-1" }),
    onDenyClaim: vi.fn().mockResolvedValue({ discordUserId: "target-2" })
  };

  const helpers = {
    buildVerificationContent: vi.fn().mockReturnValue("content"),
    buildVerificationComponents: vi.fn().mockReturnValue([]),
    closeVerificationThreadById: vi.fn().mockResolvedValue(undefined),
    postLeadershipClaimReview: vi.fn().mockResolvedValue(undefined)
  };

  return { interaction, handlers, helpers };
}

describe("componentRouteExecutor", () => {
  it("executes approve flow", async () => {
    const { interaction, handlers, helpers } = createDeps();
    const route: ComponentRouteResult = { type: "lead_claim_approve", claimId: 9, threadId: "thread-x" };

    await executeComponentRoute(route, interaction, handlers, helpers);

    expect(handlers.onApproveClaim).toHaveBeenCalledWith(9, "actor-1");
    expect(helpers.closeVerificationThreadById).toHaveBeenCalledWith("thread-x", "Claim approved");
    expect(interaction.update).toHaveBeenCalledWith("Claim approved by <@actor-1> for <@target-1>.", []);
  });

  it("executes visitor flow and deletes thread", async () => {
    const { interaction, handlers, helpers } = createDeps();
    const route: ComponentRouteResult = { type: "verify_visitor", ownerDiscordUserId: "actor-1" };

    await executeComponentRoute(route, interaction, handlers, helpers);

    expect(handlers.onJustVisiting).toHaveBeenCalledWith("actor-1");
    expect(interaction.reply).toHaveBeenCalledWith("Marked as just visiting. Closing verification thread.");
    expect(interaction.deleteThread).toHaveBeenCalledWith("User selected just visiting");
  });

  it("executes verify page flow with computed next page", async () => {
    const { interaction, handlers, helpers } = createDeps();
    const route: ComponentRouteResult = {
      type: "verify_page",
      ownerDiscordUserId: "actor-1",
      direction: "next",
      allianceId: 530061,
      rankCode: 0,
      page: 1
    };

    await executeComponentRoute(route, interaction, handlers, helpers);

    expect(handlers.getClaimablePlayers).toHaveBeenCalledWith(530061, 0, 2);
    expect(helpers.buildVerificationContent).toHaveBeenCalledWith(530061, 0, 2, 1);
    expect(helpers.buildVerificationComponents).toHaveBeenCalledWith(
      "actor-1",
      530061,
      0,
      2,
      [{ playerId: 1001, playerName: "Alpha" }],
      false
    );
    expect(interaction.update).toHaveBeenCalledWith("content", []);
  });

  it("executes verify member flow and posts leadership review", async () => {
    const { interaction, handlers, helpers } = createDeps();
    const route: ComponentRouteResult = {
      type: "verify_member",
      ownerDiscordUserId: "actor-1",
      selectedPlayerId: 1001
    };

    await executeComponentRoute(route, interaction, handlers, helpers);

    expect(handlers.onClaimSubmit).toHaveBeenCalledWith("actor-1", 1001);
    expect(helpers.postLeadershipClaimReview).toHaveBeenCalledWith(
      { claimId: 7, discordUserId: "actor-1", playerId: 1001, playerName: "Alpha" },
      "thread-1"
    );
    expect(interaction.update).toHaveBeenCalledWith(
      "Claim submitted for leadership review. This thread will be closed after approval or denial.",
      []
    );
  });
});
