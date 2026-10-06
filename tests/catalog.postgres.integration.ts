import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { catalogService } from "../lib/catalog.ts";
import {
  PostgresCatalogStore,
  tenantTransaction,
  migrateCatalog,
  grantCatalogRuntime,
  provisionCatalogTenant,
} from "../lib/catalog-postgres.ts";
import { catalogContract, catalogOwner } from "./catalog-contract.ts";
import { giftService } from "../lib/gift-persistence.ts";
import { PostgresGiftStore } from "../lib/gift-postgres.ts";
import { giftContract, giftInput } from "./gift-contract.ts";

const legacyTenant = randomUUID(),
  legacyGift = randomUUID();

const connectionString = process.env.POSTGRES_TEST_URL;
assert.ok(
  connectionString,
  "POSTGRES_TEST_URL must point to a disposable PostgreSQL database",
);
const admin = new Pool({
  connectionString,
  max: 3,
  connectionTimeoutMillis: 5000,
});
const role = `catalog_test_${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const runtimeUrl = new URL(connectionString);
runtimeUrl.username = role;
runtimeUrl.password = password;
const runtime = new Pool({
  connectionString: runtimeUrl.toString(),
  max: 1,
  connectionTimeoutMillis: 5000,
});
const otherReplica = new Pool({
  connectionString: runtimeUrl.toString(),
  max: 1,
  connectionTimeoutMillis: 5000,
});
before(async () => {
  // Only operate on the dedicated disposable database, never an arbitrary URL.
  assert.match(
    new URL(connectionString).pathname,
    /^\/ouicheur_test_[a-z0-9_]+$/,
  );
  const existing = await admin.query(
    "SELECT 1 FROM pg_namespace WHERE nspname='ouicheur'",
  );
  assert.equal(
    existing.rowCount,
    0,
    "Tests require an empty, disposable database",
  );
  // Start from the previously released schema with real purchase-only rows.
  // This exercises the additive upgrade, not just a fresh empty installation.
  const first = readFileSync(
    new URL("../lib/postgres/001-catalog.sql", import.meta.url),
    "utf8",
  );
  await admin.query(
    "CREATE SCHEMA ouicheur; CREATE TABLE ouicheur.catalog_migrations(name text PRIMARY KEY,sha256 text NOT NULL)",
  );
  await admin.query(first);
  await admin.query(
    "INSERT INTO ouicheur.catalog_migrations VALUES ('001-catalog.sql',$1)",
    [createHash("sha256").update(first).digest("hex")],
  );
  await admin.query("INSERT INTO ouicheur.tenants VALUES ($1)", [legacyTenant]);
  await admin.query(
    "INSERT INTO ouicheur.lists(tenant_id,id,name,visibility,created_at) VALUES ($1,'legacy','Legacy','private',now())",
    [legacyTenant],
  );
  await admin.query(
    "INSERT INTO ouicheur.gifts VALUES ($1,$2,'legacy',1,now())",
    [legacyTenant, legacyGift],
  );
  await Promise.all([migrateCatalog(admin), migrateCatalog(admin)]);
  await admin.query(
    `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
  );
  await grantCatalogRuntime(admin, role);
});
after(async () => {
  await Promise.all([runtime.end(), otherReplica.end()]);
  await admin.end();
});
// The test database and test roles are removed with their CI service container.
async function tenant() {
  const id = randomUUID();
  await provisionCatalogTenant(admin, id);
  return id;
}
function service(id: string, pool = runtime) {
  return catalogService(new PostgresCatalogStore(pool, id));
}
catalogContract("PostgreSQL catalog", async () => {
  const id = await tenant();
  return {
    service: service(id),
    async share(list) {
      return (
        await admin.query(
          "SELECT share_hash FROM ouicheur.lists WHERE tenant_id=$1 AND id=$2",
          [id, list],
        )
      ).rows[0].share_hash;
    },
    async seedShare(list) {
      await admin.query(
        "UPDATE ouicheur.lists SET share_hash='test-share-hash' WHERE tenant_id=$1 AND id=$2",
        [id, list],
      );
    },
    async seedReveal() {
      await admin.query(
        "INSERT INTO ouicheur.session_reveals VALUES ($1,'test-session',1) ON CONFLICT(tenant_id,session_id) DO UPDATE SET surprises_revealed=1",
        [id],
      );
    },
    async revealed() {
      return (
        await admin.query(
          "SELECT surprises_revealed FROM ouicheur.session_reveals WHERE tenant_id=$1",
          [id],
        )
      ).rows[0].surprises_revealed;
    },
    async seedGift(list, gift) {
      await admin.query(
        "INSERT INTO ouicheur.gifts(tenant_id,id,list_id,purchased,updated_at) VALUES ($1,$2,$3,0,now())",
        [id, gift, list],
      );
    },
    async purchased(gift) {
      return (
        await admin.query(
          "SELECT purchased FROM ouicheur.gifts WHERE tenant_id=$1 AND id=$2",
          [id, gift],
        )
      ).rows[0].purchased;
    },
    async auditCount(action, entity) {
      return Number(
        (
          await admin.query(
            "SELECT count(*) n FROM ouicheur.audit WHERE tenant_id=$1 AND action=$2 AND entity_id=$3",
            [id, action, entity],
          )
        ).rows[0].n,
      );
    },
    async failAudit() {
      await admin.query(`REVOKE INSERT ON ouicheur.audit FROM "${role}"`);
    },
    async close() {
      await grantCatalogRuntime(admin, role);
    },
  };
});
test("PostgreSQL: runtime RLS, foreign keys and transaction context prevent cross-tenant access", async () => {
  const a = await tenant(),
    b = await tenant();
  const list = await service(a).saveList(
    { name: "Tenant A", visibility: "private" },
    catalogOwner,
  );
  assert.equal(await service(b).getList(list, catalogOwner), undefined);
  await assert.rejects(
    service(b).saveList(
      { id: list, name: "Hijack", visibility: "public" },
      catalogOwner,
    ),
    /introuvable/,
  );
  await tenantTransaction(runtime, b, async (client) => {
    // Intentionally omit the tenant predicate: RLS still protects rows.
    assert.equal(
      (await client.query("SELECT id FROM ouicheur.lists WHERE id=$1", [list]))
        .rowCount,
      0,
    );
    assert.equal(
      (
        await client.query(
          "UPDATE ouicheur.lists SET name='Hijack' WHERE id=$1",
          [list],
        )
      ).rowCount,
      0,
    );
  });
  await assert.rejects(
    tenantTransaction(runtime, b, async (client) => {
      await client.query(
        "INSERT INTO ouicheur.lists(tenant_id,id,name,visibility,created_at) VALUES ($1,$2,'Injected','public',now())",
        [a, randomUUID()],
      );
    }),
    /row-level security/,
  );
  const gift = randomUUID();
  await admin.query(
    "INSERT INTO ouicheur.session_reveals VALUES ($1,'session-b',1)",
    [b],
  );
  await service(a).saveList(
    { id: list, name: "Tenant A", visibility: "private", surprise_mode: true },
    catalogOwner,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT surprises_revealed FROM ouicheur.session_reveals WHERE tenant_id=$1",
        [b],
      )
    ).rows[0].surprises_revealed,
    1,
  );
  await admin.query(
    "INSERT INTO ouicheur.gifts(tenant_id,id,list_id,purchased,updated_at) VALUES ($1,$2,$3,0,now())",
    [a, gift, list],
  );
  await assert.rejects(
    service(b).setGiftPurchased(gift, { purchased: true }, catalogOwner),
    /introuvable/,
  );
  await assert.rejects(
    admin.query(
      "INSERT INTO ouicheur.gifts(tenant_id,id,list_id,purchased,updated_at) VALUES ($1,$2,$3,0,now())",
      [b, randomUUID(), list],
    ),
    /foreign key/,
  );
  // max=1 guarantees that the following calls reuse a pooled connection.
  await assert.rejects(
    runtime.query(
      "INSERT INTO ouicheur.lists(tenant_id,id,name,visibility,created_at) VALUES ($1,$2,'No context','private',now())",
      [a, randomUUID()],
    ),
    /row-level security/,
  );
  assert.equal(
    (await runtime.query("SELECT id FROM ouicheur.lists")).rowCount,
    0,
  );
  assert.ok(
    !(
      await runtime.query(
        "SELECT current_setting('ouicheur.tenant_id',true) AS context",
      )
    ).rows[0].context,
  );
  await assert.rejects(
    tenantTransaction(runtime, a, async () => {
      throw new Error("rollback test");
    }),
    /rollback test/,
  );
  assert.equal(
    (await runtime.query("SELECT id FROM ouicheur.lists")).rowCount,
    0,
  );
  assert.equal(
    (await service(a).getList(list, catalogOwner))?.name,
    "Tenant A",
  );
  await assert.rejects(
    service(a, admin).getList(list, catalogOwner),
    /non-owner/,
  );
  await assert.rejects(
    runtime.query("TRUNCATE ouicheur.lists CASCADE"),
    /permission denied/,
  );
});
test("PostgreSQL: independent pools serialize purchase updates without duplicate audit effects", async () => {
  const id = await tenant(),
    a = service(id),
    b = service(id, otherReplica);
  const list = await a.saveList(
    { name: "Concurrent", visibility: "private" },
    catalogOwner,
  );
  const gift = randomUUID();
  await admin.query(
    "INSERT INTO ouicheur.gifts(tenant_id,id,list_id,purchased,updated_at) VALUES ($1,$2,$3,0,now())",
    [id, gift, list],
  );
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? a : b).setGiftPurchased(gift, { purchased: true }, catalogOwner),
    ),
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM ouicheur.audit WHERE tenant_id=$1 AND entity_id=$2 AND action='gift.purchase'",
        [id, gift],
      )
    ).rows[0].n,
    1,
  );
  await b.setGiftPurchased(gift, { purchased: false }, catalogOwner);
  assert.equal(
    (
      await admin.query(
        "SELECT purchased FROM ouicheur.gifts WHERE tenant_id=$1 AND id=$2",
        [id, gift],
      )
    ).rows[0].purchased,
    0,
  );
});
test("PostgreSQL: schema ownership is rejected and migration checksums fail closed", async () => {
  const id = await tenant();
  await admin.query(`ALTER TABLE ouicheur.lists OWNER TO "${role}"`);
  try {
    await assert.rejects(
      service(id).getList("default", catalogOwner),
      /non-owner/,
    );
  } finally {
    const owner = (await admin.query("SELECT current_user AS role")).rows[0]
      .role;
    await admin.query(
      `ALTER TABLE ouicheur.lists OWNER TO "${String(owner).replaceAll('"', '""')}"`,
    );
    // Moving ownership back removes the former owner's explicit ACL entry.
    // Restore the runtime fixture before the following contract cases.
    await grantCatalogRuntime(admin, role);
  }
  const original = (
    await admin.query(
      "SELECT sha256 FROM ouicheur.catalog_migrations WHERE name='001-catalog.sql'",
    )
  ).rows[0].sha256;
  await admin.query(
    "UPDATE ouicheur.catalog_migrations SET sha256='changed' WHERE name='001-catalog.sql'",
  );
  try {
    await assert.rejects(migrateCatalog(admin), /modified/);
  } finally {
    await admin.query(
      "UPDATE ouicheur.catalog_migrations SET sha256=$1 WHERE name='001-catalog.sql'",
      [original],
    );
  }
  await migrateCatalog(admin);
});

function gifts(id: string, pool = runtime) {
  return giftService(new PostgresGiftStore(pool, id));
}
giftContract("PostgreSQL gifts", async () => {
  const id = await tenant();
  const list = await service(id).saveList(
    { name: "Gifts", visibility: "private" },
    catalogOwner,
  );
  return {
    service: gifts(id),
    list,
    async listCreate(surprise = false) {
      return service(id).saveList(
        { name: "Another", visibility: "private", surprise_mode: surprise },
        catalogOwner,
      );
    },
    async setCurrency(currency) {
      await admin.query("UPDATE ouicheur.tenants SET currency=$1 WHERE id=$2", [
        currency,
        id,
      ]);
    },
    async seedCategory(category) {
      await admin.query(
        "INSERT INTO ouicheur.categories(tenant_id,id,name) VALUES ($1,$2,$2)",
        [id, category],
      );
    },
    async seedPriority(priority) {
      await admin.query(
        "INSERT INTO ouicheur.gift_priorities(tenant_id,id,name,position) VALUES ($1,$2,'Custom',3)",
        [id, priority],
      );
    },
    async seedReservation(gift, quantity, state, expired) {
      await admin.query(
        "INSERT INTO ouicheur.reservations(tenant_id,id,token_hash,gift_id,quantity,state,created_at,expires_at) VALUES ($1,$2,$2,$3,$4,$5,now(),$6)",
        [
          id,
          randomUUID(),
          gift,
          quantity,
          state,
          new Date(Date.now() + (expired ? -1 : 1) * 86400000).toISOString(),
        ],
      );
    },
    async seedContribution(gift) {
      await admin.query(
        "INSERT INTO ouicheur.contributions(tenant_id,id,gift_id,amount,currency,state,created_at,expires_at) VALUES ($1,$2,$3,100,'EUR','expired',now(),now())",
        [id, randomUUID(), gift],
      );
    },
    async seedSource(gift) {
      await admin.query(
        "UPDATE ouicheur.gifts SET source='test-import',source_id='original' WHERE tenant_id=$1 AND id=$2",
        [id, gift],
      );
    },
    async setPurchased(gift) {
      await service(id).setGiftPurchased(
        gift,
        { purchased: true },
        catalogOwner,
      );
    },
    async failAudit() {
      await admin.query(`REVOKE INSERT ON ouicheur.audit FROM "${role}"`);
    },
    async auditCount(gift) {
      return Number(
        (
          await admin.query(
            "SELECT count(*) AS n FROM ouicheur.audit WHERE tenant_id=$1 AND entity_id=$2 AND action IN ('gift.create','gift.update')",
            [id, gift],
          )
        ).rows[0].n,
      );
    },
    async close() {
      await grantCatalogRuntime(admin, role);
    },
  };
});
test("PostgreSQL gifts: prior schema upgrades preserve purchase state and require explicit metadata", async () => {
  const raw = (
    await admin.query(
      "SELECT id,list_id,purchased,details_ready FROM ouicheur.gifts WHERE tenant_id=$1",
      [legacyTenant],
    )
  ).rows[0];
  assert.deepEqual(raw, {
    id: legacyGift,
    list_id: "legacy",
    purchased: 1,
    details_ready: 0,
  });
  await assert.rejects(
    gifts(legacyTenant).getGift(legacyGift, catalogOwner),
    /complétés/,
  );
  await gifts(legacyTenant).saveGift(
    { ...giftInput, list_id: "legacy" },
    catalogOwner,
    legacyGift,
  );
  assert.equal(
    (await gifts(legacyTenant).getGift(legacyGift, catalogOwner))?.purchased,
    1,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM ouicheur.catalog_migrations",
      )
    ).rows[0].n,
    2,
  );
});
test("PostgreSQL gifts: metadata and dependency references remain within their tenant", async () => {
  const a = await tenant(),
    b = await tenant();
  const la = await service(a).saveList(
    { name: "A", visibility: "private" },
    catalogOwner,
  );
  const lb = await service(b).saveList(
    { name: "B", visibility: "private" },
    catalogOwner,
  );
  const category = randomUUID(),
    offer = randomUUID();
  await admin.query(
    "INSERT INTO ouicheur.categories(tenant_id,id,name) VALUES ($1,$2,'Private')",
    [a, category],
  );
  const ga = await gifts(a).saveGift(
    {
      ...giftInput,
      list_id: la,
      category_id: category,
      offers: [{ id: offer, url: "https://shop.example.org/a" }],
    },
    catalogOwner,
  );
  assert.equal(await gifts(b).getGift(ga, catalogOwner), undefined);
  await assert.rejects(
    gifts(b).saveGift({ ...giftInput, list_id: lb }, catalogOwner, ga),
    /introuvable/,
  );
  await assert.rejects(
    gifts(b).saveGift({ ...giftInput, list_id: la }, catalogOwner),
    /Liste introuvable/,
  );
  await assert.rejects(
    gifts(b).saveGift(
      { ...giftInput, list_id: lb, category_id: category },
      catalogOwner,
    ),
    /Catégorie inconnue/,
  );
  const gb = await gifts(b).saveGift(
    {
      ...giftInput,
      list_id: lb,
      offers: [{ id: offer, url: "https://shop.example.org/b" }],
    },
    catalogOwner,
  );
  assert.equal(
    (await gifts(a).getGift(ga, catalogOwner))?.offers[0].url,
    "https://shop.example.org/a",
  );
  await tenantTransaction(runtime, b, async (client) => {
    assert.equal(
      (
        await client.query(
          "SELECT id FROM ouicheur.gift_offers WHERE gift_id=$1",
          [ga],
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await client.query("SELECT id FROM ouicheur.categories WHERE id=$1", [
          category,
        ])
      ).rowCount,
      0,
    );
  });
  await assert.rejects(
    admin.query(
      "UPDATE ouicheur.gifts SET category_id=$1 WHERE tenant_id=$2 AND id=$3",
      [category, b, gb],
    ),
    /foreign key/,
  );
  await assert.rejects(
    admin.query(
      "UPDATE ouicheur.gift_offers SET gift_id=$1 WHERE tenant_id=$2 AND id=$3",
      [ga, b, offer],
    ),
    /foreign key/,
  );
  await assert.rejects(
    tenantTransaction(runtime, b, (c) =>
      c.query(
        "INSERT INTO ouicheur.contributions(tenant_id,id,gift_id,amount,currency,state,created_at,expires_at) VALUES ($1,$2,$3,1,'EUR','intent',now(),now())",
        [b, randomUUID(), gb],
      ),
    ),
    /permission denied/,
  );
  assert.equal(
    (await runtime.query("SELECT id FROM ouicheur.gift_offers")).rowCount,
    0,
  );
});
test("PostgreSQL gifts: independent replicas serialize duplicate creation and preserve purchase updates", async () => {
  const t = await tenant();
  const list = await service(t).saveList(
    { name: "Concurrent gifts", visibility: "private" },
    catalogOwner,
  );
  const a = gifts(t),
    b = gifts(t, otherReplica),
    input = { ...giftInput, list_id: list };
  const results = await Promise.allSettled([
    a.saveGift(input, catalogOwner),
    b.saveGift(input, catalogOwner),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.match(rejected.reason.message, /existe déjà/);
  const id = (
    results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<string>
  ).value;
  await Promise.all([
    a.saveGift({ ...input, title: "Renamed concurrently" }, catalogOwner, id),
    service(t, otherReplica).setGiftPurchased(
      id,
      { purchased: true },
      catalogOwner,
    ),
  ]);
  const row = await a.getGift(id, catalogOwner);
  assert.equal(row?.title, "Renamed concurrently");
  assert.equal(row?.purchased, 1);
  const copies = await Promise.all([
    a.saveGift({ ...input, allow_duplicate: true }, catalogOwner),
    b.saveGift({ ...input, allow_duplicate: true }, catalogOwner),
  ]);
  const positions = await Promise.all(
    [id, ...copies].map(
      async (gift) => (await a.getGift(gift, catalogOwner))?.position,
    ),
  );
  assert.equal(new Set(positions).size, 3);
});
