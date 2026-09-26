-- Drafts are no longer part of the wish workflow. Preserve archived wishes.
UPDATE gifts SET visibility='visible', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE visibility='draft';

-- Older databases retain the original column default; normalize legacy inserts.
CREATE TRIGGER gifts_publish_legacy_insert AFTER INSERT ON gifts
WHEN NEW.visibility='draft'
BEGIN
  UPDATE gifts SET visibility='visible' WHERE id=NEW.id;
END;
CREATE TRIGGER gifts_publish_legacy_update AFTER UPDATE OF visibility ON gifts
WHEN NEW.visibility='draft'
BEGIN
  UPDATE gifts SET visibility='visible' WHERE id=NEW.id;
END;
