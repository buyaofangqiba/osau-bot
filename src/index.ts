import "dotenv/config";
import process from "node:process";
import { GgeClient } from "./api/ggeClient.js";
import { loadConfig } from "./config.js";
import { createDbPool } from "./db/pool.js";
import { createDiscordClient } from "./discord/client.js";
import { createLogger } from "./logger.js";
import { AuditService } from "./services/auditService.js";
import { DiscordRoleService } from "./services/discordRoleService.js";
import { LinkService } from "./services/linkService.js";
import { SyncService } from "./services/syncService.js";
import { TechAdminLogService } from "./services/techAdminLogService.js";
import { VerificationService } from "./services/verificationService.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const dbPool = createDbPool(config);
  const ggeClient = new GgeClient(config.gge);

  const schemaCheck = await dbPool.query<{ exists: string | null }>(
    `SELECT to_regclass('public.discord_links') AS "exists"`
  );
  if (!schemaCheck.rows[0]?.exists) {
    throw new Error(
      "Database schema is missing. Run migrations first (`npm run migrate`) before starting the bot."
    );
  }

  const verificationService = new VerificationService(dbPool, logger);
  const linkService = new LinkService(dbPool, logger);
  const auditService = new AuditService(dbPool);
  let roleService!: DiscordRoleService;
  let syncService!: SyncService;
  let techLogService!: TechAdminLogService;

  async function runManualSyncAndLog(actorDiscordUserId: string) {
    await techLogService.log(`Manual sync requested by <@${actorDiscordUserId}>`);
    try {
      await syncService.runFullSync("manual");
      await auditService.record("sync.now", actorDiscordUserId);
      await techLogService.log(`Manual sync completed successfully (requested by <@${actorDiscordUserId}>)`);
    } catch (error) {
      await techLogService.log(
        `Manual sync failed (requested by <@${actorDiscordUserId}>): \`${String(error)}\``
      );
      throw error;
    }
  }

  const discord = createDiscordClient(config, logger, {
    onManualSync: async () => syncService.runFullSync("manual"),
    onManualSyncByActor: async (actorDiscordUserId) => runManualSyncAndLog(actorDiscordUserId),
    onLinkSet: async (actorDiscordUserId, playerName, targetDiscordUserId) => {
      const player = await linkService.resolvePlayerByName(playerName);
      if (!player) {
        return `Player '${playerName}' was not found in local player data. Run /sync now first.`;
      }
      await linkService.linkPlayerToDiscordUser(player.playerId, targetDiscordUserId, actorDiscordUserId);
      await roleService.reconcileDiscordUser(targetDiscordUserId);
      await auditService.record("link.set", actorDiscordUserId, {
        targetDiscordUserId,
        targetPlayerId: player.playerId,
        payload: { playerName: player.playerName }
      });
      await techLogService.log(
        `Manual link set by <@${actorDiscordUserId}>: <@${targetDiscordUserId}> -> ${player.playerName} (${player.playerId})`
      );
      return `Linked <@${targetDiscordUserId}> to ${player.playerName}.`;
    },
    onLinkRemove: async (actorDiscordUserId, playerName) => {
      const player = await linkService.resolvePlayerByName(playerName);
      if (!player) {
        return `Player '${playerName}' was not found in local player data.`;
      }
      const unlinkedUsers = await linkService.unlinkByPlayer(player.playerId, actorDiscordUserId);
      for (const userId of unlinkedUsers) {
        await roleService.reconcileDiscordUser(userId);
      }
      await auditService.record("link.remove", actorDiscordUserId, {
        targetPlayerId: player.playerId,
        payload: { playerName: player.playerName, unlinkedUsers }
      });
      await techLogService.log(
        `Manual link removed by <@${actorDiscordUserId}>: ${player.playerName} (${player.playerId})`
      );
      return `Removed link for ${player.playerName}.`;
    },
    onMemberJoin: async (member) => {
      const result = await roleService.handleMemberJoin(member);
      if (!result.linked) {
        await discord.createVerificationThreadForMember(member);
      }
      await techLogService.log(`Member joined: <@${member.id}> (linked=${String(result.linked)})`);
    },
    onMemberLeave: async (member) => {
      await discord.deleteVerificationThreadForUser(member.id, "Member left guild", member.user.username);
      logger.info({ memberId: member.id }, "Member left guild; verification thread cleaned up");
      await techLogService.log(`Member left: <@${member.id}>`);
    },
    onJustVisiting: async (discordUserId) => {
      await verificationService.markJustVisiting(discordUserId);
      await techLogService.log(`Just visiting selected by <@${discordUserId}>`);
    },
    getClaimablePlayers: async (allianceId, rankCode, page) => {
      return verificationService.getClaimablePlayersByAllianceRank(allianceId, rankCode, page);
    },
    onClaimSubmit: async (discordUserId, playerId) => {
      return verificationService.recordClaim(discordUserId, playerId);
    },
    onApproveClaim: async (claimId, reviewerDiscordUserId) => {
      const approved = await verificationService.approveClaimAndUpsertLink(claimId, reviewerDiscordUserId);
      if (!approved) {
        return null;
      }
      await roleService.reconcileDiscordUser(approved.discordUserId);
      await auditService.record("claim.approve", reviewerDiscordUserId, {
        targetDiscordUserId: approved.discordUserId,
        targetPlayerId: approved.playerId,
        payload: { claimId: approved.claimId }
      });
      await techLogService.log(
        `Claim approved by <@${reviewerDiscordUserId}>: <@${approved.discordUserId}> -> player ${approved.playerId}`
      );
      return { discordUserId: approved.discordUserId };
    },
    onDenyClaim: async (claimId, reviewerDiscordUserId) => {
      const denied = await verificationService.denyClaim(claimId, reviewerDiscordUserId);
      if (!denied) {
        return null;
      }
      await auditService.record("claim.deny", reviewerDiscordUserId, {
        targetDiscordUserId: denied.discordUserId,
        targetPlayerId: denied.playerId,
        payload: { claimId: denied.claimId }
      });
      await techLogService.log(
        `Claim denied by <@${reviewerDiscordUserId}>: <@${denied.discordUserId}> (player ${denied.playerId})`
      );
      return { discordUserId: denied.discordUserId };
    }
  });

  roleService = new DiscordRoleService(dbPool, discord.client, config, logger);
  techLogService = new TechAdminLogService(discord.client, config, logger);
  syncService = new SyncService(dbPool, ggeClient, config, logger, async () => {
    await roleService.reconcileAllLinkedMembers();
  });

  await discord.start();
  syncService.startScheduler();
  await techLogService.log("Bot online");
  logger.info("O.S.A.U bot started");

  setInterval(() => {
    void (async () => {
      const purged = await verificationService.purgeExpiredDeniedClaims(config.deniedClaimRetentionDays);
      if (purged > 0) {
        await techLogService.log(`Denied claim cleanup purged ${purged} records.`);
      }
    })();
  }, 24 * 60 * 60 * 1000);

  process.on("SIGINT", async () => {
    logger.info("SIGINT received, shutting down");
    await dbPool.end();
    process.exit(0);
  });
  void verificationService;
}

main().catch((error) => {
  process.stderr.write(`Fatal startup error: ${String(error)}\n`);
  process.exit(1);
});
