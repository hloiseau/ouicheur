import { participationService } from "../lib/participation.ts";
import {
  PostgresParticipationStore,
  configureParticipation,
} from "../lib/participation-postgres.ts";
import {
  participationContract,
  participationGift,
  participationOwner,
  participant,
  confirmation,
} from "./participation-contract.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { catalogService } from "../lib/catalog.ts";
import {
  PostgresCatalogStore,
  tenantTransaction,
  catalogTransaction,
  migrateCatalog,
  grantCatalogRuntime,
  provisionCatalogTenant,
  createCatalogTenant,
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
    4,
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
        "DELETE FROM ouicheur.contributions WHERE tenant_id=$1 AND gift_id=$2",
        [b, gb],
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

async function participationFixture(pool = runtime) {
  const id = await tenant();
  const catalog = service(id, pool);
  const list = await catalog.saveList(
    { name: "Participation", visibility: "public" },
    participationOwner,
  );
  return {
    tenantId: id,
    list,
    catalog,
    gifts: giftService(new PostgresGiftStore(pool, id)),
    service: participationService(new PostgresParticipationStore(pool, id)),
    async settings(v: {
      paypal?: string;
      strict_contributions?: boolean;
      currency?: string;
    }) {
      const { currency, ...settings } = v;
      if (currency !== undefined)
        await admin.query(
          "UPDATE ouicheur.tenants SET currency=$1 WHERE id=$2",
          [currency, id],
        );
      if (Object.keys(settings).length)
        await configureParticipation(admin, id, settings);
    },
    async expire(kind: "reservations" | "contributions", entity: string) {
      await admin.query(
        `UPDATE ouicheur.${kind} SET expires_at='2000-01-01' WHERE tenant_id=$1 AND id=$2`,
        [id, entity],
      );
    },
    async failAudit() {
      await admin.query(`REVOKE INSERT ON ouicheur.audit FROM "${role}"`);
    },
    async auditLog() {
      return JSON.stringify(
        (
          await admin.query("SELECT * FROM ouicheur.audit WHERE tenant_id=$1", [
            id,
          ])
        ).rows,
      );
    },
    async auditCount(action: string, entity: string) {
      return (
        await admin.query(
          "SELECT count(*)::int n FROM ouicheur.audit WHERE tenant_id=$1 AND action=$2 AND entity_id=$3",
          [id, action, entity],
        )
      ).rows[0].n;
    },
    async close() {
      await grantCatalogRuntime(admin, role);
    },
  };
}
participationContract("PostgreSQL participation", participationFixture);

test("PostgreSQL participation: replicas cannot oversubscribe quantity, remaining funds or participation mode", async () => {
  const f = await participationFixture(),
    second = participationService(
      new PostgresParticipationStore(otherReplica, f.tenantId),
    );
  const { id } = await participationGift(f);
  const reservations = await Promise.allSettled([
    f.service.createReservation({ gift_id: id, quantity: 1 }, participant),
    second.createReservation({ gift_id: id, quantity: 1 }, participant),
  ]);
  assert.equal(reservations.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await f.service.fundingTotals(id, participationOwner)).reserved,
    1,
  );
  const bank = await participationGift(f);
  const transfers = await Promise.allSettled([
    f.service.createIntent(
      { gift_id: bank.id, amount: "60", method: "bank_transfer" },
      participant,
    ),
    second.createIntent(
      { gift_id: bank.id, amount: "60", method: "bank_transfer" },
      participant,
    ),
  ]);
  assert.equal(transfers.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await f.service.fundingTotals(bank.id, participationOwner)).funded,
    6000,
  );
  const mixed = await participationGift(f);
  const modes = await Promise.allSettled([
    f.service.createReservation(
      { gift_id: mixed.id, quantity: 1 },
      participant,
    ),
    second.createIntent(
      { gift_id: mixed.id, amount: "1", method: "pledge" },
      participant,
    ),
  ]);
  assert.equal(modes.filter((r) => r.status === "fulfilled").length, 1);
  const totals = await f.service.fundingTotals(mixed.id, participationOwner);
  assert.ok(
    (totals.reserved === 1 && totals.promised === 0) ||
      (totals.reserved === 0 && totals.promised === 100),
  );
});
test("PostgreSQL participation: confirmations and corrections across replicas have one financial and audit effect", async () => {
  const f = await participationFixture(),
    second = participationService(
      new PostgresParticipationStore(otherReplica, f.tenantId),
    );
  const { id } = await participationGift(f);
  const c = await f.service.createIntent(
    { gift_id: id, amount: "25", method: "bank_transfer" },
    participant,
  );
  const input = confirmation(c.id);
  const [a, b] = await Promise.all([
    f.service.confirmManual(input, participationOwner),
    second.confirmManual(input, participationOwner),
  ]);
  assert.equal(a, b);
  assert.equal(await f.auditCount("payment.confirm_manual", a), 1);
  const correction = {
    payment_id: a,
    event_id: randomUUID(),
    revision: 1,
    gross: "25",
    fee: "1",
    refunded: "1",
    net_reversed: "1",
    disputed: false,
    reason: "Correction de test",
  };
  const race = await Promise.allSettled([
    f.service.correctPayment(correction, participationOwner),
    second.correctPayment(
      {
        ...correction,
        event_id: randomUUID(),
        refunded: "2",
        net_reversed: "2",
      },
      participationOwner,
    ),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await f.auditCount("payment.correct_manual", a), 1);
  const t = await f.service.fundingTotals(id, participationOwner);
  assert.ok([2200, 2300].includes(t.confirmed));
  assert.equal(t.confirmed, t.funded);
  const p = (
    await admin.query(
      "SELECT revision FROM ouicheur.payments WHERE tenant_id=$1 AND id=$2",
      [f.tenantId, a],
    )
  ).rows[0];
  assert.equal(p.revision, 2);
});
test("PostgreSQL participation: tenant-scoped tokens, event IDs, references and foreign keys", async () => {
  const a = await participationFixture(),
    b = await participationFixture();
  const ga = await participationGift(a),
    gb = await participationGift(b);
  const r = await a.service.createReservation(
    { gift_id: ga.id, quantity: 1 },
    participant,
  );
  await assert.rejects(b.service.reservationStatus(r.token), /introuvable/);
  await assert.rejects(
    b.service.updateReservation(r.token, { state: "cancelled" }),
    /introuvable/,
  );
  await a.service.updateReservation(r.token, { state: "cancelled" });
  const c = await a.service.createIntent(
    { gift_id: ga.id, amount: "25", method: "bank_transfer" },
    participant,
  );
  for (const action of [
    () => b.service.contributionStatus(c.id),
    () => b.service.declareIntent(c.id),
    () => b.service.cancelPledge(c.id),
    () =>
      b.service.reviewContribution(
        { id: c.id, approved: true },
        participationOwner,
      ),
    () => b.service.confirmManual(confirmation(c.id), participationOwner),
  ])
    await assert.rejects(action(), /introuvable/);
  const input = confirmation(c.id),
    p = await a.service.confirmManual(input, participationOwner);
  const correction = {
    payment_id: p,
    event_id: randomUUID(),
    revision: 1,
    gross: "25",
    fee: "1",
    refunded: "0",
    net_reversed: "0",
    disputed: false,
    reason: "Test de cloisonnement",
  };
  await assert.rejects(
    b.service.correctPayment(correction, participationOwner),
    /introuvable/,
  );
  const cb = await b.service.createIntent(
    { gift_id: gb.id, amount: "25", method: "bank_transfer" },
    participant,
  );
  // Same real-world reference and event ID in another household are independent.
  await b.service.confirmManual(
    { ...input, contribution_id: cb.id },
    participationOwner,
  );
  await assert.rejects(
    admin.query(
      "INSERT INTO ouicheur.payment_events(tenant_id,id,payment_id,kind,payload,created_at) VALUES ($1,$2,$3,'correction_manual','{}',now())",
      [b.tenantId, randomUUID(), p],
    ),
    /foreign key/,
  );
  for (const table of [
    "reservations",
    "contributions",
    "payments",
    "payment_events",
    "participation_outbox",
  ]) {
    assert.equal(
      (await runtime.query(`SELECT 1 FROM ouicheur.${table}`)).rowCount,
      0,
    );
    await tenantTransaction(runtime, b.tenantId, async (client) => {
      assert.equal(
        (
          await client.query(
            `SELECT 1 FROM ouicheur.${table} WHERE tenant_id=$1`,
            [a.tenantId],
          )
        ).rowCount,
        0,
      );
    });
  }
  await assert.rejects(
    tenantTransaction(runtime, b.tenantId, (client) =>
      client.query(
        "UPDATE ouicheur.payment_events SET payload='{}' WHERE tenant_id=$1",
        [b.tenantId],
      ),
    ),
    /permission denied/,
  );
  await assert.rejects(
    configureParticipation(runtime, b.tenantId, { strict_contributions: true }),
    /permission denied/,
  );
  assert.equal(
    (
      await runtime.query(
        "SELECT current_setting('ouicheur.tenant_id',true) value",
      )
    ).rows[0].value,
    "",
  );
  assert.equal(
    (await a.service.fundingTotals(ga.id, participationOwner)).funded,
    2400,
  );
  const audit = await admin.query(
    "SELECT detail::text FROM ouicheur.audit WHERE tenant_id=$1",
    [a.tenantId],
  );
  assert.ok(!JSON.stringify(audit.rows).includes(r.token));
});
test("PostgreSQL participation: outbox is atomic, deduplicated and contains no bearer secrets", async () => {
  const f = await participationFixture(),
    second = participationService(
      new PostgresParticipationStore(otherReplica, f.tenantId),
    );
  const { id } = await participationGift(f);
  await admin.query(
    `REVOKE INSERT ON ouicheur.participation_outbox FROM "${role}"`,
  );
  try {
    await assert.rejects(
      f.service.createIntent(
        { gift_id: id, amount: "25", method: "bank_transfer" },
        participant,
      ),
      /permission denied/,
    );
    assert.equal(
      (await f.service.fundingTotals(id, participationOwner)).funded,
      0,
    );
    await assert.rejects(
      f.service.createReservation({ gift_id: id, quantity: 1 }, participant),
      /permission denied/,
    );
    assert.equal(
      (await f.service.fundingTotals(id, participationOwner)).reserved,
      0,
    );
    assert.equal(
      (
        await admin.query(
          "SELECT 1 FROM ouicheur.audit WHERE tenant_id=$1 AND action='reservation.create'",
          [f.tenantId],
        )
      ).rowCount,
      0,
    );
  } finally {
    await grantCatalogRuntime(admin, role);
  }
  const c = await f.service.createIntent(
    {
      gift_id: id,
      amount: "25",
      method: "pledge",
      message: "DoNotCopyPrivateMessage",
    },
    participant,
  );
  await Promise.all([
    f.service.declareIntent(c.id),
    second.declareIntent(c.id),
  ]);
  const rows = (
    await admin.query(
      "SELECT * FROM ouicheur.participation_outbox WHERE tenant_id=$1",
      [f.tenantId],
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "declaration");
  // Contribution IDs are bearer tokens: the outbox must use a one-way digest.
  assert.equal(
    rows[0].entity_id,
    createHash("sha256").update(c.id).digest("hex"),
  );
  assert.ok(!JSON.stringify(rows).includes(c.id));
  assert.ok(!JSON.stringify(rows).includes("DoNotCopyPrivateMessage"));
});

test("PostgreSQL participation: failed audit rolls back payments, events and corrections together", async () => {
  const f = await participationFixture();
  const { id } = await participationGift(f);
  const c = await f.service.createIntent(
    { gift_id: id, amount: "25", method: "bank_transfer" },
    participant,
  );
  const input = confirmation(c.id);
  await f.failAudit();
  try {
    await assert.rejects(
      f.service.confirmManual(input, participationOwner),
      /permission denied/,
    );
    assert.equal((await f.service.contributionStatus(c.id)).payment, null);
    assert.equal(
      (
        await admin.query(
          "SELECT 1 FROM ouicheur.payment_events WHERE tenant_id=$1",
          [f.tenantId],
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (await f.service.fundingTotals(id, participationOwner)).funded,
      2500,
    );
  } finally {
    await f.close();
  }
  const p = await f.service.confirmManual(input, participationOwner);
  await f.failAudit();
  try {
    await assert.rejects(
      f.service.correctPayment(
        {
          payment_id: p,
          event_id: randomUUID(),
          revision: 1,
          gross: "25",
          fee: "1",
          refunded: "25",
          net_reversed: "24",
          disputed: false,
          reason: "Rollback de test",
        },
        participationOwner,
      ),
      /permission denied/,
    );
    assert.equal(
      (await f.service.fundingTotals(id, participationOwner)).funded,
      2400,
    );
    assert.equal(
      (
        await admin.query(
          "SELECT revision FROM ouicheur.payments WHERE tenant_id=$1 AND id=$2",
          [f.tenantId, p],
        )
      ).rows[0].revision,
      1,
    );
    assert.equal(
      (
        await admin.query(
          "SELECT 1 FROM ouicheur.payment_events WHERE tenant_id=$1",
          [f.tenantId],
        )
      ).rowCount,
      1,
    );
  } finally {
    await f.close();
  }
});

test("a composed authorization/business transaction is atomic, tenant-bound and cannot escape", async () => {
  const tenant = randomUUID(),
    other = randomUUID();
  await provisionCatalogTenant(admin, tenant);
  let escaped: Parameters<typeof catalogService>[0] | undefined;
  const count = async () =>
    Number(
      (
        await admin.query(
          "SELECT count(*) n FROM ouicheur.lists WHERE tenant_id=$1",
          [tenant],
        )
      ).rows[0].n,
    );
  await assert.rejects(
    catalogTransaction(runtime, tenant, async (client, scoped) => {
      escaped = new PostgresCatalogStore(scoped, tenant);
      const service = catalogService(escaped);
      const id = await service.saveList(
        { name: "Rolled back", visibility: "private" },
        catalogOwner,
      );
      assert.equal(
        (await service.getList(id, catalogOwner))?.name,
        "Rolled back",
      );
      await assert.rejects(
        tenantTransaction(scoped, other, async () => undefined),
        /scope mismatch/,
      );
      assert.equal(
        (await client.query("SELECT current_setting('ouicheur.tenant_id') id"))
          .rows[0].id,
        tenant,
      );
      throw new Error("rollback requested");
    }),
    /rollback requested/,
  );
  assert.equal(await count(), 0);
  await assert.rejects(escaped!.getList("any"), /scope mismatch or closed/);
  await catalogTransaction(runtime, tenant, async (_, scoped) => {
    await catalogService(new PostgresCatalogStore(scoped, tenant)).saveList(
      { name: "Committed", visibility: "private" },
      catalogOwner,
    );
  });
  assert.equal(await count(), 1);
  const c = await runtime.connect();
  try {
    assert.equal(
      (
        await c.query(
          "SELECT NULLIF(current_setting('ouicheur.tenant_id',true),'') value",
        )
      ).rows[0].value,
      null,
    );
  } finally {
    c.release();
  }
});

// Read the same catalogue through both persistence adapters; the fixture uses
// their shared write contracts so cents, defaults and offers are representative.
import { PostgresWishlistStore } from "../lib/wishlist-postgres.ts";
import { queryWishlist } from "../lib/wishlist-query.ts";
import { openDatabase } from "../lib/db.ts";
import { initializeOwner } from "../lib/auth.ts";
import { saveGift } from "../lib/gifts.ts";
import { saveList } from "../lib/lists.ts";
const readKey = randomBytes(32).toString("hex");
test("wishlist PostgreSQL and SQLite preserve filters, exact totals, title ordering and offers", async () => {
  const id = await tenant(),
    store = new PostgresWishlistStore(runtime, id, readKey);
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Reader", "test-only-wishlist-password");
  const list = await service(id).saveList(
    { name: "Public", visibility: "public" },
    catalogOwner,
  );
  const gifts = giftService(new PostgresGiftStore(runtime, id));
  try {
    for (let i = 0; i < 37; i++) {
      const input = {
        ...giftInput,
        title: `Édition ${i}`,
        url: `https://example.org/${i}`,
        description: i % 2 ? "L'été" : "",
        target: String(i + 1),
        quantity: 1 + (i % 3),
        priority: i % 3,
        budget_mode: i % 7 === 0 ? "unknown" : "fixed",
        size: i % 2 ? "M" : "",
        color: i % 2 ? "Bleu" : "",
        variant_note: i % 2 ? "À offrir" : "",
        time_hint: "Décembre",
        offers: [
          {
            url: `https://second.example.org/${i}`,
            condition: "used",
            note: "Boîte",
            price: 100,
            currency: "EUR",
            shipping: null,
            availability: "unknown",
            checked_at: null,
          },
        ],
      };
      const pgId = await gifts.saveGift(
        { ...input, list_id: list },
        catalogOwner,
      );
      const sqliteId = saveGift(db, { ...input, list_id: "default" });
      if (i % 9 === 0) {
        await admin.query(
          "UPDATE ouicheur.gifts SET purchased=1 WHERE tenant_id=$1 AND id=$2",
          [id, pgId],
        );
        db.prepare("UPDATE gifts SET purchased=1 WHERE id=?").run(sqliteId);
      }
    }
    const publicAccess = { owner: false, lists: [] };
    const cases = [
      ...[
        "manual",
        "priority",
        "title",
        "price",
        "price-desc",
        "unit-price",
        "unit-price-desc",
        "remaining",
        "progress",
      ]
        .filter((s) => s !== "manual")
        .map((sort) => ({ sort })),
      { search: "edition 2" },
      { search: "m · bleu" },
      { search: "a offrir" },
      { search: "decembre" },
      { priority: "2" },
      { view: "favorites" },
      { view: "completed" },
      { available: "1" },
      { currency: "EUR", minimum: 500, maximum: 1700, basis: "unit" },
      { currency: "EUR", maximum: 2500, basis: "total" },
      { minimum: 100 },
      { currency: "USD" },
    ];
    for (const query of cases) {
      const input = { ...query, locale: "fr", limit: 60 };
      const pg = (await store.query(input, publicAccess)).page,
        sqlite = queryWishlist(db, input, publicAccess);
      const projection = (p: typeof sqlite) => ({
        titles: p.items.map((g) => g.title),
        values: p.items.map((g) => [
          g.target,
          g.quantity,
          g.funded,
          g.reserved,
          g.purchased,
          g.offers?.map((o) => [o.url, o.price, o.shipping]),
        ]),
        total: p.total,
        counts: p.counts,
        currencies: p.currencies,
        priorities: p.priorities,
        hidden: p.hidden,
      });
      assert.deepEqual(
        projection(pg),
        projection(sqlite),
        JSON.stringify(input),
      );
    }
    const first = (
      await store.query({ sort: "title", locale: "fr", limit: 7 }, publicAccess)
    ).page;
    let next = first.next;
    const titles = first.items.map((g) => g.title);
    while (next) {
      const p = (
        await store.query(
          { sort: "title", locale: "fr", limit: 7, cursor: next },
          publicAccess,
        )
      ).page;
      titles.push(...p.items.map((g) => g.title));
      next = p.next;
    }
    assert.equal(titles.length, 37);
    assert.equal(new Set(titles).size, 37);
    assert.equal(titles.at(-1), "Édition 36");
    const secretList = await service(id).saveList(
      { name: "PRIVATE_LIST", visibility: "private" },
      catalogOwner,
    );
    await gifts.saveGift(
      { ...giftInput, title: "PRIVATE_GIFT", url: "", list_id: secretList },
      catalogOwner,
    );
    const unchanged = (
      await store.query({ sort: "title", locale: "fr", limit: 7 }, publicAccess)
    ).page;
    assert.equal(unchanged.version, first.version);
    assert.doesNotMatch(JSON.stringify(unchanged), /PRIVATE_/);
    await assert.rejects(
      store.query({ mode: "owner" }, publicAccess),
      /Connexion/,
    );
    await assert.rejects(
      store.query({ list: secretList }, publicAccess),
      /introuvable/,
    );
    await assert.rejects(
      store.query(
        { sort: "title", locale: "fr", limit: 7, cursor: first.next + "x" },
        publicAccess,
      ),
      /Actualisez/,
    );
    await assert.rejects(
      new PostgresWishlistStore(runtime, await tenant(), readKey).query(
        { sort: "title", locale: "fr", limit: 7, cursor: first.next },
        publicAccess,
      ),
      /Actualisez/,
    );
    await admin.query(
      "UPDATE ouicheur.gifts SET title='Changed' WHERE tenant_id=$1 AND id=$2",
      [id, first.items[0].id],
    );
    await assert.rejects(
      store.query(
        { sort: "title", locale: "fr", limit: 7, cursor: first.next },
        publicAccess,
      ),
      /Actualisez/,
    );
    const member = {
      owner: false,
      lists: [],
      memberId: "member",
      managedLists: [secretList],
    };
    const team = (await store.query({ mode: "team" }, member)).page;
    assert.equal(team.total, 1);
    assert.equal(
      (await store.query({ mode: "team" }, { ...member, managedLists: [] }))
        .page.total,
      0,
    );
    assert.equal(
      (await store.getGift(first.items[0].id, publicAccess)).gift.title,
      "Changed",
    );
    await assert.rejects(
      store.getGift(team.items[0].id, publicAccess),
      /introuvable/,
    );
    await admin.query(
      "UPDATE ouicheur.lists SET surprise_mode=1 WHERE tenant_id=$1 AND id=$2",
      [id, list],
    );
    const hidden = (
      await store.query(
        { mode: "owner", view: "completed", available: "1" },
        {
          ...catalogOwner,
          recipient: true,
          recipientLists: [list],
          revealSurprises: false,
        },
      )
    ).page;
    assert.equal(hidden.hidden, true);
    assert.equal(hidden.counts.completed, null);
    assert.equal(hidden.items[0].reserved, null);
    assert.equal(hidden.items[0].purchased, null);
    assert.equal(hidden.items[0].closed, null);
  } finally {
    db.close();
  }
});
test("wishlist SQL materializes only the requested page in the driver for 10,000 wishes", async (t) => {
  const id = await tenant();
  const list = await service(id).saveList(
    { name: "Load", visibility: "public" },
    catalogOwner,
  );
  await admin.query(
    "INSERT INTO ouicheur.gifts(tenant_id,id,list_id,updated_at,details_ready,title,budget_mode,created_at) SELECT $1,gen_random_uuid()::text,$2,now(),1,'Édition '||i,'unknown',now() FROM generate_series(1,10000) i",
    [id, list],
  );
  let largest = 0,
    returnedBytes = 0;
  const measured = {
    async connect() {
      const c = await runtime.connect();
      return {
        async query(sql: string, values?: unknown[]) {
          const r = await c.query(sql, values);
          largest = Math.max(largest, (r.rows || []).length);
          returnedBytes += Buffer.byteLength(JSON.stringify(r.rows || []));
          return r;
        },
        release() {
          c.release();
        },
      };
    },
  };
  const start = performance.now();
  const result = await new PostgresWishlistStore(measured, id, readKey).query(
    { sort: "title", locale: "fr" },
    { owner: false, lists: [] },
  );
  t.diagnostic(
    JSON.stringify({
      wishes: 10000,
      first_page_ms: Math.round(performance.now() - start),
      driver_rows_max: largest,
      driver_bytes: returnedBytes,
    }),
  );
  assert.equal(result.page.total, 10000);
  assert.equal(result.page.items.length, 24);
  assert.equal(largest, 1);
  assert.ok(returnedBytes < 100000);
  assert.ok(performance.now() - start < 10000);
  const last = await new PostgresWishlistStore(runtime, id, readKey).query(
    { search: "edition 10000" },
    { owner: false, lists: [] },
  );
  assert.equal(last.page.total, 1);
});

test("runtime catalogue bootstrap is explicit, transactional and cannot replace a tenant", async () => {
  const id = randomUUID();
  await assert.rejects(
    createCatalogTenant(runtime, id, { name: "Foyer" }),
    /permission denied/,
  );
  await admin.query(
    `GRANT INSERT ON ouicheur.tenants,ouicheur.gift_priorities TO "${role}"`,
  );
  try {
    await assert.rejects(
      catalogTransaction(runtime, id, async (_client, scoped) => {
        await createCatalogTenant(scoped, id, { name: "Rolled back" });
        throw Error("rollback");
      }),
      /rollback/,
    );
    assert.equal(
      (await admin.query("SELECT 1 FROM ouicheur.tenants WHERE id=$1", [id]))
        .rowCount,
      0,
    );
    await createCatalogTenant(runtime, id, { name: "Foyer", currency: "CHF" });
    await assert.rejects(
      createCatalogTenant(runtime, id, { name: "Replacement" }),
      /duplicate/,
    );
    const doc = await new PostgresWishlistStore(runtime, id, readKey).query(
      { mode: "owner" },
      catalogOwner,
    );
    assert.equal(doc.profile.name, "Foyer");
    assert.equal(doc.profile.currency, "CHF");
    assert.equal(doc.page.priorities.length, 3);
  } finally {
    await admin.query(
      `REVOKE INSERT ON ouicheur.tenants,ouicheur.gift_priorities FROM "${role}"`,
    );
  }
});
