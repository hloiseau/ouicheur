ALTER TABLE gifts ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
WITH ordered AS (SELECT id,row_number() OVER (PARTITION BY list_id ORDER BY created_at DESC,id)-1 n FROM gifts)
UPDATE gifts SET position=(SELECT n FROM ordered WHERE ordered.id=gifts.id);
CREATE INDEX gifts_list_position ON gifts(list_id,position,id);
CREATE TABLE list_preferences (
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK(field IN ('interests','sizes','colors','owned','avoid')),
  value TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('shared','private')),
  PRIMARY KEY(list_id,field)
) STRICT;
CREATE TABLE organizer_notes (
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  note TEXT NOT NULL,
  PRIMARY KEY(list_id,account_id)
) STRICT;
