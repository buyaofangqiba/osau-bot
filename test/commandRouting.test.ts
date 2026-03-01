import { describe, expect, it } from "vitest";
import { getClaimActionPermission, routeChatCommand } from "../src/discord/commandRouting.js";

describe("commandRouting", () => {
  describe("routeChatCommand", () => {
    it("routes sync now", () => {
      expect(
        routeChatCommand({
          commandName: "sync",
          subcommand: "now"
        })
      ).toEqual({ type: "sync_now" });
    });

    it("routes link set", () => {
      expect(
        routeChatCommand({
          commandName: "link",
          subcommand: "set",
          playerName: "Alpha",
          targetDiscordUserId: "123"
        })
      ).toEqual({
        type: "link_set",
        playerName: "Alpha",
        targetDiscordUserId: "123"
      });
    });

    it("routes link remove", () => {
      expect(
        routeChatCommand({
          commandName: "link",
          subcommand: "remove",
          playerName: "Alpha"
        })
      ).toEqual({
        type: "link_remove",
        playerName: "Alpha"
      });
    });

    it("returns unknown for missing required payload", () => {
      expect(
        routeChatCommand({
          commandName: "link",
          subcommand: "set",
          playerName: "Alpha"
        })
      ).toEqual({ type: "unknown" });
      expect(
        routeChatCommand({
          commandName: "link",
          subcommand: "remove"
        })
      ).toEqual({ type: "unknown" });
    });
  });

  describe("getClaimActionPermission", () => {
    it("rejects when channel is not leadership", () => {
      expect(
        getClaimActionPermission({
          channelId: "abc",
          leadershipChannelId: "xyz",
          actorIsLeadership: true
        })
      ).toEqual({ ok: false, reason: "wrong_channel" });
    });

    it("rejects when actor is not leadership", () => {
      expect(
        getClaimActionPermission({
          channelId: "abc",
          leadershipChannelId: "abc",
          actorIsLeadership: false
        })
      ).toEqual({ ok: false, reason: "not_leadership" });
    });

    it("allows leadership actor in leadership channel", () => {
      expect(
        getClaimActionPermission({
          channelId: "abc",
          leadershipChannelId: "abc",
          actorIsLeadership: true
        })
      ).toEqual({ ok: true });
    });
  });
});
