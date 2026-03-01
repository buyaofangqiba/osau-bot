import { afterEach, describe, expect, it, vi } from "vitest";
import { GgeClient } from "../src/api/ggeClient.js";

function createClient() {
  return new GgeClient({
    baseUrl: "https://api.gge-tracker.com/api/v1",
    serverCode: "WORLD2",
    syncAllianceIds: [530061]
  });
}

describe("GgeClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds request URL and sends gge-server header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ alliance_name: "Dark Warriors", players: [] })
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient();

    const result = await client.getAllianceById(530061);

    expect(result).toEqual({ alliance_name: "Dark Warriors", players: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("alliances/id/530061", "https://api.gge-tracker.com/api/v1/"),
      { headers: { "gge-server": "WORLD2" } }
    );
  });

  it("retries on failure and eventually succeeds", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === "function") {
        callback();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network 1"))
      .mockRejectedValueOnce(new Error("network 2"))
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([{ player_id: 1 }])
      });
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient();

    const result = await client.getAlliancePlayerUpdates(530061);

    expect(result).toEqual([{ player_id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws on non-2xx response after retries", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === "function") {
        callback();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable"
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient();

    await expect(client.getPlayerNameUpdates(1001)).rejects.toThrow("HTTP 503 Service Unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
