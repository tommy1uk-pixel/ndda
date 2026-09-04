CREATE TABLE IF NOT EXISTS trophies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trophy_name TEXT NOT NULL,
  competition_name TEXT NOT NULL,
  holder_name TEXT,
  awarded_season TEXT,
  return_due TEXT,
  returned INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0,1)),
  engraved INTEGER NOT NULL DEFAULT 0 CHECK (engraved IN (0,1)),
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trophies_return ON trophies(active, returned, return_due);
