CREATE TABLE donor_reservations (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  saved_at TEXT NOT NULL
) STRICT;
CREATE INDEX donor_reservations_account ON donor_reservations(account_id,saved_at,reservation_id);
CREATE TABLE received_gifts (
  gift_id TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  received INTEGER NOT NULL DEFAULT 0 CHECK(received IN (0,1)),
  received_on TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  thanks TEXT NOT NULL DEFAULT '',
  thanked INTEGER NOT NULL DEFAULT 0 CHECK(thanked IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(gift_id,account_id)
) STRICT;
CREATE TRIGGER member_tracking_delete AFTER DELETE ON members BEGIN
  DELETE FROM donor_reservations WHERE account_id=OLD.id;
  DELETE FROM received_gifts WHERE account_id=OLD.id;
END;
