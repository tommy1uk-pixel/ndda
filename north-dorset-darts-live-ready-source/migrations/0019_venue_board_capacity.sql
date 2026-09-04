ALTER TABLE venues ADD COLUMN board_count INTEGER NOT NULL DEFAULT 1 CHECK (board_count >= 1 AND board_count <= 20);
ALTER TABLE individual_competitions ADD COLUMN boards_required INTEGER NOT NULL DEFAULT 1 CHECK (boards_required >= 1 AND boards_required <= 20);
