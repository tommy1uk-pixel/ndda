CREATE TABLE IF NOT EXISTS committee_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_name TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  responsibilities TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_committee_contacts_active ON committee_contacts(active, role_name);
