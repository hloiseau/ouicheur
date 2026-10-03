ALTER TABLE gifts ADD COLUMN kind TEXT NOT NULL DEFAULT 'product' CHECK(kind IN ('product','experience','service','handmade','other'));
ALTER TABLE gifts ADD COLUMN budget_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(budget_mode IN ('fixed','unknown','free'));
ALTER TABLE gifts ADD COLUMN size TEXT NOT NULL DEFAULT '';
ALTER TABLE gifts ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE gifts ADD COLUMN model TEXT NOT NULL DEFAULT '';
ALTER TABLE gifts ADD COLUMN variant_note TEXT NOT NULL DEFAULT '';
ALTER TABLE gifts ADD COLUMN variant_policy TEXT NOT NULL DEFAULT 'exact' CHECK(variant_policy IN ('exact','flexible'));
ALTER TABLE gifts ADD COLUMN time_hint TEXT NOT NULL DEFAULT '';
ALTER TABLE gifts ADD COLUMN original_url TEXT NOT NULL DEFAULT '';
UPDATE gifts SET original_url=url;
CREATE INDEX gifts_variant ON gifts(url,size,color,model);
CREATE TABLE gift_offers (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  condition TEXT NOT NULL CHECK(condition IN ('new','used','refurbished','handmade')),
  note TEXT NOT NULL DEFAULT '',
  price INTEGER CHECK(price IS NULL OR (price>=0 AND price<=100000000)),
  currency TEXT NOT NULL,
  shipping INTEGER CHECK(shipping IS NULL OR (shipping>=0 AND shipping<=100000000)),
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK(availability IN ('unknown','available','unavailable')),
  checked_at TEXT,
  position INTEGER NOT NULL
) STRICT;
CREATE INDEX gift_offers_gift ON gift_offers(gift_id,position);
ALTER TABLE reservations ADD COLUMN details_snapshot TEXT NOT NULL DEFAULT '';
