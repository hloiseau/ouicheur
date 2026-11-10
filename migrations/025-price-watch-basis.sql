ALTER TABLE price_watches ADD COLUMN threshold_basis TEXT NOT NULL DEFAULT 'price'
  CHECK(threshold_basis IN ('price', 'delivered'));
