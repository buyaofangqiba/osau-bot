import { describe, expect, it, vi } from "vitest";
import { DiscordRoleService } from "../src/services/discordRoleService.js";

function createConfig() {
  return {
    discord: {
      guildId: "guild-1"
    },
    roleIds: {
      leader: "r0",
      deputy: "r1",
      warMarshall: "r2",
      treasurer: "r3",
      diplomat: "r4",
      recruiter: "r5",
      general: "r6",
      sergeant: "r7",
      member: "r8",
      novice: "r9",
      visitor: "g-visitor",
      allianceDarkWarriors: "g-dw",
      allianceLaMuerte: "g-lm",
      alumni: "g-alumni"
    }
  } as any;
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any;
}

function createMember(roleIds: string[]) {
  return {
    id: "user-1",
    roles: {
      cache: new Map(roleIds.map((id) => [id, { id }])),
      remove: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined)
    }
  } as any;
}

function createGuildWithMembers(memberById: Record<string, any>) {
  return {
    members: {
      fetch: vi.fn((discordUserId: string) => {
        const member = memberById[discordUserId];
        if (!member) {
          return Promise.reject(new Error("not found"));
        }
        return Promise.resolve(member);
      })
    }
  };
}

describe("DiscordRoleService", () => {
  it("assigns visitor group for unlinked user and removes stale group/rank roles", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }) // no active link
    } as any;
    const client = {} as any;
    const service = new DiscordRoleService(pool, client, createConfig(), createLogger());
    const member = createMember(["g-dw", "r8"]);

    const result = await service.handleMemberJoin(member);

    expect(result.linked).toBe(false);
    expect(member.roles.remove).toHaveBeenCalledTimes(1);
    const removed = member.roles.remove.mock.calls[0][0] as string[];
    expect(removed).toEqual(expect.arrayContaining(["g-dw", "r8"]));
    expect(member.roles.add).toHaveBeenCalledWith(
      expect.arrayContaining(["g-visitor"]),
      expect.any(String)
    );
  });

  it("assigns tracked-alliance group and correct rank for linked user", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            discordUserId: "user-1",
            playerId: 1001,
            currentAllianceId: 10061,
            currentAllianceRank: 1
          }
        ]
      })
    } as any;
    const client = {} as any;
    const service = new DiscordRoleService(pool, client, createConfig(), createLogger());
    const member = createMember(["g-visitor", "g-dw", "r8"]);

    const result = await service.handleMemberJoin(member);

    expect(result.linked).toBe(true);
    const removed = member.roles.remove.mock.calls[0][0] as string[];
    expect(removed).toEqual(expect.arrayContaining(["g-visitor", "g-dw", "r8"]));
    const added = member.roles.add.mock.calls[0][0] as string[];
    expect(added).toEqual(expect.arrayContaining(["g-lm", "r1"]));
  });

  it("assigns alumni group for linked user outside tracked alliances", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            discordUserId: "user-1",
            playerId: 1001,
            currentAllianceId: 999999,
            currentAllianceRank: 6
          }
        ]
      })
    } as any;
    const client = {} as any;
    const service = new DiscordRoleService(pool, client, createConfig(), createLogger());
    const member = createMember(["g-visitor", "g-dw", "r8"]);

    const result = await service.handleMemberJoin(member);

    expect(result.linked).toBe(true);
    const added = member.roles.add.mock.calls[0][0] as string[];
    expect(added).toEqual(expect.arrayContaining(["g-alumni", "r6"]));
  });

  it("does not add rank role when linked player has unknown rank", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            discordUserId: "user-1",
            playerId: 1001,
            currentAllianceId: 530061,
            currentAllianceRank: 99
          }
        ]
      })
    } as any;
    const client = {} as any;
    const service = new DiscordRoleService(pool, client, createConfig(), createLogger());
    const member = createMember(["g-visitor", "r8"]);

    await service.handleMemberJoin(member);

    const added = member.roles.add.mock.calls[0][0] as string[];
    expect(added).toEqual(["g-dw"]);
  });

  it("reconciles all linked members and logs updated count", async () => {
    const linkedStates = [
      { discordUserId: "user-1", playerId: 1001, currentAllianceId: 530061, currentAllianceRank: 0 },
      { discordUserId: "user-2", playerId: 1002, currentAllianceId: 10061, currentAllianceRank: 1 },
      { discordUserId: "user-404", playerId: 1003, currentAllianceId: 10061, currentAllianceRank: 1 }
    ];
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: linkedStates })
    } as any;
    const member1 = createMember(["g-visitor"]);
    member1.id = "user-1";
    const member2 = createMember(["g-visitor"]);
    member2.id = "user-2";
    const guild = createGuildWithMembers({ "user-1": member1, "user-2": member2 });
    const client = {
      guilds: {
        fetch: vi.fn().mockResolvedValue(guild)
      }
    } as any;
    const logger = createLogger();
    const service = new DiscordRoleService(pool, client, createConfig(), logger);

    await service.reconcileAllLinkedMembers();

    expect(client.guilds.fetch).toHaveBeenCalledWith("guild-1");
    expect(guild.members.fetch).toHaveBeenCalledTimes(3);
    expect(member1.roles.add).toHaveBeenCalled();
    expect(member2.roles.add).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ updatedCount: 2 }, "Reconciled roles for linked members");
  });

  it("reconciles a single discord user when member exists and skips when missing", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { discordUserId: "user-1", playerId: 1001, currentAllianceId: 530061, currentAllianceRank: 0 }
          ]
        })
    } as any;
    const member = createMember(["g-visitor"]);
    member.id = "user-1";
    const guild = createGuildWithMembers({ "user-1": member });
    const client = {
      guilds: {
        fetch: vi.fn().mockResolvedValue(guild)
      }
    } as any;
    const service = new DiscordRoleService(pool, client, createConfig(), createLogger());

    await service.reconcileDiscordUser("user-1");
    await service.reconcileDiscordUser("user-404");

    expect(guild.members.fetch).toHaveBeenCalledWith("user-1");
    expect(guild.members.fetch).toHaveBeenCalledWith("user-404");
    expect(member.roles.add).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
