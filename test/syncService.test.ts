import { describe, expect, it, vi } from "vitest";
import { SyncService } from "../src/services/syncService.js";

function createConfig() {
  return {
    syncIntervalHours: 12,
    gge: {
      syncAllianceIds: [530061],
      baseUrl: "https://api.gge-tracker.com/api/v1",
      serverCode: "WORLD2"
    }
  } as any;
}

describe("SyncService", () => {
  it("upserts alliances and players then marks sync success", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 42 }] }) // sync_runs insert
        .mockResolvedValue(undefined) // alliances upsert
        .mockResolvedValue(undefined) // player upsert batch
        .mockResolvedValue(undefined) // players null-out
        .mockResolvedValue(undefined) // sync_runs success
    } as any;

    const ggeClient = {
      getAllianceById: vi.fn().mockResolvedValue({
        alliance_name: "Dark Warriors",
        players: [
          {
            player_id: 1001,
            player_name: "Alpha",
            alliance_rank: 0,
            level: 70,
            might: 100,
            loot: 100,
            honor: 100
          }
        ]
      })
    } as any;

    const logger = { info: vi.fn(), error: vi.fn() } as any;
    const afterSync = vi.fn().mockResolvedValue(undefined);
    const service = new SyncService(pool, ggeClient, createConfig(), logger, afterSync);

    await service.runFullSync("manual");

    const sqlCalls = pool.query.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqlCalls.some((sql: string) => sql.includes("INSERT INTO alliances"))).toBe(true);
    expect(sqlCalls.some((sql: string) => sql.includes("FROM UNNEST"))).toBe(true);
    expect(afterSync).toHaveBeenCalledTimes(1);
  });

  it("marks sync failed when alliance fetch throws", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 99 }] }) // sync_runs insert
        .mockResolvedValueOnce(undefined) // sync_runs failed update
    } as any;

    const ggeClient = {
      getAllianceById: vi.fn().mockRejectedValue(new Error("gge unavailable"))
    } as any;

    const logger = { info: vi.fn(), error: vi.fn() } as any;
    const service = new SyncService(pool, ggeClient, createConfig(), logger);

    await expect(service.runFullSync("manual")).rejects.toThrow("gge unavailable");

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(String(pool.query.mock.calls[1][0])).toContain("status = 'failed'");
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("marks sync failed when afterSync hook throws", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 55 }] }) // sync_runs insert
        .mockResolvedValue(undefined) // alliances upsert
        .mockResolvedValue(undefined) // player upsert batch
        .mockResolvedValue(undefined) // players null-out
        .mockResolvedValue(undefined) // sync_runs failed update
    } as any;

    const ggeClient = {
      getAllianceById: vi.fn().mockResolvedValue({
        alliance_name: "Dark Warriors",
        players: [{ player_id: 1001, player_name: "Alpha", alliance_rank: 0 }]
      })
    } as any;

    const logger = { info: vi.fn(), error: vi.fn() } as any;
    const afterSync = vi.fn().mockRejectedValue(new Error("post-sync failed"));
    const service = new SyncService(pool, ggeClient, createConfig(), logger, afterSync);

    await expect(service.runFullSync("manual")).rejects.toThrow("post-sync failed");
    expect(String(pool.query.mock.calls.at(-1)?.[0])).toContain("status = 'failed'");
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("skips player upsert when alliance payload has no valid numeric player ids", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 12 }] }) // sync_runs insert
        .mockResolvedValue(undefined) // alliances upsert
        .mockResolvedValue(undefined) // players null-out
        .mockResolvedValue(undefined) // sync_runs success
    } as any;

    const ggeClient = {
      getAllianceById: vi.fn().mockResolvedValue({
        alliance_name: "Dark Warriors",
        players: [
          { player_id: Number.NaN, player_name: "Bad1", alliance_rank: 0 },
          { player_id: Number.POSITIVE_INFINITY, player_name: "Bad2", alliance_rank: 1 }
        ]
      })
    } as any;

    const logger = { info: vi.fn(), error: vi.fn() } as any;
    const service = new SyncService(pool, ggeClient, createConfig(), logger);

    await service.runFullSync("manual");

    const sqlCalls = pool.query.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(sqlCalls.some((sql: string) => sql.includes("FROM UNNEST"))).toBe(false);
    expect(sqlCalls.some((sql: string) => sql.includes("status = 'success'"))).toBe(true);
  });
});
