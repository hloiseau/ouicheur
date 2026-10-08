import { fundingExpressions } from "./participation.ts";
import { purchaseCommandSchema, requireCatalogOwner } from "./catalog.ts";
import { SqliteCatalogStore } from "./catalog-sqlite.ts";
import { parseGift } from "./gift-persistence.ts";
import { saveGiftInTransaction } from "./gift-sqlite.ts";
import type { WishDetails, GiftOffer } from "./wish-details.ts";
import type { DatabaseSync } from "node:sqlite";
import { atomic } from "./db.ts";
import { dateNow } from "./validation.ts";
import { listLists, publicAccess, type Access } from "./lists.ts";
import type { Appearance } from "./appearance.ts";
import { hiddenSurpriseLists } from "./surprise.ts";

export type Gift = WishDetails & {
  position?: number;
  id: string;
  list_id: string;
  reserved: number | null;
  surprise_hidden?: boolean;
  declared: number;
  promised: number;
  url: string;
  title: string;
  description: string;
  image: string;
  target: number;
  quantity: number;
  currency: string;
  category_id: string | null;
  priority: number;
  visibility: string;
  purchased: number | null;
  closed: number | null;
  confirmed: number;
  funded: number;
  unknown_gross: number;
  category: string | null;
  suggested_price: number | null;
  suggested_currency: string | null;
  extracted_at: string | null;
};
export type PublicProfile = Appearance & {
  name: string;
  bio: string;
  avatar: string;
  banner: string;
  socials: string;
  currency: string;
  payments_enabled: number;
  paypal_enabled?: number;
  strict_contributions?: number;
};
export function publicProfile(db: DatabaseSync) {
  const row = db
    .prepare(
      "SELECT strict_contributions,name,bio,avatar,banner,socials,currency,background,accent,banner_position,layout,1 payments_enabled,CASE WHEN paypal<>'' THEN 1 ELSE 0 END paypal_enabled FROM owner WHERE id=1",
    )
    .get();
  return row ? ({ ...row } as PublicProfile) : undefined;
}
// A recorded payment replaces its declaration, including after a refund.
export const fundingTotalsSql = `SELECT c.gift_id,
  SUM(${fundingExpressions("sqlite", "(SELECT strict_contributions FROM owner WHERE id=1)").funded}) funded
  FROM contributions c LEFT JOIN payments p ON p.contribution_id=c.id GROUP BY c.gift_id`;

export function listGifts(
  db: DatabaseSync,
  admin = false,
  access: Access = admin ? { owner: true, lists: [] } : publicAccess,
  options: { listId?: string; ids?: string[] } = {},
) {
  const allowed = listLists(db, access)
    .filter(
      (l) =>
        (!options.listId || l.id === options.listId) &&
        (!admin || access.owner || access.managedLists?.includes(l.id)),
    )
    .map((l) => l.id);
  if (!allowed.length || options.ids?.length === 0) return [];
  const clause = `WHERE g.list_id IN (SELECT value FROM json_each(?)) ${admin ? "" : "AND g.visibility='visible'"} ${options.ids ? "AND g.id IN (SELECT value FROM json_each(?))" : ""}`;
  const rows = db
    .prepare(
      `SELECT g.*,c.name category,COALESCE(f.funded,0) funded,
    COALESCE((SELECT SUM(quantity) FROM reservations r WHERE r.gift_id=g.id AND (r.state='purchased' OR (r.state='reserved' AND r.expires_at>?))),0) reserved,
    COALESCE((SELECT SUM(amount) FROM contributions c WHERE c.gift_id=g.id AND c.state='declared' AND c.approved=0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.contribution_id=c.id)),0) declared,
    COALESCE((SELECT SUM(amount) FROM contributions c WHERE c.gift_id=g.id AND c.method='pledge' AND c.state='intent' AND c.approved=0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.contribution_id=c.id)),0) promised,
    COALESCE((SELECT SUM(p.net-p.net_reversed) FROM payments p JOIN contributions n ON n.id=p.contribution_id WHERE n.gift_id=g.id AND p.net IS NOT NULL),0) confirmed,
    COALESCE((SELECT SUM(p.gross-MAX(p.refunded,p.net_reversed)) FROM payments p JOIN contributions n ON n.id=p.contribution_id WHERE n.gift_id=g.id AND p.net IS NULL),0) unknown_gross
    FROM gifts g LEFT JOIN categories c ON c.id=g.category_id
    LEFT JOIN gift_priorities gp ON gp.id=COALESCE(g.priority_id,g.priority)
    LEFT JOIN (${fundingTotalsSql}) f ON f.gift_id=g.id ${clause}
    ORDER BY gp.position,g.created_at DESC,g.id`,
    )
    .all(
      dateNow(),
      JSON.stringify(allowed),
      ...(options.ids ? [JSON.stringify(options.ids)] : []),
    )
    .map(({ japan_search: _retired, priority_id, ...row }) => ({
      ...row,
      priority: priority_id ?? row.priority,
    })) as Omit<Gift, "surprise_hidden">[];
  const offers = db
    .prepare(
      "SELECT id,gift_id,url,condition,note,price,currency,shipping,availability,checked_at FROM gift_offers WHERE gift_id IN (SELECT value FROM json_each(?)) ORDER BY position,id",
    )
    .all(JSON.stringify(rows.map((r) => r.id)));
  const offersByGift = new Map<string, GiftOffer[]>();
  for (const { gift_id, ...o } of offers) {
    const key = String(gift_id);
    const group = offersByGift.get(key) || [];
    group.push(o as GiftOffer);
    offersByGift.set(key, group);
  }
  const hidden = hiddenSurpriseLists(db, access);
  return (
    admin && access.owner
      ? rows
      : rows.filter((g) =>
          (admin ? access.managedLists || [] : allowed).includes(g.list_id),
        )
  )
    .map((gift) => ({
      ...gift,
      target: gift.budget_mode === "fixed" ? gift.target : 0,
      offers: offersByGift.get(gift.id) || [],
    }))
    .map<Gift>((gift) =>
      hidden.includes(gift.list_id)
        ? {
            ...gift,
            reserved: null,
            purchased: null,
            closed: null,
            surprise_hidden: true,
          }
        : gift,
    );
}
export function saveGift(db: DatabaseSync, input: unknown, id?: string) {
  const gift = parseGift(input);
  return atomic(db, () => saveGiftInTransaction(db, gift, id));
}
export function setGiftPurchased(
  db: DatabaseSync,
  id: string,
  input: unknown,
  access: Access,
) {
  requireCatalogOwner(access);
  const { purchased } = purchaseCommandSchema.parse(input);
  return new SqliteCatalogStore(db).setGiftPurchasedSync(id, purchased, access);
}
// Runs inside the caller's transaction for imports, templates and family edits.
export { saveGiftInTransaction } from "./gift-sqlite.ts";
