export const ALLIANCE_RANKS = {
  0: "Leader",
  1: "Deputy",
  2: "War Marshall",
  3: "Treasurer",
  4: "Diplomat",
  5: "Recruiter",
  6: "General",
  7: "Sergeant",
  8: "Member",
  9: "Novice"
} as const;

export type AllianceRankCode = keyof typeof ALLIANCE_RANKS;

export const LEADERSHIP_RANK_CODES: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5]);
