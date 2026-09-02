CREATE TABLE IF NOT EXISTS season_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_name TEXT NOT NULL UNIQUE,
  snapshot TEXT NOT NULL,
  archived_by TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_season_archives_date ON season_archives(archived_at DESC);
