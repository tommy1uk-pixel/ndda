CREATE TABLE IF NOT EXISTS league_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bank_transfer')),
  reference_note TEXT,
  entered_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_league_expenses_date
ON league_expenses(expense_date DESC, id DESC);

PRAGMA optimize;
