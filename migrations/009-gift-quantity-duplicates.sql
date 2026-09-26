ALTER TABLE gifts ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 999);
DROP INDEX gifts_url_unique;
CREATE INDEX gifts_url ON gifts(url);
