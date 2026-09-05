CREATE TABLE IF NOT EXISTS fixture_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  old_starts_at TEXT,
  new_starts_at TEXT,
  old_status TEXT,
  new_status TEXT,
  reason TEXT,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fixture_changes_fixture ON fixture_changes(fixture_id, changed_at DESC);
