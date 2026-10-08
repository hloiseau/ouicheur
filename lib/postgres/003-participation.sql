ALTER TABLE ouicheur.tenants
  ADD COLUMN paypal text NOT NULL DEFAULT '',
  ADD COLUMN strict_contributions smallint NOT NULL DEFAULT 0 CHECK(strict_contributions IN (0,1));

CREATE TABLE ouicheur.payments (
  tenant_id uuid NOT NULL, id uuid NOT NULL, contribution_id text NOT NULL,
  transaction_ref text NOT NULL, currency text NOT NULL,
  gross integer NOT NULL CHECK(gross BETWEEN 1 AND 100000000),
  fee integer CHECK(fee BETWEEN 0 AND gross), net integer CHECK(net BETWEEN 0 AND gross),
  refunded integer NOT NULL DEFAULT 0 CHECK(refunded BETWEEN 0 AND gross),
  net_reversed integer NOT NULL DEFAULT 0 CHECK(net_reversed BETWEEN 0 AND COALESCE(net,gross)),
  disputed smallint NOT NULL DEFAULT 0 CHECK(disputed IN (0,1)),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  provenance text NOT NULL CHECK(provenance IN ('manual','verified')), created_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,contribution_id), UNIQUE(tenant_id,transaction_ref),
  FOREIGN KEY(tenant_id,contribution_id) REFERENCES ouicheur.contributions(tenant_id,id),
  CHECK((fee IS NULL AND net IS NULL) OR (fee IS NOT NULL AND net IS NOT NULL AND net=gross-fee))
);
CREATE TABLE ouicheur.payment_events (
  tenant_id uuid NOT NULL, id uuid NOT NULL, payment_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('confirmed_manual','confirmed_verified','correction_manual')),
  payload text NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,payment_id) REFERENCES ouicheur.payments(tenant_id,id)
);
CREATE INDEX payment_events_payment ON ouicheur.payment_events(tenant_id,payment_id,created_at);

-- Durable domain events, not addressed email jobs. A future consumer must
-- resolve preferences, rights and surprise protection before sending anything.
-- No bearer token, address, donor message or transaction reference is stored.
CREATE TABLE ouicheur.participation_outbox (
  tenant_id uuid NOT NULL, id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('reservation','declaration')),
  entity_id text NOT NULL, list_id text NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,kind,entity_id),
  FOREIGN KEY(tenant_id,list_id) REFERENCES ouicheur.lists(tenant_id,id)
);
CREATE INDEX participation_outbox_created ON ouicheur.participation_outbox(tenant_id,created_at,id);

DO $policy$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['payments','payment_events','participation_outbox'] LOOP
    EXECUTE format('ALTER TABLE ouicheur.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE ouicheur.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY tenant_scope ON ouicheur.%I USING (tenant_id=NULLIF(current_setting(''ouicheur.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''ouicheur.tenant_id'',true),'''')::uuid)',tab);
  END LOOP;
END $policy$;
