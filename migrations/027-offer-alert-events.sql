CREATE TABLE offer_alert_events (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES offer_price_history(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK(event_kind IN ('price','stock')),
  UNIQUE(observation_id,event_kind)
) STRICT;
CREATE INDEX offer_alert_events_list ON offer_alert_events(list_id);
ALTER TABLE notification_jobs ADD COLUMN offer_alert_id TEXT NOT NULL DEFAULT '';
