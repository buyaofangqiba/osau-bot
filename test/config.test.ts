import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("parses sync alliance ids and defaults", () => {
    const config = loadConfig({
      DISCORD_BOT_TOKEN: "x",
      DISCORD_GUILD_ID: "1",
      DISCORD_VERIFICATION_PARENT_CHANNEL_ID: "2",
      DISCORD_LEADERSHIP_CHANNEL_ID: "3",
      DISCORD_TECH_ADMIN_LOG_CHANNEL_ID: "4",
      DISCORD_ROLE_ID_LEADER: "10",
      DISCORD_ROLE_ID_DEPUTY: "11",
      DISCORD_ROLE_ID_WAR_MARSHALL: "12",
      DISCORD_ROLE_ID_TREASURER: "13",
      DISCORD_ROLE_ID_DIPLOMAT: "14",
      DISCORD_ROLE_ID_RECRUITER: "15",
      DISCORD_ROLE_ID_GENERAL: "16",
      DISCORD_ROLE_ID_SERGEANT: "17",
      DISCORD_ROLE_ID_MEMBER: "18",
      DISCORD_ROLE_ID_NOVICE: "19",
      DISCORD_ROLE_ID_VISITOR: "20",
      DISCORD_ROLE_ID_ALLIANCE_DARK_WARRIORS: "21",
      DISCORD_ROLE_ID_ALLIANCE_LA_MUERTE: "22",
      DISCORD_ROLE_ID_ALUMNI: "23",
      DATABASE_URL: "postgresql://x",
      SYNC_ALLIANCE_IDS: "530061,10061"
    });

    expect(config.gge.syncAllianceIds).toEqual([530061, 10061]);
    expect(config.syncIntervalHours).toBe(12);
    expect(config.deniedClaimRetentionDays).toBe(7);
    expect(config.gge.serverCode).toBe("WORLD2");
  });
});
