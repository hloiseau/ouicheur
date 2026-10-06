import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { atomic, audit } from "./db.ts";
import { dateNow } from "./validation.ts";
import { reservedQuantity } from "./reservations.ts";
import {
  giftDecision,
  giftRecord,
  requireGiftEdit,
  type GiftCommand,
  type GiftSnapshot,
  type GiftSource,
  type GiftStore,
} from "./gift-persistence.ts";
import type { Access } from "./lists.ts";

export function saveGiftInTransaction(
  db: DatabaseSync,
  gift: GiftCommand,
  id: string = randomUUID(),
  source?: GiftSource,
) {
  const existing = db.prepare("SELECT * FROM gifts WHERE id=?").get(id) as
    GiftSnapshot | undefined;
  const list = gift.list_id || existing?.list_id || "default";
  const owners = db
    .prepare(
      "SELECT id,gift_id FROM gift_offers WHERE id IN (SELECT value FROM json_each(?))",
    )
    .all(JSON.stringify(gift.offers.flatMap((o) => (o.id ? [o.id] : []))));
  const plan = giftDecision(
    gift,
    id,
    {
      currency: db.prepare("SELECT currency FROM owner WHERE id=1").get()
        ?.currency as string | undefined,
      existing,
      listExists: !!db.prepare("SELECT 1 FROM lists WHERE id=?").get(list),
      categoryExists:
        !gift.category_id ||
        !!db
          .prepare("SELECT 1 FROM categories WHERE id=?")
          .get(gift.category_id),
      priorityExists: !!db
        .prepare("SELECT 1 FROM gift_priorities WHERE id=?")
        .get(gift.priority),
      reserved: reservedQuantity(db, id),
      hasContributions: !!db
        .prepare("SELECT 1 FROM contributions WHERE gift_id=?")
        .get(id),
      duplicate:
        !!gift.url &&
        !!db
          .prepare(
            "SELECT 1 FROM gifts WHERE url=? AND size=? COLLATE NOCASE AND color=? COLLATE NOCASE AND model=? COLLATE NOCASE AND id<>?",
          )
          .get(gift.url, gift.size, gift.color, gift.model, id),
      copiedSource:
        !!source &&
        gift.allow_duplicate &&
        !!db
          .prepare(
            "SELECT 1 FROM gifts WHERE source=? AND source_id=? AND id<>?",
          )
          .get(source.source, source.source_id, id),
      offerOwners: new Map(
        owners.map((o) => [String(o.id), String(o.gift_id)]),
      ),
    },
    source,
  );
  const now = dateNow();
  const target = plan.target,
    listId = plan.listId;
  db.prepare(
    `INSERT INTO gifts(id,url,title,description,image,target,quantity,currency,category_id,priority,priority_id,visibility,purchased,closed,source,source_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,description=excluded.description,
    image=excluded.image,target=excluded.target,quantity=excluded.quantity,category_id=excluded.category_id,priority=excluded.priority,priority_id=excluded.priority_id,visibility=excluded.visibility,
    purchased=excluded.purchased,closed=excluded.closed,updated_at=excluded.updated_at`,
  ).run(
    id,
    gift.url,
    gift.title,
    gift.description,
    gift.image,
    target,
    gift.quantity,
    plan.currency,
    gift.category_id || null,
    gift.priority <= 2 ? gift.priority : 0,
    gift.priority,
    gift.visibility,
    plan.purchased,
    Number(gift.closed),
    plan.source,
    plan.sourceId,
    now,
    now,
  );
  db.prepare("UPDATE gifts SET list_id=? WHERE id=?").run(listId, id);
  if (!existing)
    db.prepare(
      "UPDATE gifts SET position=COALESCE((SELECT MAX(position)+1 FROM gifts WHERE list_id=? AND id<>?),0) WHERE id=?",
    ).run(listId, id, id);
  db.prepare(
    "UPDATE gifts SET kind=?,budget_mode=?,size=?,color=?,model=?,variant_note=?,variant_policy=?,time_hint=?,original_url=? WHERE id=?",
  ).run(
    gift.kind,
    gift.budget_mode,
    gift.size,
    gift.color,
    gift.model,
    gift.variant_note,
    gift.variant_policy,
    gift.time_hint,
    gift.original_url || gift.url,
    id,
  );
  const retained = plan.offers.map((offer) => offer.id);
  for (const offer of plan.offers) {
    const offerId = offer.id,
      position = offer.position;
    db.prepare(
      `INSERT INTO gift_offers(id,gift_id,url,condition,note,price,currency,shipping,availability,checked_at,position) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,condition=excluded.condition,note=excluded.note,price=excluded.price,currency=excluded.currency,shipping=excluded.shipping,availability=excluded.availability,checked_at=excluded.checked_at,position=excluded.position`,
    ).run(
      offerId,
      id,
      offer.url,
      offer.condition,
      offer.note,
      offer.price,
      offer.currency,
      offer.shipping,
      offer.availability,
      offer.checked_at,
      position,
    );
  }
  for (const offer of db
    .prepare("SELECT id FROM gift_offers WHERE gift_id=?")
    .all(id))
    if (!retained.includes(String(offer.id)))
      db.prepare("DELETE FROM gift_offers WHERE id=?").run(offer.id);
  if (gift.extracted_at)
    db.prepare(
      "UPDATE gifts SET suggested_price=?,suggested_currency=?,extracted_at=? WHERE id=?",
    ).run(gift.suggested_price, gift.suggested_currency, gift.extracted_at, id);
  audit(db, plan.action, id, plan.audit);
  return id;
}

export class SqliteGiftStore implements GiftStore {
  db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  async saveGift(gift: GiftCommand, access: Access, id?: string) {
    return atomic(this.db, () => {
      const existing = id
        ? (this.db
            .prepare(
              "SELECT g.*,l.surprise_mode FROM gifts g JOIN lists l ON l.id=g.list_id WHERE g.id=?",
            )
            .get(id) as GiftSnapshot | undefined)
        : undefined;
      requireGiftEdit(
        existing,
        Number(existing?.surprise_mode || 0),
        access,
        id,
      );
      return saveGiftInTransaction(this.db, gift, id);
    });
  }
  async getGift(id: string, access: Access) {
    const row = this.db
      .prepare(
        "SELECT g.*,l.surprise_mode FROM gifts g JOIN lists l ON l.id=g.list_id WHERE g.id=?",
      )
      .get(id);
    if (!row) return undefined;
    const offers = this.db
      .prepare(
        "SELECT id,url,condition,note,price,currency,shipping,availability,checked_at FROM gift_offers WHERE gift_id=? ORDER BY position,id",
      )
      .all(id) as GiftCommand["offers"];
    return giftRecord(row, offers, access, Number(row.surprise_mode));
  }
}
