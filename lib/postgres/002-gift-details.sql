ALTER TABLE ouicheur.tenants ADD COLUMN currency text NOT NULL DEFAULT 'EUR'
  CHECK(currency IN ('EUR','USD','GBP','CAD','CHF','AUD'));
CREATE TABLE ouicheur.categories (
  tenant_id uuid NOT NULL REFERENCES ouicheur.tenants(id), id text NOT NULL,
  name text NOT NULL, image text NOT NULL DEFAULT '',
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,name)
);
CREATE TABLE ouicheur.gift_priorities (
  tenant_id uuid NOT NULL REFERENCES ouicheur.tenants(id), id bigint NOT NULL CHECK(id BETWEEN 0 AND 9007199254740991),
  name text, position integer NOT NULL, featured smallint NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
  PRIMARY KEY(tenant_id,id)
);
CREATE UNIQUE INDEX gift_priorities_featured ON ouicheur.gift_priorities(tenant_id) WHERE featured=1;
INSERT INTO ouicheur.gift_priorities(tenant_id,id,position,featured)
  SELECT t.id,p.id,p.position,p.featured FROM ouicheur.tenants t
  CROSS JOIN (VALUES (0,2,0),(1,1,0),(2,0,1)) AS p(id,position,featured);

-- Preserve the IDs and purchase state of the experimental 001 rows. Their
-- missing metadata must be supplied explicitly; it must never be invented.
ALTER TABLE ouicheur.gifts
  ADD COLUMN details_ready smallint NOT NULL DEFAULT 0 CHECK(details_ready IN (0,1)),
  ADD COLUMN url text NOT NULL DEFAULT '',
  ADD COLUMN title text NOT NULL DEFAULT '',
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN image text NOT NULL DEFAULT '',
  ADD COLUMN target integer NOT NULL DEFAULT 1 CHECK(target BETWEEN 1 AND 100000000),
  ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 999),
  ADD COLUMN currency text NOT NULL DEFAULT 'EUR' CHECK(currency IN ('EUR','USD','GBP','CAD','CHF','AUD')),
  ADD COLUMN category_id text,
  ADD COLUMN priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2),
  ADD COLUMN priority_id bigint NOT NULL DEFAULT 0,
  ADD COLUMN visibility text NOT NULL DEFAULT 'visible' CHECK(visibility IN ('visible','archived')),
  ADD COLUMN closed smallint NOT NULL DEFAULT 0 CHECK(closed IN (0,1)),
  ADD COLUMN source text, ADD COLUMN source_id text,
  ADD COLUMN suggested_price integer CHECK(suggested_price BETWEEN 1 AND 100000000),
  ADD COLUMN suggested_currency text, ADD COLUMN extracted_at timestamptz,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN kind text NOT NULL DEFAULT 'other' CHECK(kind IN ('product','experience','service','handmade','other')),
  ADD COLUMN budget_mode text NOT NULL DEFAULT 'unknown' CHECK(budget_mode IN ('fixed','unknown','free')),
  ADD COLUMN size text NOT NULL DEFAULT '', ADD COLUMN color text NOT NULL DEFAULT '',
  ADD COLUMN model text NOT NULL DEFAULT '', ADD COLUMN variant_note text NOT NULL DEFAULT '',
  ADD COLUMN variant_policy text NOT NULL DEFAULT 'exact' CHECK(variant_policy IN ('exact','flexible')),
  ADD COLUMN time_hint text NOT NULL DEFAULT '', ADD COLUMN original_url text NOT NULL DEFAULT '',
  ADD COLUMN position integer NOT NULL DEFAULT 0,
  ADD COLUMN duplicate_key text,
  ADD FOREIGN KEY(tenant_id,category_id) REFERENCES ouicheur.categories(tenant_id,id),
  ADD FOREIGN KEY(tenant_id,priority_id) REFERENCES ouicheur.gift_priorities(tenant_id,id),
  ADD UNIQUE(tenant_id,source,source_id);
CREATE INDEX gifts_duplicate ON ouicheur.gifts(tenant_id,duplicate_key);
CREATE INDEX gifts_position ON ouicheur.gifts(tenant_id,list_id,position,id);
CREATE TABLE ouicheur.gift_offers (
  tenant_id uuid NOT NULL, id uuid NOT NULL, gift_id text NOT NULL,
  url text NOT NULL, condition text NOT NULL CHECK(condition IN ('new','used','refurbished','handmade')),
  note text NOT NULL DEFAULT '', price integer CHECK(price BETWEEN 0 AND 100000000),
  currency text NOT NULL CHECK(currency IN ('EUR','USD','GBP','CAD','CHF','AUD')),
  shipping integer CHECK(shipping BETWEEN 0 AND 100000000),
  availability text NOT NULL DEFAULT 'unknown' CHECK(availability IN ('unknown','available','unavailable')),
  checked_at timestamptz, position integer NOT NULL,
  PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,gift_id) REFERENCES ouicheur.gifts(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX gift_offers_gift ON ouicheur.gift_offers(tenant_id,gift_id,position,id);

-- Persisted dependencies for gift edit guards. Their user-facing lifecycles,
-- tokens, finance and notifications are not implemented by this migration.
CREATE TABLE ouicheur.reservations (
  tenant_id uuid NOT NULL, id text NOT NULL, gift_id text NOT NULL,
  token_hash text NOT NULL, quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999),
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','purchased','cancelled','expired')),
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, details_snapshot text NOT NULL DEFAULT '',
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,token_hash),
  FOREIGN KEY(tenant_id,gift_id) REFERENCES ouicheur.gifts(tenant_id,id)
);
CREATE INDEX reservations_gift ON ouicheur.reservations(tenant_id,gift_id,state,expires_at);
CREATE TABLE ouicheur.contributions (
  tenant_id uuid NOT NULL, id text NOT NULL, gift_id text NOT NULL,
  amount integer NOT NULL CHECK(amount BETWEEN 1 AND 100000000), currency text NOT NULL,
  nickname text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '',
  public_name smallint NOT NULL DEFAULT 0 CHECK(public_name IN (0,1)),
  public_message smallint NOT NULL DEFAULT 0 CHECK(public_message IN (0,1)),
  state text NOT NULL CHECK(state IN ('intent','declared','detected','expired','rejected')),
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  paypal_recipient text NOT NULL DEFAULT '', approved smallint NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
  method text NOT NULL DEFAULT 'paypal' CHECK(method IN ('paypal','bank_transfer','pledge')),
  PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,gift_id) REFERENCES ouicheur.gifts(tenant_id,id)
);
CREATE INDEX contributions_gift ON ouicheur.contributions(tenant_id,gift_id);

DO $policy$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['categories','gift_priorities','gift_offers','reservations','contributions'] LOOP
    EXECUTE format('ALTER TABLE ouicheur.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE ouicheur.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY tenant_scope ON ouicheur.%I USING (tenant_id=NULLIF(current_setting(''ouicheur.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''ouicheur.tenant_id'',true),'''')::uuid)',tab);
  END LOOP;
END $policy$;
