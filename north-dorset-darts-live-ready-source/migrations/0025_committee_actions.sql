CREATE TABLE IF NOT EXISTS committee_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_date TEXT NOT NULL,
  action_text TEXT NOT NULL,
  owner_name TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In progress','Completed')),
  completion_note TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_committee_actions_status ON committee_actions(status, due_date, meeting_date);
