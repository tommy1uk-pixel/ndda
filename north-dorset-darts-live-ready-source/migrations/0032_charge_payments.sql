ALTER TABLE team_charges ADD COLUMN paid_at TEXT;
ALTER TABLE team_charges ADD COLUMN league_income_id INTEGER REFERENCES league_income(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_charges_income ON team_charges(league_income_id);
