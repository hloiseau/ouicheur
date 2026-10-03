CREATE TABLE offer_price_history (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  hostname TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  price INTEGER,
  currency TEXT NOT NULL DEFAULT '',
  shipping INTEGER,
  availability TEXT NOT NULL DEFAULT 'unknown',
  checked_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('ok','failed','uncertain')),
  method TEXT NOT NULL CHECK(method IN ('manual','scheduled'))
) STRICT;
CREATE INDEX price_history_offer ON offer_price_history(gift_id,offer_id,checked_at DESC);
CREATE INDEX price_history_quota ON offer_price_history(method,checked_at);
CREATE TABLE price_watches (
  gift_id TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL,
  currency TEXT NOT NULL,
  threshold INTEGER,
  stock_alert INTEGER NOT NULL DEFAULT 0 CHECK(stock_alert IN (0,1)),
  automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)),
  confirmed_variant INTEGER NOT NULL DEFAULT 0 CHECK(confirmed_variant IN (0,1)),
  paused TEXT NOT NULL DEFAULT '',
  next_check INTEGER NOT NULL DEFAULT 0,
  last_price_alert TEXT NOT NULL DEFAULT '',
  last_stock_alert TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(gift_id,offer_id)
) STRICT;
ALTER TABLE product_checks ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';

CREATE TABLE price_poll_usage (
  scope TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(scope,bucket)
) STRICT;
