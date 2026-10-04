-- Existing contributions retain their PayPal journey and recipient snapshot.
ALTER TABLE contributions ADD COLUMN method TEXT NOT NULL DEFAULT 'paypal'
  CHECK(method IN ('paypal','bank_transfer','pledge'));
