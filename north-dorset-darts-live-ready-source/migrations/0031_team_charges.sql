CREATE TABLE IF NOT EXISTS team_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  charge_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount_pence INTEGER NOT NULL CHECK (amount_pence >= 0),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid','Paid','Waived')),
  payment_method TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_charges_status ON team_charges(status, due_date, team_id);
