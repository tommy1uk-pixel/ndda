ALTER TABLE sponsors ADD COLUMN paid_at TEXT;
ALTER TABLE sponsors ADD COLUMN league_income_id INTEGER REFERENCES league_income(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sponsors_income ON sponsors(league_income_id);
