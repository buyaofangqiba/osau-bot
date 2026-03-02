import { describe, expect, it, vi } from "vitest";
import { LinkService } from "../src/services/linkService.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any;
}

function createConfig() {
  return {
    gge: {
      syncAllianceIds: [530061, 10061]
    }
  } as any;
}

describe("LinkService", () => {
  it("links player to discord user via upsert", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({})
    } as any;
    const service = new LinkService(pool, createConfig(), createLogger());

    await service.linkPlayerToDiscordUser(1001, "123", "999");

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(String(pool.query.mock.calls[0][0])).toContain("INSERT INTO discord_links");
    expect(pool.query.mock.calls[0][1]).toEqual(["123", 1001, "999"]);
  });

  it("unlinks by player and returns affected discord user ids", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ discord_user_id: "u1" }, { discord_user_id: "u2" }] })
        .mockResolvedValueOnce({})
    } as any;
    const service = new LinkService(pool, createConfig(), createLogger());

    const unlinkedUsers = await service.unlinkByPlayer(1001, "999");

    expect(unlinkedUsers).toEqual(["u1", "u2"]);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(String(pool.query.mock.calls[1][0])).toContain("UPDATE discord_links");
  });

  it("resolves player by case-insensitive name", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ playerId: 1001, playerName: "Alpha", currentAllianceId: 530061 }]
      })
    } as any;
    const service = new LinkService(pool, createConfig(), createLogger());

    const result = await service.resolvePlayerByName("alpha");

    expect(result).toEqual({
      status: "resolved",
      player: { playerId: 1001, playerName: "Alpha" }
    });
  });

  it("returns ambiguous when multiple tracked players share a name", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { playerId: 1001, playerName: "Alpha", currentAllianceId: 530061 },
          { playerId: 1002, playerName: "Alpha", currentAllianceId: 10061 }
        ]
      })
    } as any;
    const service = new LinkService(pool, createConfig(), createLogger());

    const result = await service.resolvePlayerByName("alpha");

    expect(result).toEqual({
      status: "ambiguous",
      candidates: [
        { playerId: 1001, playerName: "Alpha" },
        { playerId: 1002, playerName: "Alpha" }
      ]
    });
  });

  it("prefers the single tracked candidate when name matches tracked and untracked players", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { playerId: 2001, playerName: "Alpha", currentAllianceId: null },
          { playerId: 1001, playerName: "Alpha", currentAllianceId: "530061" }
        ]
      })
    } as any;
    const service = new LinkService(pool, createConfig(), createLogger());

    const result = await service.resolvePlayerByName("alpha");

    expect(result).toEqual({
      status: "resolved",
      player: { playerId: 1001, playerName: "Alpha" }
    });
  });
});
