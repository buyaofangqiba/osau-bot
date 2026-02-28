import "dotenv/config";
import process from "node:process";
import { GgeClient } from "./api/ggeClient.js";
import { loadConfig } from "./config.js";
import { createDbPool } from "./db/pool.js";
import { createDiscordClient } from "./discord/client.js";
import { createLogger } from "./logger.js";
import { DiscordRoleService } from "./services/discordRoleService.js";
import { LinkService } from "./services/linkService.js";
import { SyncService } from "./services/syncService.js";
import { VerificationService } from "./services/verificationService.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const dbPool = createDbPool(config);
  const ggeClient = new GgeClient(config.gge);

  const linkService = new LinkService(dbPool, logger);
  const verificationService = new VerificationService(dbPool, logger);
  let roleService!: DiscordRoleService;
  let syncService!: SyncService;

  const discord = createDiscordClient(config, logger, {
    onManualSync: async () => syncService.runFullSync("manual"),
    onRefresh: async () => syncService.runFullSync("manual"),
    onMemberJoin: async (member) => {
      const result = await roleService.handleMemberJoin(member);
      if (!result.linked) {
        await discord.createVerificationThreadForMember(member);
      }
    },
    onMemberLeave: async (member) => {
      logger.info({ memberId: member.id }, "Member left guild; placeholder for thread cleanup");
    },
    onJustVisiting: async (discordUserId) => {
      await verificationService.markJustVisiting(discordUserId);
    },
    getClaimablePlayers: async (allianceId, rankCode, page) => {
      return verificationService.getClaimablePlayersByAllianceRank(allianceId, rankCode, page);
    },
    onClaimSubmit: async (discordUserId, playerId) => {
      return verificationService.recordClaim(discordUserId, playerId);
    },
    onApproveClaim: async (claimId, reviewerDiscordUserId) => {
      const approved = await verificationService.approveClaim(claimId, reviewerDiscordUserId);
      if (!approved) {
        return null;
      }
      await linkService.linkPlayerToDiscordUser(
        approved.playerId,
        approved.discordUserId,
        approved.reviewerDiscordUserId
      );
      await roleService.reconcileDiscordUser(approved.discordUserId);
      return { discordUserId: approved.discordUserId };
    },
    onDenyClaim: async (claimId, reviewerDiscordUserId) => {
      const denied = await verificationService.denyClaim(claimId, reviewerDiscordUserId);
      if (!denied) {
        return null;
      }
      return { discordUserId: denied.discordUserId };
    }
  });

  roleService = new DiscordRoleService(dbPool, discord.client, config, logger);
  syncService = new SyncService(dbPool, ggeClient, config, logger, async () => {
    await roleService.reconcileAllLinkedMembers();
  });

  await discord.start();
  syncService.startScheduler();
  logger.info("O.S.A.U bot started");

  process.on("SIGINT", async () => {
    logger.info("SIGINT received, shutting down");
    await dbPool.end();
    process.exit(0);
  });

  void linkService;
  void verificationService;
}

main().catch((error) => {
  process.stderr.write(`Fatal startup error: ${String(error)}\n`);
  process.exit(1);
});
