CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','unlisted','private')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  event_date TEXT NOT NULL DEFAULT '',
  share_hash TEXT,
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO lists(id,name,created_at) VALUES ('default','Ma Ouichlist',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- SQLite cannot add a non-null REFERENCES column to an existing populated table.
-- Triggers enforce the reference without rebuilding gifts or its financial children.
ALTER TABLE gifts ADD COLUMN list_id TEXT NOT NULL DEFAULT 'default';
CREATE TRIGGER gifts_list_insert BEFORE INSERT ON gifts
WHEN NOT EXISTS(SELECT 1 FROM lists WHERE id=NEW.list_id)
BEGIN SELECT RAISE(ABORT,'Unknown list'); END;
CREATE TRIGGER gifts_list_update BEFORE UPDATE OF list_id ON gifts
WHEN NOT EXISTS(SELECT 1 FROM lists WHERE id=NEW.list_id)
BEGIN SELECT RAISE(ABORT,'Unknown list'); END;
CREATE TRIGGER lists_restrict_delete BEFORE DELETE ON lists
WHEN EXISTS(SELECT 1 FROM gifts WHERE list_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'List still has gifts'); END;
CREATE TRIGGER lists_restrict_id BEFORE UPDATE OF id ON lists
WHEN NEW.id<>OLD.id AND EXISTS(SELECT 1 FROM gifts WHERE list_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'List still has gifts'); END;
CREATE INDEX gifts_list ON gifts(list_id);
ALTER TABLE owner ADD COLUMN strict_contributions INTEGER NOT NULL DEFAULT 0 CHECK(strict_contributions IN (0,1));
CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 999),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','purchased','cancelled','expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX reservations_gift ON reservations(gift_id,state,expires_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE notification_jobs (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed')),
  next_attempt INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE backup_jobs (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN ('running','done','failed')),
  created_at TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE product_checks (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  url TEXT NOT NULL,
  price INTEGER,
  currency TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT 'unknown',
  previous_target INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  checked_at TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1)),
  state TEXT NOT NULL CHECK(state IN ('ok','failed'))
) STRICT;
CREATE INDEX product_checks_gift ON product_checks(gift_id,checked_at);
