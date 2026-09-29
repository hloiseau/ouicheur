ALTER TABLE lists ADD COLUMN surprise_mode INTEGER NOT NULL DEFAULT 0 CHECK(surprise_mode IN (0,1));
ALTER TABLE sessions ADD COLUMN surprises_revealed INTEGER NOT NULL DEFAULT 0 CHECK(surprises_revealed IN (0,1));
