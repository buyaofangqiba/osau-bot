import { describe, expect, it, vi } from "vitest";
import { AuditService } from "../src/services/auditService.js";

describe("AuditService", () => {
  it("writes audit record with explicit target fields", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue(undefined)
    } as any;
    const service = new AuditService(pool);

    await service.record("link.set", "actor-1", {
      targetDiscordUserId: "target-1",
      targetPlayerId: 1001,
      payload: { foo: "bar" }
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(String(pool.query.mock.calls[0][0])).toContain("INSERT INTO command_audit");
    expect(pool.query.mock.calls[0][1]).toEqual([
      "link.set",
      "actor-1",
      "target-1",
      1001,
      JSON.stringify({ foo: "bar" })
    ]);
  });

  it("defaults optional fields when opts are omitted", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue(undefined)
    } as any;
    const service = new AuditService(pool);

    await service.record("sync.now", "actor-1");

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual([
      "sync.now",
      "actor-1",
      null,
      null,
      JSON.stringify({})
    ]);
  });
});
