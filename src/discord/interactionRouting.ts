export interface OwnedCustomId {
  ownerDiscordUserId: string;
  rest: string;
}

export interface ClaimDecisionPayload {
  claimId: number;
  threadId: string;
}

export interface VerifyPagePayload {
  direction: "next" | "prev";
  allianceId: number;
  rankCode: number;
  page: number;
}

export function parseOwnedCustomId(prefix: string, customId: string): OwnedCustomId | null {
  if (!customId.startsWith(prefix)) {
    return null;
  }
  const body = customId.slice(prefix.length);
  const sepIndex = body.indexOf("_");
  if (sepIndex === -1) {
    return null;
  }
  return {
    ownerDiscordUserId: body.slice(0, sepIndex),
    rest: body.slice(sepIndex + 1)
  };
}

export function parseClaimDecisionPayload(customId: string, prefix: string): ClaimDecisionPayload | null {
  if (!customId.startsWith(prefix)) {
    return null;
  }
  const payload = customId.slice(prefix.length);
  const [claimIdRaw, threadId] = payload.split("_");
  const claimId = Number(claimIdRaw);
  if (!Number.isInteger(claimId) || claimId <= 0 || !threadId) {
    return null;
  }
  return { claimId, threadId };
}

export function parseVerifyPagePayload(rest: string): VerifyPagePayload | null {
  const [directionRaw, allianceIdRaw, rankCodeRaw, pageRaw] = rest.split("_");
  if (directionRaw !== "next" && directionRaw !== "prev") {
    return null;
  }
  const allianceId = Number(allianceIdRaw);
  const rankCode = Number(rankCodeRaw);
  const page = Number(pageRaw);
  if (
    !Number.isInteger(allianceId) ||
    allianceId <= 0 ||
    !Number.isInteger(rankCode) ||
    rankCode < 0 ||
    !Number.isInteger(page) ||
    page < 0
  ) {
    return null;
  }
  return {
    direction: directionRaw,
    allianceId,
    rankCode,
    page
  };
}

export function isOwnedInteraction(ownerDiscordUserId: string, actorDiscordUserId: string): boolean {
  return ownerDiscordUserId === actorDiscordUserId;
}
