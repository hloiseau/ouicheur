CREATE TABLE ouicheur.tenants (id uuid PRIMARY KEY);
CREATE TABLE ouicheur.lists (
  tenant_id uuid NOT NULL REFERENCES ouicheur.tenants(id),
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 64),
  name text NOT NULL, description text NOT NULL DEFAULT '',
  visibility text NOT NULL CHECK(visibility IN ('public','unlisted','private')),
  archived smallint NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  event_date text NOT NULL DEFAULT '', share_hash text,
  surprise_mode smallint NOT NULL DEFAULT 0 CHECK(surprise_mode IN (0,1)),
  suggestions_enabled smallint NOT NULL DEFAULT 0 CHECK(suggestions_enabled IN (0,1)),
  event_annual smallint NOT NULL DEFAULT 0 CHECK(event_annual IN (0,1)),
  event_timezone text NOT NULL DEFAULT 'Europe/Paris', leap_day text NOT NULL DEFAULT 'feb28',
  created_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,id)
);
-- This first slice persists purchase state. Full gift creation, funding and
-- authentication are deliberately not claimed by this migration.
CREATE TABLE ouicheur.gifts (
  tenant_id uuid NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 64),
  list_id text NOT NULL,
  purchased smallint NOT NULL DEFAULT 0 CHECK(purchased IN (0,1)),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY(tenant_id,list_id) REFERENCES ouicheur.lists(tenant_id,id)
);
CREATE INDEX gifts_list ON ouicheur.gifts(tenant_id,list_id);
-- Reveal state belongs to a session within a tenant. This is not a login table.
CREATE TABLE ouicheur.session_reveals (
  tenant_id uuid NOT NULL REFERENCES ouicheur.tenants(id), session_id text NOT NULL,
  surprises_revealed smallint NOT NULL DEFAULT 0 CHECK(surprises_revealed IN (0,1)),
  PRIMARY KEY(tenant_id,session_id)
);
CREATE TABLE ouicheur.audit (
  tenant_id uuid NOT NULL REFERENCES ouicheur.tenants(id), id uuid NOT NULL,
  action text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL,
  created_at timestamptz NOT NULL, PRIMARY KEY(tenant_id,id)
);
CREATE INDEX audit_entity ON ouicheur.audit(tenant_id,entity_id,created_at);

ALTER TABLE ouicheur.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ouicheur.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ouicheur.tenants
  USING (id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid)
  WITH CHECK (id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid);
ALTER TABLE ouicheur.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE ouicheur.lists FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ouicheur.lists
  USING (tenant_id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid);
ALTER TABLE ouicheur.gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ouicheur.gifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ouicheur.gifts
  USING (tenant_id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid);
ALTER TABLE ouicheur.session_reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ouicheur.session_reveals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ouicheur.session_reveals
  USING (tenant_id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid);
ALTER TABLE ouicheur.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ouicheur.audit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ouicheur.audit
  USING (tenant_id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('ouicheur.tenant_id',true),'')::uuid);
