CREATE TABLE gift_exchanges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  budget INTEGER CHECK(budget IS NULL OR budget>=0),
  currency TEXT NOT NULL,
  questions INTEGER NOT NULL DEFAULT 0 CHECK(questions IN (0,1)),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','drawn','cancelled')),
  created_at TEXT NOT NULL,
  drawn_at TEXT
) STRICT;
CREATE TABLE exchange_participants (
  exchange_id TEXT NOT NULL REFERENCES gift_exchanges(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0 CHECK(accepted IN (0,1)),
  wishes TEXT NOT NULL DEFAULT '',
  reminders INTEGER NOT NULL DEFAULT 0 CHECK(reminders IN (0,1)),
  questions_allowed INTEGER NOT NULL DEFAULT 0 CHECK(questions_allowed IN (0,1)),
  PRIMARY KEY(exchange_id,account_id)
) STRICT;
CREATE TABLE exchange_exclusions (
  exchange_id TEXT NOT NULL REFERENCES gift_exchanges(id) ON DELETE CASCADE,
  giver TEXT NOT NULL,
  recipient TEXT NOT NULL,
  PRIMARY KEY(exchange_id,giver,recipient),
  FOREIGN KEY(exchange_id,giver) REFERENCES exchange_participants(exchange_id,account_id),
  FOREIGN KEY(exchange_id,recipient) REFERENCES exchange_participants(exchange_id,account_id)
) STRICT;
CREATE TABLE exchange_assignments (
  exchange_id TEXT NOT NULL REFERENCES gift_exchanges(id) ON DELETE CASCADE,
  giver TEXT NOT NULL,
  recipient TEXT NOT NULL,
  PRIMARY KEY(exchange_id,giver),
  UNIQUE(exchange_id,recipient),
  CHECK(giver<>recipient),
  FOREIGN KEY(exchange_id,giver) REFERENCES exchange_participants(exchange_id,account_id),
  FOREIGN KEY(exchange_id,recipient) REFERENCES exchange_participants(exchange_id,account_id)
) STRICT;
CREATE TABLE exchange_questions (
  id TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES gift_exchanges(id) ON DELETE CASCADE,
  giver TEXT NOT NULL,
  recipient TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  reported INTEGER NOT NULL DEFAULT 0 CHECK(reported IN (0,1)),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX exchange_questions_pair ON exchange_questions(exchange_id,giver,recipient);
CREATE TRIGGER exchange_member_deleted BEFORE DELETE ON members BEGIN
  UPDATE gift_exchanges SET state='cancelled' WHERE id IN (SELECT exchange_id FROM exchange_participants WHERE account_id=OLD.id);
  DELETE FROM exchange_questions WHERE exchange_id IN (SELECT exchange_id FROM exchange_participants WHERE account_id=OLD.id);
  DELETE FROM exchange_assignments WHERE exchange_id IN (SELECT exchange_id FROM exchange_participants WHERE account_id=OLD.id);
END;
