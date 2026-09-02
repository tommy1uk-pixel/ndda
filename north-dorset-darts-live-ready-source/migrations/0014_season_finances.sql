ALTER TABLE registration_payments ADD COLUMN season_name TEXT;
ALTER TABLE league_expenses ADD COLUMN season_name TEXT;
ALTER TABLE league_income ADD COLUMN season_name TEXT;
ALTER TABLE teams ADD COLUMN registration_season TEXT;

UPDATE registration_payments SET season_name=COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='current_season'),'2026/27') WHERE season_name IS NULL;
UPDATE league_expenses SET season_name=COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='current_season'),'2026/27') WHERE season_name IS NULL;
UPDATE league_income SET season_name=COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='current_season'),'2026/27') WHERE season_name IS NULL;
UPDATE teams SET registration_season=COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='current_season'),'2026/27') WHERE registration_season IS NULL;

CREATE INDEX IF NOT EXISTS idx_registration_payments_season ON registration_payments(season_name,received_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_expenses_season ON league_expenses(season_name,expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_league_income_season ON league_income(season_name,income_date DESC);

PRAGMA optimize;
