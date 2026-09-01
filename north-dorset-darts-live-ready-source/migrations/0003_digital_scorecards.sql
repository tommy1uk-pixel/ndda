PRAGMA foreign_keys = ON;

ALTER TABLE players ADD COLUMN highest_shot_in INTEGER NOT NULL DEFAULT 0 CHECK (highest_shot_in BETWEEN 0 AND 170);

CREATE TABLE IF NOT EXISTS match_scorecards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER NOT NULL UNIQUE REFERENCES fixtures(id) ON DELETE CASCADE,
  signed_scorecard_received INTEGER NOT NULL DEFAULT 0 CHECK (signed_scorecard_received IN (0,1)),
  beer_leg_winner_team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
  notes TEXT,
  entered_by TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scorecard_id INTEGER NOT NULL REFERENCES match_scorecards(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('doubles','singles','beer')),
  game_number INTEGER NOT NULL,
  home_player_1_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  home_player_2_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  away_player_1_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  away_player_2_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  home_legs INTEGER NOT NULL DEFAULT 0 CHECK (home_legs >= 0),
  away_legs INTEGER NOT NULL DEFAULT 0 CHECK (away_legs >= 0),
  winner_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  UNIQUE (scorecard_id, game_type, game_number)
);

CREATE TABLE IF NOT EXISTS match_player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scorecard_id INTEGER NOT NULL REFERENCES match_scorecards(id) ON DELETE CASCADE,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  appeared INTEGER NOT NULL DEFAULT 1 CHECK (appeared IN (0,1)),
  singles_wins INTEGER NOT NULL DEFAULT 0 CHECK (singles_wins >= 0),
  one_eighties INTEGER NOT NULL DEFAULT 0 CHECK (one_eighties >= 0),
  highest_checkout INTEGER NOT NULL DEFAULT 0 CHECK (highest_checkout BETWEEN 0 AND 170),
  highest_shot_in INTEGER NOT NULL DEFAULT 0 CHECK (highest_shot_in BETWEEN 0 AND 170),
  UNIQUE (scorecard_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_games_scorecard ON match_games(scorecard_id, game_type, game_number);
CREATE INDEX IF NOT EXISTS idx_match_player_stats_fixture ON match_player_stats(fixture_id, player_id);

PRAGMA optimize;
