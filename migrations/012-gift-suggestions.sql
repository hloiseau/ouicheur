ALTER TABLE lists ADD COLUMN suggestions_enabled INTEGER NOT NULL DEFAULT 0 CHECK(suggestions_enabled IN (0,1));
CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id),
  token_hash TEXT UNIQUE,
  title TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','rejected')),
  gift_id TEXT REFERENCES gifts(id),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
) STRICT;
CREATE INDEX suggestions_queue ON suggestions(state,created_at,id);
CREATE INDEX suggestions_list ON suggestions(list_id);
