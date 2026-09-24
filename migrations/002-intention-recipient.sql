ALTER TABLE contributions ADD COLUMN paypal_recipient TEXT NOT NULL DEFAULT '';
UPDATE contributions SET paypal_recipient=COALESCE((SELECT paypal FROM owner WHERE id=1),'');
