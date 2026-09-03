ALTER TABLE individual_competitions ADD COLUMN event_time TEXT;
ALTER TABLE individual_competitions ADD COLUMN venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_individual_competitions_venue ON individual_competitions(venue_id);
