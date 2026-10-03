ALTER TABLE lists ADD COLUMN event_annual INTEGER NOT NULL DEFAULT 0 CHECK(event_annual IN (0,1));
ALTER TABLE lists ADD COLUMN event_timezone TEXT NOT NULL DEFAULT 'Europe/Paris';
ALTER TABLE lists ADD COLUMN leap_day TEXT NOT NULL DEFAULT 'feb28' CHECK(leap_day IN ('feb28','skip'));
CREATE TABLE calendar_feeds (
  list_id TEXT PRIMARY KEY REFERENCES lists(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  include_name INTEGER NOT NULL DEFAULT 0 CHECK(include_name IN (0,1)),
  include_description INTEGER NOT NULL DEFAULT 0 CHECK(include_description IN (0,1)),
  include_link INTEGER NOT NULL DEFAULT 0 CHECK(include_link IN (0,1)),
  created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER calendar_revoke AFTER UPDATE OF visibility,archived ON lists
WHEN NEW.visibility<>OLD.visibility OR NEW.archived=1
BEGIN DELETE FROM calendar_feeds WHERE list_id=NEW.id; END;
