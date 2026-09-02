ALTER TABLE teams ADD COLUMN registration_team_fee_pence INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE teams ADD COLUMN registration_player_fee_pence INTEGER NOT NULL DEFAULT 300;
ALTER TABLE teams ADD COLUMN registration_amount_paid_pence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN registration_payment_method TEXT;
ALTER TABLE teams ADD COLUMN registration_payment_note TEXT;
ALTER TABLE teams ADD COLUMN registration_fee_waived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN registration_paid_at TEXT;
