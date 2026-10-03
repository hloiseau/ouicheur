ALTER TABLE sessions ADD COLUMN id TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN device TEXT NOT NULL DEFAULT '';
UPDATE sessions SET id=lower(hex(randomblob(16)));
CREATE UNIQUE INDEX sessions_id ON sessions(id);
CREATE INDEX sessions_expiry ON sessions(expires);
