CREATE TABLE suggestion_coordinators (
  list_id TEXT PRIMARY KEY REFERENCES lists(id),
  member_id TEXT NOT NULL REFERENCES members(id)
) STRICT;

-- Kept separate from published wishes: no public counters, funding, image or
-- reservation endpoint can accidentally reveal a secretly prepared gift.
CREATE TABLE secret_suggestions (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  token_hash TEXT UNIQUE,
  title TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','rejected')),
  plan_title TEXT NOT NULL DEFAULT '',
  plan_note TEXT NOT NULL DEFAULT '',
  prepared INTEGER NOT NULL DEFAULT 0 CHECK(prepared IN (0,1)),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
) STRICT;
CREATE INDEX secret_suggestions_inbox ON secret_suggestions(member_id,state,created_at,id);
