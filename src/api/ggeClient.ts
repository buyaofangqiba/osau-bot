import type { AppConfig } from "../config.js";
import type {
  GgeAllianceHistoryEntry,
  GgeAlliancePlayerUpdate,
  GgeAllianceResponse,
  GgeNameHistoryEntry
} from "../types/gge.js";

async function fetchJson<T>(
  baseUrl: string,
  serverCode: string,
  path: string,
  maxRetries = 3
): Promise<T> {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, normalizedBase);

  let attempt = 0;
  let lastError: unknown = undefined;
  while (attempt < maxRetries) {
    attempt += 1;
    try {
      const response = await fetch(url, {
        headers: {
          "gge-server": serverCode
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unknown API error");
}

export class GgeClient {
  constructor(private readonly config: AppConfig["gge"]) {}

  getAllianceById(allianceId: number): Promise<GgeAllianceResponse> {
    return fetchJson<GgeAllianceResponse>(
      this.config.baseUrl,
      this.config.serverCode,
      `/alliances/id/${allianceId}`
    );
  }

  getAlliancePlayerUpdates(allianceId: number): Promise<GgeAlliancePlayerUpdate[]> {
    return fetchJson<GgeAlliancePlayerUpdate[]>(
      this.config.baseUrl,
      this.config.serverCode,
      `/updates/alliances/${allianceId}/players`
    );
  }

  getPlayerNameUpdates(playerId: number): Promise<GgeNameHistoryEntry[]> {
    return fetchJson<GgeNameHistoryEntry[]>(
      this.config.baseUrl,
      this.config.serverCode,
      `/updates/players/${playerId}/names`
    );
  }

  getPlayerAllianceUpdates(playerId: number): Promise<GgeAllianceHistoryEntry[]> {
    return fetchJson<GgeAllianceHistoryEntry[]>(
      this.config.baseUrl,
      this.config.serverCode,
      `/updates/players/${playerId}/alliances`
    );
  }
}
