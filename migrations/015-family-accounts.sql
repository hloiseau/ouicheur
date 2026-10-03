CREATE TABLE members (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE member_lists (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  PRIMARY KEY(member_id,list_id)
) STRICT;
CREATE TABLE member_invitations (
  member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires INTEGER NOT NULL
) STRICT;
CREATE TABLE family_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('adult','child')),
  recipient TEXT NOT NULL DEFAULT '',
  CHECK(kind='adult' OR recipient='')
) STRICT;
ALTER TABLE lists ADD COLUMN profile_id TEXT REFERENCES family_profiles(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN member_id TEXT REFERENCES members(id) ON DELETE CASCADE;
CREATE INDEX sessions_member ON sessions(member_id);
CREATE TABLE member_uploads (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  PRIMARY KEY(member_id,path)
) STRICT;
