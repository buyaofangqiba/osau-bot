export interface GgeAlliancePlayer {
  player_id: number;
  player_name: string;
  alliance_rank: number;
  might?: number;
  honor?: number;
  loot?: number;
  level?: number;
}

export interface GgeAllianceResponse {
  alliance_id: number;
  alliance_name?: string;
  players: GgeAlliancePlayer[];
}

export interface GgeAlliancePlayerUpdate {
  player_id: number;
  player_name: string;
  event_type: "join" | "leave" | string;
  date?: string;
}

export interface GgeNameHistoryEntry {
  player_id: number;
  old_name?: string;
  new_name?: string;
  date?: string;
}

export interface GgeAllianceHistoryEntry {
  player_id: number;
  alliance_id?: number;
  alliance_name?: string;
  date?: string;
}
