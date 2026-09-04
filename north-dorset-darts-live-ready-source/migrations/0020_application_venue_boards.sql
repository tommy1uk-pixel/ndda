ALTER TABLE applications ADD COLUMN venue_board_count INTEGER CHECK (venue_board_count IS NULL OR (venue_board_count >= 1 AND venue_board_count <= 20));
