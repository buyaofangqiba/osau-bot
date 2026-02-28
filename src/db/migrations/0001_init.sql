CREATE TABLE IF NOT EXISTS alliances (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id BIGINT PRIMARY KEY,
  current_name TEXT NOT NULL,
  current_alliance_id BIGINT REFERENCES alliances(id),
  current_alliance_rank SMALLINT,
  level INTEGER,
  might BIGINT,
  loot BIGINT,
  honor BIGINT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_name_history (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id),
  old_name TEXT,
  new_name TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, new_name, observed_at)
);

CREATE TABLE IF NOT EXISTS player_alliance_memberships (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id),
  alliance_id BIGINT REFERENCES alliances(id),
  joined_at TIMESTAMPTZ NOT NULL,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discord_links (
  id BIGSERIAL PRIMARY KEY,
  discord_user_id TEXT NOT NULL UNIQUE,
  player_id BIGINT NOT NULL REFERENCES players(id),
  linked_by_discord_user_id TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlinked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim_requests (
  id BIGSERIAL PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  player_id BIGINT REFERENCES players(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'canceled', 'just_visiting')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_discord_user_id TEXT,
  denial_reason TEXT,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rank_change_history (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id),
  old_rank SMALLINT,
  new_rank SMALLINT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'sync'
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  message TEXT,
  processed_players INTEGER NOT NULL DEFAULT 0,
  updated_players INTEGER NOT NULL DEFAULT 0,
  role_changes INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS command_audit (
  id BIGSERIAL PRIMARY KEY,
  command_name TEXT NOT NULL,
  actor_discord_user_id TEXT NOT NULL,
  target_discord_user_id TEXT,
  target_player_id BIGINT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_current_alliance_id ON players(current_alliance_id);
CREATE INDEX IF NOT EXISTS idx_claim_requests_status_requested_at ON claim_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rank_change_history_player_id_observed_at ON rank_change_history(player_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_audit_created_at ON command_audit(created_at DESC);
