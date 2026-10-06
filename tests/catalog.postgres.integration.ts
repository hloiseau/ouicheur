import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
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
        "INSERT INTO ouicheur.gifts VALUES ($1,$2,$3,0,now())",
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
  await admin.query("INSERT INTO ouicheur.gifts VALUES ($1,$2,$3,0,now())", [
    a,
    gift,
    list,
  ]);
  await assert.rejects(
    service(b).setGiftPurchased(gift, { purchased: true }, catalogOwner),
    /introuvable/,
  );
  await assert.rejects(
    admin.query("INSERT INTO ouicheur.gifts VALUES ($1,$2,$3,0,now())", [
      b,
      randomUUID(),
      list,
    ]),
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
  await admin.query("INSERT INTO ouicheur.gifts VALUES ($1,$2,$3,0,now())", [
    id,
    gift,
    list,
  ]);
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
  }
  const original = (
    await admin.query("SELECT sha256 FROM ouicheur.catalog_migrations")
  ).rows[0].sha256;
  await admin.query("UPDATE ouicheur.catalog_migrations SET sha256='changed'");
  try {
    await assert.rejects(migrateCatalog(admin), /modified/);
  } finally {
    await admin.query("UPDATE ouicheur.catalog_migrations SET sha256=$1", [
      original,
    ]);
  }
  await migrateCatalog(admin);
});
