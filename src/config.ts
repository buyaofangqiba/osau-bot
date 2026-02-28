import { z } from "zod";

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  DISCORD_VERIFICATION_PARENT_CHANNEL_ID: z.string().min(1),
  DISCORD_LEADERSHIP_CHANNEL_ID: z.string().min(1),
  DISCORD_TECH_ADMIN_LOG_CHANNEL_ID: z.string().min(1),
  DISCORD_ROLE_ID_LEADER: z.string().min(1),
  DISCORD_ROLE_ID_DEPUTY: z.string().min(1),
  DISCORD_ROLE_ID_WAR_MARSHALL: z.string().min(1),
  DISCORD_ROLE_ID_TREASURER: z.string().min(1),
  DISCORD_ROLE_ID_DIPLOMAT: z.string().min(1),
  DISCORD_ROLE_ID_RECRUITER: z.string().min(1),
  DISCORD_ROLE_ID_GENERAL: z.string().min(1),
  DISCORD_ROLE_ID_SERGEANT: z.string().min(1),
  DISCORD_ROLE_ID_MEMBER: z.string().min(1),
  DISCORD_ROLE_ID_NOVICE: z.string().min(1),
  DISCORD_ROLE_ID_VISITOR: z.string().min(1),
  DISCORD_ROLE_ID_ALLIANCE_DARK_WARRIORS: z.string().min(1),
  DISCORD_ROLE_ID_ALLIANCE_LA_MUERTE: z.string().min(1),
  DISCORD_ROLE_ID_ALUMNI: z.string().min(1),
  GGE_API_BASE_URL: z.string().url().default("https://api.gge-tracker.com/api/v1"),
  GGE_SERVER_CODE: z.string().default("WORLD2"),
  SYNC_INTERVAL_HOURS: z.coerce.number().int().positive().default(12),
  SYNC_ALLIANCE_IDS: z.string().default("530061,10061"),
  DATABASE_URL: z.string().min(1),
  DENIED_CLAIM_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  LOG_LEVEL: z.string().default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export interface AppConfig {
  discord: {
    botToken: string;
    guildId: string;
    verificationParentChannelId: string;
    leadershipChannelId: string;
    techAdminLogChannelId: string;
  };
  roleIds: {
    leader: string;
    deputy: string;
    warMarshall: string;
    treasurer: string;
    diplomat: string;
    recruiter: string;
    general: string;
    sergeant: string;
    member: string;
    novice: string;
    visitor: string;
    allianceDarkWarriors: string;
    allianceLaMuerte: string;
    alumni: string;
  };
  gge: {
    baseUrl: string;
    serverCode: string;
    syncAllianceIds: number[];
  };
  databaseUrl: string;
  syncIntervalHours: number;
  deniedClaimRetentionDays: number;
  logLevel: string;
  nodeEnv: "development" | "test" | "production";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    discord: {
      botToken: parsed.DISCORD_BOT_TOKEN,
      guildId: parsed.DISCORD_GUILD_ID,
      verificationParentChannelId: parsed.DISCORD_VERIFICATION_PARENT_CHANNEL_ID,
      leadershipChannelId: parsed.DISCORD_LEADERSHIP_CHANNEL_ID,
      techAdminLogChannelId: parsed.DISCORD_TECH_ADMIN_LOG_CHANNEL_ID
    },
    roleIds: {
      leader: parsed.DISCORD_ROLE_ID_LEADER,
      deputy: parsed.DISCORD_ROLE_ID_DEPUTY,
      warMarshall: parsed.DISCORD_ROLE_ID_WAR_MARSHALL,
      treasurer: parsed.DISCORD_ROLE_ID_TREASURER,
      diplomat: parsed.DISCORD_ROLE_ID_DIPLOMAT,
      recruiter: parsed.DISCORD_ROLE_ID_RECRUITER,
      general: parsed.DISCORD_ROLE_ID_GENERAL,
      sergeant: parsed.DISCORD_ROLE_ID_SERGEANT,
      member: parsed.DISCORD_ROLE_ID_MEMBER,
      novice: parsed.DISCORD_ROLE_ID_NOVICE,
      visitor: parsed.DISCORD_ROLE_ID_VISITOR,
      allianceDarkWarriors: parsed.DISCORD_ROLE_ID_ALLIANCE_DARK_WARRIORS,
      allianceLaMuerte: parsed.DISCORD_ROLE_ID_ALLIANCE_LA_MUERTE,
      alumni: parsed.DISCORD_ROLE_ID_ALUMNI
    },
    gge: {
      baseUrl: parsed.GGE_API_BASE_URL,
      serverCode: parsed.GGE_SERVER_CODE,
      syncAllianceIds: parsed.SYNC_ALLIANCE_IDS.split(",").map((id) => Number(id.trim()))
    },
    databaseUrl: parsed.DATABASE_URL,
    syncIntervalHours: parsed.SYNC_INTERVAL_HOURS,
    deniedClaimRetentionDays: parsed.DENIED_CLAIM_RETENTION_DAYS,
    logLevel: parsed.LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV
  };
}
