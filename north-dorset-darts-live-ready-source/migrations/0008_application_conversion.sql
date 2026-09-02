ALTER TABLE applications ADD COLUMN converted_resource TEXT;
ALTER TABLE applications ADD COLUMN converted_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_applications_conversion ON applications(converted_resource,converted_id);
