CREATE TABLE IF NOT EXISTS committee_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_type TEXT NOT NULL DEFAULT 'Committee meeting',
  meeting_date TEXT NOT NULL,
  location_text TEXT,
  attendees TEXT,
  minutes_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Approved')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_committee_meetings_date ON committee_meetings(meeting_date DESC, status);
