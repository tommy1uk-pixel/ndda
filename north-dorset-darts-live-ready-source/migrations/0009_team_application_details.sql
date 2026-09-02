ALTER TABLE applications ADD COLUMN team_name TEXT;
ALTER TABLE applications ADD COLUMN venue_name TEXT;
ALTER TABLE applications ADD COLUMN venue_address TEXT;

CREATE TABLE IF NOT EXISTS application_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_players_application ON application_players(application_id,id);
