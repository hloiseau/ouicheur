CREATE TABLE gift_priorities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT CHECK(name IS NULL OR (length(trim(name)) BETWEEN 1 AND 60)),
  position INTEGER NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1))
) STRICT;
CREATE UNIQUE INDEX gift_priorities_featured ON gift_priorities(featured) WHERE featured=1;
INSERT INTO gift_priorities(id,name,position,featured) VALUES (0,NULL,2,0),(1,NULL,1,0),(2,NULL,0,1);
-- Preserve the legacy column and all references to gifts. Nullable is required
-- for SQLite ADD COLUMN with a foreign key on a populated table.
ALTER TABLE gifts ADD COLUMN priority_id INTEGER REFERENCES gift_priorities(id);
UPDATE gifts SET priority_id=priority;
CREATE INDEX gifts_priority_id ON gifts(priority_id);
