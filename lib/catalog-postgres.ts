import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  listDecision,
  purchaseDecision,
  type CatalogList,
  type CatalogStore,
  type ListCommand,
  type PurchaseSnapshot,
} from "./catalog.ts";
import type { Access } from "./lists.ts";

// Structural interfaces keep the driver optional for SQLite installations.
export interface PgConnection {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release(destroy?: boolean): void;
}
export interface PgPool {
  connect(): Promise<PgConnection>;
}
const tenantSchema = z.uuid();
const columns =
  "id,name,description,visibility,archived,event_date,surprise_mode,suggestions_enabled,event_annual,event_timezone,leap_day";

export async function tenantTransaction<T>(
  pool: PgPool,
  tenantId: string,
  work: (client: PgConnection) => Promise<T>,
): Promise<T> {
  tenantSchema.parse(tenantId);
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query(
      "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='15s'",
    );
    const role = (
      await client.query(
        `SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ouicheur' AND c.relkind='r' AND pg_has_role(current_user,c.relowner,'USAGE')) AS owns_tables FROM pg_roles r WHERE r.rolname=current_user`,
      )
    ).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || role.owns_tables)
      throw new Error(
        "Use a non-owner PostgreSQL runtime role without SUPERUSER or BYPASSRLS",
      );
    await client.query("SELECT set_config('ouicheur.tenant_id',$1,true)", [
      tenantId,
    ]);
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

export class PostgresCatalogStore implements CatalogStore {
  pool: PgPool;
  tenantId: string;
  constructor(pool: PgPool, tenantId: string) {
    this.pool = pool;
    this.tenantId = tenantSchema.parse(tenantId);
  }
  async getList(id: string) {
    return tenantTransaction(
      this.pool,
      this.tenantId,
      async (client) =>
        (
          await client.query(
            `SELECT ${columns} FROM ouicheur.lists WHERE tenant_id=$1 AND id=$2`,
            [this.tenantId, id],
          )
        ).rows[0] as CatalogList | undefined,
    );
  }
  async saveList(value: ListCommand) {
    return tenantTransaction(this.pool, this.tenantId, async (client) => {
      const id = value.id || randomUUID();
      const existing = (
        await client.query(
          `SELECT ${columns} FROM ouicheur.lists WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [this.tenantId, id],
        )
      ).rows[0] as CatalogList | undefined;
      const decision = listDecision(value, existing),
        row = decision.fields;
      await client.query(
        `INSERT INTO ouicheur.lists(tenant_id,id,name,description,visibility,archived,event_date,surprise_mode,suggestions_enabled,event_annual,event_timezone,leap_day,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT(tenant_id,id) DO UPDATE SET name=excluded.name,description=excluded.description,visibility=excluded.visibility,archived=excluded.archived,event_date=excluded.event_date,surprise_mode=excluded.surprise_mode,suggestions_enabled=excluded.suggestions_enabled,event_annual=excluded.event_annual,event_timezone=excluded.event_timezone,leap_day=excluded.leap_day`,
        [
          this.tenantId,
          id,
          row.name,
          row.description,
          row.visibility,
          row.archived,
          row.event_date,
          row.surprise_mode,
          row.suggestions_enabled,
          row.event_annual,
          row.event_timezone,
          row.leap_day,
          new Date().toISOString(),
        ],
      );
      if (decision.revokeShares)
        await client.query(
          "UPDATE ouicheur.lists SET share_hash=NULL WHERE tenant_id=$1 AND id=$2",
          [this.tenantId, id],
        );
      if (decision.resetReveals)
        await client.query(
          "UPDATE ouicheur.session_reveals SET surprises_revealed=0 WHERE tenant_id=$1",
          [this.tenantId],
        );
      await this.audit(client, "list.save", id, decision.audit);
      return id;
    });
  }
  async setGiftPurchased(id: string, purchased: boolean, access: Access) {
    return tenantTransaction(this.pool, this.tenantId, async (client) => {
      const gift = (
        await client.query(
          "SELECT g.list_id,g.purchased,l.surprise_mode FROM ouicheur.gifts g JOIN ouicheur.lists l ON l.tenant_id=g.tenant_id AND l.id=g.list_id WHERE g.tenant_id=$1 AND g.id=$2 FOR UPDATE OF g,l",
          [this.tenantId, id],
        )
      ).rows[0] as PurchaseSnapshot | undefined;
      const decision = purchaseDecision(gift, purchased, access);
      if (decision.changed) {
        await client.query(
          "UPDATE ouicheur.gifts SET purchased=$1,updated_at=$2 WHERE tenant_id=$3 AND id=$4",
          [Number(purchased), new Date().toISOString(), this.tenantId, id],
        );
        await this.audit(client, "gift.purchase", id, decision.audit);
      }
      return { purchased };
    });
  }
  private async audit(
    client: PgConnection,
    action: string,
    id: string,
    detail: unknown,
  ) {
    await client.query(
      "INSERT INTO ouicheur.audit(tenant_id,id,action,entity_id,detail,created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",
      [
        this.tenantId,
        randomUUID(),
        action,
        id,
        JSON.stringify(detail),
        new Date().toISOString(),
      ],
    );
  }
}

export async function migrateCatalog(pool: PgPool) {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query(
      "SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='60s'",
    );
    await client.query("SELECT pg_advisory_xact_lock(1869967977,1)");
    await client.query(
      "CREATE SCHEMA IF NOT EXISTS ouicheur; CREATE TABLE IF NOT EXISTS ouicheur.catalog_migrations(name text PRIMARY KEY,sha256 text NOT NULL)",
    );
    const name = "001-catalog.sql";
    const sql = readFileSync(
      new URL(`./postgres/${name}`, import.meta.url),
      "utf8",
    );
    const hash = createHash("sha256").update(sql).digest("hex");
    const applied = (
      await client.query("SELECT name,sha256 FROM ouicheur.catalog_migrations")
    ).rows;
    if (applied.some((row) => row.name !== name || row.sha256 !== hash))
      throw new Error("Unknown or modified PostgreSQL catalog migration");
    if (!applied.length) {
      await client.query(sql);
      await client.query(
        "INSERT INTO ouicheur.catalog_migrations VALUES ($1,$2)",
        [name, hash],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

// Administrative provisioning, never available from the runtime service.
export async function provisionCatalogTenant(pool: PgPool, tenantId: string) {
  tenantSchema.parse(tenantId);
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('ouicheur.tenant_id',$1,true)", [
      tenantId,
    ]);
    await client.query(
      "INSERT INTO ouicheur.tenants(id) VALUES ($1) ON CONFLICT DO NOTHING",
      [tenantId],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

export async function grantCatalogRuntime(pool: PgPool, role: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role))
    throw new Error("Invalid PostgreSQL role identifier");
  const client = await pool.connect();
  try {
    const r = (
      await client.query(
        "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1",
        [role],
      )
    ).rows[0];
    if (!r || r.rolsuper || r.rolbypassrls)
      throw new Error("Invalid PostgreSQL runtime role");
    await client.query(
      `GRANT USAGE ON SCHEMA ouicheur TO "${role}"; GRANT SELECT,INSERT,UPDATE ON ouicheur.lists TO "${role}"; GRANT SELECT,UPDATE ON ouicheur.gifts,ouicheur.session_reveals TO "${role}"; GRANT SELECT,INSERT ON ouicheur.audit TO "${role}"`,
    );
  } finally {
    client.release();
  }
}
