CREATE TABLE notification_preferences (
  account_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  quiet_start TEXT NOT NULL DEFAULT '22:00',
  quiet_end TEXT NOT NULL DEFAULT '08:00',
  rules TEXT NOT NULL DEFAULT '[]'
) STRICT;
CREATE TABLE account_email (
  account_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
  challenge_hash TEXT,
  expires INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0
) STRICT;
ALTER TABLE notification_jobs ADD COLUMN account_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE notification_jobs ADD COLUMN channel TEXT NOT NULL DEFAULT 'ntfy' CHECK(channel IN ('ntfy','email'));
ALTER TABLE notification_jobs ADD COLUMN list_id TEXT NOT NULL DEFAULT '';
ALTER TABLE notification_jobs ADD COLUMN source_key TEXT NOT NULL DEFAULT '';
ALTER TABLE notification_jobs ADD COLUMN frequency TEXT NOT NULL DEFAULT 'instant' CHECK(frequency IN ('instant','daily'));
UPDATE notification_jobs SET source_key=substr(event_key,length(kind)+2);
CREATE TABLE notification_delivery (
  account_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY(account_id,channel,day)
) STRICT;
