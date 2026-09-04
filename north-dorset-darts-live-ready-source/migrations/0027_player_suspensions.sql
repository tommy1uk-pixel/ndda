CREATE TABLE IF NOT EXISTS player_suspensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  disciplinary_case_id INTEGER REFERENCES disciplinary_cases(id) ON DELETE SET NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_player_suspensions_dates ON player_suspensions(player_id, starts_on, ends_on);
