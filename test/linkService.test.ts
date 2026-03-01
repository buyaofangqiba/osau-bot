import { describe, expect, it, vi } from "vitest";
import { LinkService } from "../src/services/linkService.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any;
}

describe("LinkService", () => {
  it("links player to discord user via upsert", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({})
    } as any;
    const service = new LinkService(pool, createLogger());

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
    const service = new LinkService(pool, createLogger());

    const unlinkedUsers = await service.unlinkByPlayer(1001, "999");

    expect(unlinkedUsers).toEqual(["u1", "u2"]);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(String(pool.query.mock.calls[1][0])).toContain("UPDATE discord_links");
  });

  it("resolves player by case-insensitive name", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ playerId: 1001, playerName: "Alpha" }] })
    } as any;
    const service = new LinkService(pool, createLogger());

    const result = await service.resolvePlayerByName("alpha");

    expect(result).toEqual({ playerId: 1001, playerName: "Alpha" });
  });
});
