import { describe, expect, it } from "vitest";
import {
  isOwnedInteraction,
  parseClaimDecisionPayload,
  parseOwnedCustomId,
  parseVerifyPagePayload
} from "../src/discord/interactionRouting.js";

describe("interactionRouting", () => {
  describe("parseOwnedCustomId", () => {
    it("parses owner id and remainder", () => {
      const parsed = parseOwnedCustomId("verify_page_", "verify_page_123_next_530061_0_2");

      expect(parsed).toEqual({
        ownerDiscordUserId: "123",
        rest: "next_530061_0_2"
      });
    });

    it("returns null for invalid payloads", () => {
      expect(parseOwnedCustomId("verify_page_", "wrong_123_next")).toBeNull();
      expect(parseOwnedCustomId("verify_page_", "verify_page_123")).toBeNull();
    });
  });

  describe("parseClaimDecisionPayload", () => {
    it("parses claim id and thread id", () => {
      const parsed = parseClaimDecisionPayload("lead_claim_approve_42_123456", "lead_claim_approve_");

      expect(parsed).toEqual({ claimId: 42, threadId: "123456" });
    });

    it("returns null for malformed claim payloads", () => {
      expect(parseClaimDecisionPayload("lead_claim_approve_nope_123", "lead_claim_approve_")).toBeNull();
      expect(parseClaimDecisionPayload("lead_claim_approve_42", "lead_claim_approve_")).toBeNull();
      expect(parseClaimDecisionPayload("lead_claim_deny_42_123", "lead_claim_approve_")).toBeNull();
      expect(parseClaimDecisionPayload("lead_claim_approve_1.5_123", "lead_claim_approve_")).toBeNull();
      expect(parseClaimDecisionPayload("lead_claim_approve_0_123", "lead_claim_approve_")).toBeNull();
    });
  });

  describe("parseVerifyPagePayload", () => {
    it("parses page payload", () => {
      const parsed = parseVerifyPagePayload("next_530061_0_1");

      expect(parsed).toEqual({
        direction: "next",
        allianceId: 530061,
        rankCode: 0,
        page: 1
      });
    });

    it("returns null for malformed page payload", () => {
      expect(parseVerifyPagePayload("foo_530061_0_1")).toBeNull();
      expect(parseVerifyPagePayload("next_abc_0_1")).toBeNull();
      expect(parseVerifyPagePayload("prev_530061_0")).toBeNull();
      expect(parseVerifyPagePayload("next_530061.1_0_1")).toBeNull();
      expect(parseVerifyPagePayload("next_530061_-1_1")).toBeNull();
      expect(parseVerifyPagePayload("next_530061_0_-1")).toBeNull();
    });
  });

  it("checks ownership", () => {
    expect(isOwnedInteraction("123", "123")).toBe(true);
    expect(isOwnedInteraction("123", "999")).toBe(false);
  });
});
