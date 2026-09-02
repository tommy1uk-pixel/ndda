CREATE TABLE IF NOT EXISTS registration_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  amount_pence INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bank_transfer','adjustment')),
  note TEXT,
  received_by TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registration_payments_received_at
ON registration_payments(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_payments_team_id
ON registration_payments(team_id, received_at DESC);

INSERT INTO registration_payments (team_id,amount_pence,payment_method,note,received_by,received_at)
SELECT id,registration_amount_paid_pence,COALESCE(registration_payment_method,'cash'),registration_payment_note,'Imported existing balance',COALESCE(registration_paid_at,CURRENT_TIMESTAMP)
FROM teams
WHERE registration_amount_paid_pence>0
  AND NOT EXISTS (SELECT 1 FROM registration_payments);

PRAGMA optimize;
