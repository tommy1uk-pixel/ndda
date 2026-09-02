CREATE TABLE IF NOT EXISTS league_income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  income_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bank_transfer')),
  reference_note TEXT,
  entered_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_league_income_date
ON league_income(income_date DESC, id DESC);

PRAGMA optimize;
