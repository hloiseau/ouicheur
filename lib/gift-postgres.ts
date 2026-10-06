import { randomUUID } from "node:crypto";
import { AppError } from "./validation.ts";
import {
  tenantTransaction,
  lockGiftWrites,
  type PgPool,
} from "./catalog-postgres.ts";
import {
  duplicateGiftKey,
  giftDecision,
  giftRecord,
  requireGiftEdit,
  type GiftCommand,
  type GiftSnapshot,
  type GiftStore,
} from "./gift-persistence.ts";
import type { Access } from "./lists.ts";

// All gift metadata writes in one household share this transaction lock. This
// closes races in duplicate detection, offer ownership and list positioning.
// Different households remain independent. Future participation writes must
// lock their gift row before checking/modifying its quantity or funding rules.
export class PostgresGiftStore implements GiftStore {
  pool: PgPool;
  tenant: string;
  constructor(pool: PgPool, tenant: string) {
    this.pool = pool;
    this.tenant = tenant;
  }
  async getGift(id: string, access: Access) {
    return tenantTransaction(this.pool, this.tenant, async (client) => {
      const row = (
        await client.query(
          "SELECT g.*,g.priority_id::double precision AS priority_id,l.surprise_mode FROM ouicheur.gifts g JOIN ouicheur.lists l ON l.tenant_id=g.tenant_id AND l.id=g.list_id WHERE g.tenant_id=$1 AND g.id=$2 FOR SHARE OF g,l",
          [this.tenant, id],
        )
      ).rows[0];
      if (!row) return undefined;
      if (!row.details_ready)
        throw new AppError(
          "Les détails de ce cadeau doivent être complétés.",
          409,
        );
      const offers = (
        await client.query(
          "SELECT id,url,condition,note,price,currency,shipping,availability,checked_at FROM ouicheur.gift_offers WHERE tenant_id=$1 AND gift_id=$2 ORDER BY position,id",
          [this.tenant, id],
        )
      ).rows.map((o) => ({
        ...o,
        checked_at:
          o.checked_at instanceof Date
            ? o.checked_at.toISOString()
            : o.checked_at,
      })) as GiftCommand["offers"];
      return giftRecord(row, offers, access, Number(row.surprise_mode));
    });
  }
  async saveGift(gift: GiftCommand, access: Access, updateId?: string) {
    return tenantTransaction(this.pool, this.tenant, async (client) => {
      await lockGiftWrites(client, this.tenant);
      const id = updateId || randomUUID();
      const existing = (
        await client.query(
          "SELECT g.*,g.priority_id::double precision AS priority_id,l.surprise_mode FROM ouicheur.gifts g JOIN ouicheur.lists l ON l.tenant_id=g.tenant_id AND l.id=g.list_id WHERE g.tenant_id=$1 AND g.id=$2 FOR UPDATE OF g",
          [this.tenant, id],
        )
      ).rows[0] as GiftSnapshot | undefined;
      requireGiftEdit(
        existing,
        Number(existing?.surprise_mode || 0),
        access,
        updateId,
      );
      const listId = gift.list_id || existing?.list_id || "default";
      // Hold the list row while applying the edit so surprise settings cannot
      // change between authorization and commit.
      const lists = (
        await client.query(
          "SELECT id,surprise_mode FROM ouicheur.lists WHERE tenant_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR SHARE",
          [this.tenant, [listId, ...(existing ? [existing.list_id] : [])]],
        )
      ).rows;
      if (existing)
        requireGiftEdit(
          existing,
          Number(
            lists.find((l) => l.id === existing.list_id)?.surprise_mode || 0,
          ),
          access,
          updateId,
        );
      const currency = (
        await client.query(
          "SELECT currency FROM ouicheur.tenants WHERE id=$1",
          [this.tenant],
        )
      ).rows[0]?.currency as string | undefined;
      const refs = (
        await client.query(
          "SELECT EXISTS(SELECT 1 FROM ouicheur.categories WHERE tenant_id=$1 AND id=$2) AS category, EXISTS(SELECT 1 FROM ouicheur.gift_priorities WHERE tenant_id=$1 AND id=$3) AS priority, EXISTS(SELECT 1 FROM ouicheur.contributions WHERE tenant_id=$1 AND gift_id=$4) AS contributed, (SELECT COALESCE(sum(quantity),0)::int FROM ouicheur.reservations WHERE tenant_id=$1 AND gift_id=$4 AND (state='purchased' OR (state='reserved' AND expires_at>now()))) AS reserved, EXISTS(SELECT 1 FROM ouicheur.gifts WHERE tenant_id=$1 AND duplicate_key=$5 AND id<>$4) AS duplicate",
          [
            this.tenant,
            gift.category_id,
            gift.priority,
            id,
            duplicateGiftKey(gift),
          ],
        )
      ).rows[0];
      const owners = (
        await client.query(
          "SELECT id,gift_id FROM ouicheur.gift_offers WHERE tenant_id=$1 AND id=ANY($2::uuid[])",
          [this.tenant, gift.offers.flatMap((o) => (o.id ? [o.id] : []))],
        )
      ).rows;
      const plan = giftDecision(gift, id, {
        currency,
        existing,
        listExists: lists.some((l) => l.id === listId),
        categoryExists: !gift.category_id || !!refs.category,
        priorityExists: !!refs.priority,
        reserved: Number(refs.reserved),
        hasContributions: !!refs.contributed,
        duplicate: !!gift.url && !!refs.duplicate,
        copiedSource: false,
        offerOwners: new Map(
          owners.map((o) => [String(o.id), String(o.gift_id)]),
        ),
      });
      const now = new Date().toISOString();
      const position =
        existing?.position ??
        (
          await client.query(
            "SELECT COALESCE(max(position)+1,0) AS next FROM ouicheur.gifts WHERE tenant_id=$1 AND list_id=$2",
            [this.tenant, plan.listId],
          )
        ).rows[0].next;
      const row: Record<string, unknown> = {
        tenant_id: this.tenant,
        id,
        list_id: plan.listId,
        details_ready: 1,
        url: gift.url,
        title: gift.title,
        description: gift.description,
        image: gift.image,
        target: plan.target,
        quantity: gift.quantity,
        currency: existing?.details_ready === 0 ? currency : plan.currency,
        category_id: gift.category_id || null,
        priority: gift.priority <= 2 ? gift.priority : 0,
        priority_id: gift.priority,
        visibility: gift.visibility,
        purchased: plan.purchased,
        closed: Number(gift.closed),
        source: existing?.source ?? null,
        source_id: existing?.source_id ?? null,
        kind: gift.kind,
        budget_mode: gift.budget_mode,
        size: gift.size,
        color: gift.color,
        model: gift.model,
        variant_note: gift.variant_note,
        variant_policy: gift.variant_policy,
        time_hint: gift.time_hint,
        original_url: gift.original_url || gift.url,
        position,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        duplicate_key: gift.url ? duplicateGiftKey(gift) : null,
        suggested_price: gift.extracted_at
          ? gift.suggested_price
          : (existing?.suggested_price ?? null),
        suggested_currency: gift.extracted_at
          ? gift.suggested_currency
          : (existing?.suggested_currency ?? null),
        extracted_at: gift.extracted_at || existing?.extracted_at || null,
      };
      const keys = Object.keys(row);
      await client.query(
        `INSERT INTO ouicheur.gifts(${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT(tenant_id,id) DO UPDATE SET ${keys
          .filter(
            (k) =>
              ![
                "tenant_id",
                "id",
                "created_at",
                "source",
                "source_id",
              ].includes(k),
          )
          .map((k) => `${k}=excluded.${k}`)
          .join(",")}`,
        Object.values(row),
      );
      for (const offer of plan.offers) {
        await client.query(
          "INSERT INTO ouicheur.gift_offers(tenant_id,id,gift_id,url,condition,note,price,currency,shipping,availability,checked_at,position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(tenant_id,id) DO UPDATE SET url=excluded.url,condition=excluded.condition,note=excluded.note,price=excluded.price,currency=excluded.currency,shipping=excluded.shipping,availability=excluded.availability,checked_at=excluded.checked_at,position=excluded.position",
          [
            this.tenant,
            offer.id,
            id,
            offer.url,
            offer.condition,
            offer.note,
            offer.price,
            offer.currency,
            offer.shipping,
            offer.availability,
            offer.checked_at,
            offer.position,
          ],
        );
      }
      await client.query(
        "DELETE FROM ouicheur.gift_offers WHERE tenant_id=$1 AND gift_id=$2 AND NOT(id=ANY($3::uuid[]))",
        [this.tenant, id, plan.offers.map((o) => o.id)],
      );
      await client.query(
        "INSERT INTO ouicheur.audit(tenant_id,id,action,entity_id,detail,created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",
        [
          this.tenant,
          randomUUID(),
          plan.action,
          id,
          JSON.stringify(plan.audit),
          now,
        ],
      );
      return id;
    });
  }
}
