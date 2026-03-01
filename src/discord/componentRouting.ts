import {
  parseClaimDecisionPayload,
  parseOwnedCustomId,
  parseVerifyPagePayload
} from "./interactionRouting.js";

export const COMPONENT_PREFIXES = {
  verifyAlliance: "verify_alliance_",
  verifyRank: "verify_rank_",
  verifyMember: "verify_member_",
  verifyPage: "verify_page_",
  verifyVisitor: "verify_visitor_",
  leadClaimApprove: "lead_claim_approve_",
  leadClaimDeny: "lead_claim_deny_"
} as const;

export interface ComponentRouteInput {
  customId: string;
  controlType: "button" | "select";
  actorDiscordUserId: string;
  channelId: string;
  leadershipChannelId: string;
  actorIsLeadership: boolean;
  isVerificationThread: boolean;
  selectedValues?: string[];
}

export type ComponentRouteResult =
  | { type: "ignore" }
  | { type: "error"; message: string }
  | { type: "lead_claim_approve"; claimId: number; threadId: string }
  | { type: "lead_claim_deny"; claimId: number; threadId: string }
  | { type: "verify_visitor"; ownerDiscordUserId: string }
  | { type: "verify_alliance"; ownerDiscordUserId: string; allianceId: number }
  | { type: "verify_rank"; ownerDiscordUserId: string; allianceId: number; rankCode: number }
  | {
      type: "verify_page";
      ownerDiscordUserId: string;
      direction: "next" | "prev";
      allianceId: number;
      rankCode: number;
      page: number;
    }
  | { type: "verify_member"; ownerDiscordUserId: string; selectedPlayerId: number };

function parseSelectedNumber(value: string | undefined): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return numberValue;
}

export function routeComponentInteraction(input: ComponentRouteInput): ComponentRouteResult {
  if (input.controlType === "button" && input.customId.startsWith(COMPONENT_PREFIXES.leadClaimApprove)) {
    if (input.channelId !== input.leadershipChannelId) {
      return { type: "error", message: "This action is only allowed in leadership channel." };
    }
    if (!input.actorIsLeadership) {
      return { type: "error", message: "You do not have permission to approve claims." };
    }
    const payload = parseClaimDecisionPayload(input.customId, COMPONENT_PREFIXES.leadClaimApprove);
    if (!payload) {
      return { type: "error", message: "Invalid claim payload." };
    }
    return { type: "lead_claim_approve", claimId: payload.claimId, threadId: payload.threadId };
  }

  if (input.controlType === "button" && input.customId.startsWith(COMPONENT_PREFIXES.leadClaimDeny)) {
    if (input.channelId !== input.leadershipChannelId) {
      return { type: "error", message: "This action is only allowed in leadership channel." };
    }
    if (!input.actorIsLeadership) {
      return { type: "error", message: "You do not have permission to deny claims." };
    }
    const payload = parseClaimDecisionPayload(input.customId, COMPONENT_PREFIXES.leadClaimDeny);
    if (!payload) {
      return { type: "error", message: "Invalid claim payload." };
    }
    return { type: "lead_claim_deny", claimId: payload.claimId, threadId: payload.threadId };
  }

  if (!input.isVerificationThread) {
    return { type: "ignore" };
  }

  if (input.controlType === "button" && input.customId.startsWith(COMPONENT_PREFIXES.verifyVisitor)) {
    const parsed = parseOwnedCustomId(COMPONENT_PREFIXES.verifyVisitor, input.customId);
    if (!parsed || parsed.ownerDiscordUserId !== input.actorDiscordUserId) {
      return { type: "error", message: "Only the owner can use these controls." };
    }
    return { type: "verify_visitor", ownerDiscordUserId: parsed.ownerDiscordUserId };
  }

  if (input.controlType === "select" && input.customId.startsWith(COMPONENT_PREFIXES.verifyAlliance)) {
    const parsed = parseOwnedCustomId(COMPONENT_PREFIXES.verifyAlliance, input.customId);
    if (!parsed || parsed.ownerDiscordUserId !== input.actorDiscordUserId) {
      return { type: "error", message: "Only the owner can use these controls." };
    }
    const allianceId = parseSelectedNumber(input.selectedValues?.[0]);
    if (allianceId === null) {
      return { type: "error", message: "Invalid alliance selection." };
    }
    return { type: "verify_alliance", ownerDiscordUserId: parsed.ownerDiscordUserId, allianceId };
  }

  if (input.controlType === "select" && input.customId.startsWith(COMPONENT_PREFIXES.verifyRank)) {
    const parsed = parseOwnedCustomId(COMPONENT_PREFIXES.verifyRank, input.customId);
    if (!parsed || parsed.ownerDiscordUserId !== input.actorDiscordUserId) {
      return { type: "error", message: "Only the owner can use these controls." };
    }
    const allianceId = parseSelectedNumber(parsed.rest);
    if (allianceId === null || allianceId === 0) {
      return { type: "error", message: "Select an alliance first." };
    }
    const rankCode = parseSelectedNumber(input.selectedValues?.[0]);
    if (rankCode === null) {
      return { type: "error", message: "Invalid rank selection." };
    }
    return { type: "verify_rank", ownerDiscordUserId: parsed.ownerDiscordUserId, allianceId, rankCode };
  }

  if (input.controlType === "button" && input.customId.startsWith(COMPONENT_PREFIXES.verifyPage)) {
    const parsed = parseOwnedCustomId(COMPONENT_PREFIXES.verifyPage, input.customId);
    if (!parsed || parsed.ownerDiscordUserId !== input.actorDiscordUserId) {
      return { type: "error", message: "Only the owner can use these controls." };
    }
    const pagePayload = parseVerifyPagePayload(parsed.rest);
    if (!pagePayload) {
      return { type: "error", message: "Invalid page selection." };
    }
    return {
      type: "verify_page",
      ownerDiscordUserId: parsed.ownerDiscordUserId,
      direction: pagePayload.direction,
      allianceId: pagePayload.allianceId,
      rankCode: pagePayload.rankCode,
      page: pagePayload.page
    };
  }

  if (input.controlType === "select" && input.customId.startsWith(COMPONENT_PREFIXES.verifyMember)) {
    const parsed = parseOwnedCustomId(COMPONENT_PREFIXES.verifyMember, input.customId);
    if (!parsed || parsed.ownerDiscordUserId !== input.actorDiscordUserId) {
      return { type: "error", message: "Only the owner can use these controls." };
    }
    const selectedPlayerId = parseSelectedNumber(input.selectedValues?.[0]);
    if (selectedPlayerId === null) {
      return { type: "error", message: "Invalid player selection." };
    }
    return { type: "verify_member", ownerDiscordUserId: parsed.ownerDiscordUserId, selectedPlayerId };
  }

  return { type: "ignore" };
}
