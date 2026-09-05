CREATE TABLE IF NOT EXISTS meeting_agenda_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_date TEXT NOT NULL,
  title TEXT NOT NULL,
  submitted_by TEXT,
  notes TEXT,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal','Important','Urgent')),
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Discussed','Deferred')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meeting_agenda_date ON meeting_agenda_items(meeting_date, status, priority);
