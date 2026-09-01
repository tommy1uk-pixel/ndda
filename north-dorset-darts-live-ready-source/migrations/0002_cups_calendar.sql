PRAGMA foreign_keys = ON;

ALTER TABLE fixtures ADD COLUMN competition TEXT NOT NULL DEFAULT 'League';
ALTER TABLE fixtures ADD COLUMN round_name TEXT;

CREATE TABLE IF NOT EXISTS cup_ties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  division TEXT NOT NULL,
  competition TEXT NOT NULL,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  round_name TEXT NOT NULL,
  tie_number INTEGER NOT NULL,
  home_team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
  away_team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
  fixture_id INTEGER UNIQUE REFERENCES fixtures(id) ON DELETE SET NULL,
  winner_team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('bye','scheduled','completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition, division, round_number, tie_number)
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('league','cup','end_of_season','presentation','agm','meeting','social','other')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  location_text TEXT,
  description TEXT,
  public INTEGER NOT NULL DEFAULT 1 CHECK (public IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fixtures_competition_round ON fixtures(competition, round_name, starts_at);
CREATE INDEX IF NOT EXISTS idx_cup_ties_division_round ON cup_ties(division, competition, round_number, tie_number);
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts ON calendar_events(starts_at, event_type);

PRAGMA optimize;
