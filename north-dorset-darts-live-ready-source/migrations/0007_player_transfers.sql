ALTER TABLE match_player_stats ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT;

UPDATE match_player_stats
SET team_id = (SELECT team_id FROM players WHERE players.id = match_player_stats.player_id)
WHERE team_id IS NULL;

CREATE TABLE IF NOT EXISTS player_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  from_team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
  to_team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
  effective_date TEXT NOT NULL,
  note TEXT,
  changed_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_team_id IS NULL OR to_team_id IS NULL OR from_team_id <> to_team_id)
);

CREATE INDEX IF NOT EXISTS idx_player_transfers_player ON player_transfers(player_id,effective_date DESC);

CREATE TRIGGER IF NOT EXISTS set_scorecard_player_team
AFTER INSERT ON match_player_stats
WHEN NEW.team_id IS NULL
BEGIN
  UPDATE match_player_stats
  SET team_id = (SELECT team_id FROM players WHERE id = NEW.player_id)
  WHERE id = NEW.id;
END;
