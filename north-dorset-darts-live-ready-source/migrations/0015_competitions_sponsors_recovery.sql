CREATE TABLE IF NOT EXISTS individual_competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  competition_type TEXT NOT NULL CHECK (competition_type IN ('singles','doubles')),
  season_name TEXT NOT NULL,
  event_date TEXT,
  status TEXT NOT NULL DEFAULT 'entries_open' CHECK (status IN ('entries_open','drawn','completed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS competition_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES individual_competitions(id) ON DELETE CASCADE,
  player_1_id INTEGER NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  player_2_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, player_1_id, player_2_id)
);

CREATE TABLE IF NOT EXISTS competition_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES individual_competitions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  round_name TEXT NOT NULL,
  match_number INTEGER NOT NULL,
  entry_1_id INTEGER REFERENCES competition_entries(id) ON DELETE SET NULL,
  entry_2_id INTEGER REFERENCES competition_entries(id) ON DELETE SET NULL,
  winner_entry_id INTEGER REFERENCES competition_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','bye','completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, round_number, match_number)
);

CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  website_url TEXT,
  logo_url TEXT,
  sponsorship_amount_pence INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  season_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recovery_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reason TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_individual_competitions_season ON individual_competitions(season_name, event_date);
CREATE INDEX IF NOT EXISTS idx_competition_entries_competition ON competition_entries(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_matches_competition ON competition_matches(competition_id, round_number, match_number);
CREATE INDEX IF NOT EXISTS idx_sponsors_active_order ON sponsors(active, display_order, name);
CREATE INDEX IF NOT EXISTS idx_recovery_snapshots_created ON recovery_snapshots(created_at DESC);
