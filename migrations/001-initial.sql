CREATE TABLE owner (
  id INTEGER PRIMARY KEY CHECK(id=1),
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  banner TEXT NOT NULL DEFAULT '',
  socials TEXT NOT NULL DEFAULT '[]',
  paypal TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'EUR'
) STRICT;
CREATE TABLE sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL) STRICT;
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, until INTEGER NOT NULL) STRICT;
CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE gifts (
  id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
  target INTEGER NOT NULL CHECK(target > 0 AND target <= 100000000),
  currency TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2),
  visibility TEXT NOT NULL DEFAULT 'draft' CHECK(visibility IN ('draft','visible','archived')),
  purchased INTEGER NOT NULL DEFAULT 0 CHECK(purchased IN (0,1)),
  closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0,1)),
  source TEXT, source_id TEXT,
  suggested_price INTEGER, suggested_currency TEXT, extracted_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(source,source_id)
) STRICT;
CREATE UNIQUE INDEX gifts_url_unique ON gifts(url);
CREATE TABLE contributions (
  id TEXT PRIMARY KEY, gift_id TEXT NOT NULL REFERENCES gifts(id),
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 100000000),
  currency TEXT NOT NULL, nickname TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
  public_name INTEGER NOT NULL DEFAULT 0 CHECK(public_name IN (0,1)),
  public_message INTEGER NOT NULL DEFAULT 0 CHECK(public_message IN (0,1)),
  state TEXT NOT NULL CHECK(state IN ('intent','declared','detected','expired','rejected')),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
) STRICT;
CREATE TABLE payments (
  id TEXT PRIMARY KEY, contribution_id TEXT NOT NULL UNIQUE REFERENCES contributions(id),
  transaction_ref TEXT NOT NULL UNIQUE, currency TEXT NOT NULL,
  gross INTEGER NOT NULL CHECK(gross > 0 AND gross <= 100000000),
  fee INTEGER CHECK(fee >= 0 AND fee <= gross),
  net INTEGER CHECK(net >= 0 AND net <= gross),
  refunded INTEGER NOT NULL DEFAULT 0 CHECK(refunded >= 0 AND refunded <= gross),
  net_reversed INTEGER NOT NULL DEFAULT 0 CHECK(net_reversed >= 0 AND net_reversed <= COALESCE(net,gross)),
  disputed INTEGER NOT NULL DEFAULT 0 CHECK(disputed IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  provenance TEXT NOT NULL CHECK(provenance IN ('manual','verified')),
  created_at TEXT NOT NULL,
  CHECK((fee IS NULL AND net IS NULL) OR (fee IS NOT NULL AND net = gross - fee))
) STRICT;
CREATE TABLE payment_events (
  id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id),
  kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity_id TEXT NOT NULL,
  detail TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE imports (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK(state IN ('queued','running','preview','failed','done')),
  attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
  items TEXT NOT NULL DEFAULT '[]', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
) STRICT;
CREATE INDEX contributions_gift ON contributions(gift_id);
CREATE INDEX contributions_state ON contributions(state);
