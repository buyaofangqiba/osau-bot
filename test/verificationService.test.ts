import { describe, expect, it, vi } from "vitest";
import { VerificationService } from "../src/services/verificationService.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any;
}

describe("VerificationService", () => {
  it("records claim and logs claim id", async () => {
    const logger = createLogger();
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ claimId: 11, discordUserId: "123", playerId: 1001, playerName: "Alpha" }]
      })
    } as any;
    const service = new VerificationService(pool, logger);

    const claim = await service.recordClaim("123", 1001);

    expect(claim).toEqual({ claimId: 11, discordUserId: "123", playerId: 1001, playerName: "Alpha" });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      { discordUserId: "123", playerId: 1001, claimId: 11 },
      "Claim recorded"
    );
  });

  it("returns paginated claimable players and next-page flag", async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({
      playerId: i + 1,
      playerName: `Player ${i + 1}`
    }));
    const pool = {
      query: vi.fn().mockResolvedValue({ rows })
    } as any;
    const service = new VerificationService(pool, createLogger());

    const result = await service.getClaimablePlayersByAllianceRank(530061, 0, 0);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(result.players).toHaveLength(25);
    expect(result.hasNextPage).toBe(true);
  });

  it("sanitizes negative page and oversized page size", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    } as any;
    const service = new VerificationService(pool, createLogger());

    await service.getClaimablePlayersByAllianceRank(530061, 0, -3, 999);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual([530061, 0, 26, 0]);
  });

  it("approves claim and upserts link atomically", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            claimId: 1,
            discordUserId: "123",
            playerId: 456,
            reviewerDiscordUserId: "999"
          }
        ]
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release })
    } as any;
    const service = new VerificationService(pool, createLogger());

    const result = await service.approveClaimAndUpsertLink(1, "999");

    expect(result?.claimId).toBe(1);
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(String(query.mock.calls[2]?.[0])).toContain("INSERT INTO discord_links");
    expect(query).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and returns null when claim is no longer pending", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE claim_requests
      .mockResolvedValueOnce(undefined); // ROLLBACK

    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release })
    } as any;
    const service = new VerificationService(pool, createLogger());

    const result = await service.approveClaimAndUpsertLink(99, "999");

    expect(result).toBeNull();
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and rethrows when upsert fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            claimId: 1,
            discordUserId: "123",
            playerId: 456,
            reviewerDiscordUserId: "999"
          }
        ]
      }) // UPDATE claim_requests
      .mockRejectedValueOnce(new Error("db failure")) // INSERT discord_links
      .mockResolvedValueOnce(undefined); // ROLLBACK in catch

    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release })
    } as any;
    const service = new VerificationService(pool, createLogger());

    await expect(service.approveClaimAndUpsertLink(1, "999")).rejects.toThrow("db failure");
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("returns no next page when result count is under page size", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: Array.from({ length: 5 }, (_, i) => ({ playerId: i + 1, playerName: `P${i + 1}` }))
      })
    } as any;
    const service = new VerificationService(pool, createLogger());

    const result = await service.getClaimablePlayersByAllianceRank(530061, 0, 3, 10);

    expect(result.players).toHaveLength(5);
    expect(result.hasNextPage).toBe(false);
  });

  it("marks user as just visiting", async () => {
    const logger = createLogger();
    const pool = {
      query: vi.fn().mockResolvedValue(undefined)
    } as any;
    const service = new VerificationService(pool, logger);

    await service.markJustVisiting("123");

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(String(pool.query.mock.calls[0][0])).toContain("just_visiting");
    expect(pool.query.mock.calls[0][1]).toEqual(["123"]);
    expect(logger.info).toHaveBeenCalledWith({ discordUserId: "123" }, "Marked user as just visiting");
  });

  it("approves and denies pending claims with null fallback", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ claimId: 1, discordUserId: "123", playerId: 1001, reviewerDiscordUserId: "999" }]
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ claimId: 2, discordUserId: "123", playerId: 1002, reviewerDiscordUserId: "999" }]
        })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const service = new VerificationService(pool, createLogger());

    await expect(service.approveClaim(1, "999")).resolves.toEqual({
      claimId: 1,
      discordUserId: "123",
      playerId: 1001,
      reviewerDiscordUserId: "999"
    });
    await expect(service.approveClaim(1, "999")).resolves.toBeNull();
    await expect(service.denyClaim(2, "999")).resolves.toEqual({
      claimId: 2,
      discordUserId: "123",
      playerId: 1002,
      reviewerDiscordUserId: "999"
    });
    await expect(service.denyClaim(2, "999")).resolves.toBeNull();
  });

  it("purges denied claims and returns 0 when rowCount is missing", async () => {
    const pool = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 3 }).mockResolvedValueOnce({})
    } as any;
    const service = new VerificationService(pool, createLogger());

    await expect(service.purgeExpiredDeniedClaims(14)).resolves.toBe(3);
    await expect(service.purgeExpiredDeniedClaims(14)).resolves.toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
