CREATE TABLE IF NOT EXISTS correspondence_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL CHECK (direction IN ('Incoming','Outgoing')),
  correspondence_date TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  subject TEXT NOT NULL,
  summary TEXT,
  follow_up_due TEXT,
  status TEXT NOT NULL DEFAULT 'Awaiting action' CHECK (status IN ('Awaiting action','Awaiting reply','Complete')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_correspondence_follow_up ON correspondence_log(status, follow_up_due, correspondence_date);
