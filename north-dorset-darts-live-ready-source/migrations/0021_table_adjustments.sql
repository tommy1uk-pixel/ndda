CREATE TABLE IF NOT EXISTS table_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  points INTEGER NOT NULL CHECK(points BETWEEN -100 AND 100),
  reason TEXT NOT NULL,
  season_name TEXT NOT NULL,
  entered_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_table_adjustments_team_season ON table_adjustments(team_id,season_name);
