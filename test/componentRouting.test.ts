import { describe, expect, it } from "vitest";
import { routeComponentInteraction } from "../src/discord/componentRouting.js";

describe("componentRouting", () => {
  it("routes leadership approve action", () => {
    const route = routeComponentInteraction({
      customId: "lead_claim_approve_9_777",
      controlType: "button",
      actorDiscordUserId: "123",
      channelId: "lead",
      leadershipChannelId: "lead",
      actorIsLeadership: true,
      isVerificationThread: false
    });

    expect(route).toEqual({ type: "lead_claim_approve", claimId: 9, threadId: "777" });
  });

  it("rejects leadership action in wrong channel", () => {
    const route = routeComponentInteraction({
      customId: "lead_claim_approve_9_777",
      controlType: "button",
      actorDiscordUserId: "123",
      channelId: "general",
      leadershipChannelId: "lead",
      actorIsLeadership: true,
      isVerificationThread: false
    });

    expect(route).toEqual({
      type: "error",
      message: "This action is only allowed in leadership channel."
    });
  });

  it("rejects leadership action for non-leadership actor", () => {
    const route = routeComponentInteraction({
      customId: "lead_claim_deny_9_777",
      controlType: "button",
      actorDiscordUserId: "123",
      channelId: "lead",
      leadershipChannelId: "lead",
      actorIsLeadership: false,
      isVerificationThread: false
    });

    expect(route).toEqual({
      type: "error",
      message: "You do not have permission to deny claims."
    });
  });

  it("ignores non-verification controls that are not leadership claim actions", () => {
    const route = routeComponentInteraction({
      customId: "verify_member_123_530061_0_0",
      controlType: "select",
      actorDiscordUserId: "123",
      channelId: "thread",
      leadershipChannelId: "lead",
      actorIsLeadership: true,
      isVerificationThread: false,
      selectedValues: ["1001"]
    });

    expect(route).toEqual({ type: "ignore" });
  });

  it("routes alliance select in verification thread", () => {
    const route = routeComponentInteraction({
      customId: "verify_alliance_123_select",
      controlType: "select",
      actorDiscordUserId: "123",
      channelId: "thread",
      leadershipChannelId: "lead",
      actorIsLeadership: false,
      isVerificationThread: true,
      selectedValues: ["530061"]
    });

    expect(route).toEqual({
      type: "verify_alliance",
      ownerDiscordUserId: "123",
      allianceId: 530061
    });
  });

  it("rejects non-owner usage", () => {
    const route = routeComponentInteraction({
      customId: "verify_visitor_123_go",
      controlType: "button",
      actorDiscordUserId: "999",
      channelId: "thread",
      leadershipChannelId: "lead",
      actorIsLeadership: false,
      isVerificationThread: true
    });

    expect(route).toEqual({
      type: "error",
      message: "Only the owner can use these controls."
    });
  });

  it("routes rank selection with alliance context", () => {
    const route = routeComponentInteraction({
      customId: "verify_rank_123_530061",
      controlType: "select",
      actorDiscordUserId: "123",
      channelId: "thread",
      leadershipChannelId: "lead",
      actorIsLeadership: false,
      isVerificationThread: true,
      selectedValues: ["0"]
    });

    expect(route).toEqual({
      type: "verify_rank",
      ownerDiscordUserId: "123",
      allianceId: 530061,
      rankCode: 0
    });
  });

  it("rejects rank selection without alliance context", () => {
    const route = routeComponentInteraction({
      customId: "verify_rank_123_0",
      controlType: "select",
      actorDiscordUserId: "123",
      channelId: "thread",
      leadershipChannelId: "lead",
      actorIsLeadership: false,
      isVerificationThread: true,
      selectedValues: ["0"]
    });

    expect(route).toEqual({ type: "error", message: "Select an alliance first." });
  });

  it("routes page button payload", () => {
    const route = routeComponentInteraction({
      customId: "verify_page_123_next_530061_0_1",
      controlType: "button",
      actorDiscordUserId: "123",
      channelId: "thread",
      leadershipChannelId: "lead",
      actorIsLeadership: false,
      isVerificationThread: true
    });

    expect(route).toEqual({
      type: "verify_page",
      ownerDiscordUserId: "123",
      direction: "next",
      allianceId: 530061,
      rankCode: 0,
      page: 1
    });
  });

  it("routes player selection", () => {
    const route = routeComponentInteraction({
      customId: "verify_member_123_530061_0_0",
      controlType: "select",
      actorDiscordUserId: "123",
      channelId: "thread",
      leadershipChannelId: "lead",
      actorIsLeadership: false,
      isVerificationThread: true,
      selectedValues: ["1001"]
    });

    expect(route).toEqual({
      type: "verify_member",
      ownerDiscordUserId: "123",
      selectedPlayerId: 1001
    });
  });
});
