import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { atomic, audit } from "./db";
import { AppError, dateNow, giftSchema } from "./validation";
import type { Appearance } from "./appearance";

export type Gift = {
  id: string;
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
  purchased: number;
  closed: number;
  japan_search: number;
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
};
export function publicProfile(db: DatabaseSync) {
  const row = db
    .prepare(
      "SELECT name,bio,avatar,banner,socials,currency,background,accent,banner_position,layout,CASE WHEN paypal<>'' THEN 1 ELSE 0 END payments_enabled FROM owner WHERE id=1",
    )
    .get();
  return row ? ({ ...row } as PublicProfile) : undefined;
}
// A recorded payment replaces its declaration, including after a refund.
export const fundingTotalsSql = `SELECT c.gift_id,
  SUM(CASE WHEN p.id IS NOT NULL THEN COALESCE(p.net-p.net_reversed,p.gross-MAX(p.refunded,p.net_reversed))
    WHEN c.state='declared' THEN c.amount ELSE 0 END) funded
  FROM contributions c LEFT JOIN payments p ON p.contribution_id=c.id GROUP BY c.gift_id`;

export function listGifts(db: DatabaseSync, admin = false) {
  return db
    .prepare(
      `SELECT g.*,c.name category,COALESCE(f.funded,0) funded,
    COALESCE((SELECT SUM(p.net-p.net_reversed) FROM payments p JOIN contributions n ON n.id=p.contribution_id WHERE n.gift_id=g.id AND p.net IS NOT NULL),0) confirmed,
    COALESCE((SELECT SUM(p.gross-MAX(p.refunded,p.net_reversed)) FROM payments p JOIN contributions n ON n.id=p.contribution_id WHERE n.gift_id=g.id AND p.net IS NULL),0) unknown_gross
    FROM gifts g LEFT JOIN categories c ON c.id=g.category_id
    LEFT JOIN (${fundingTotalsSql}) f ON f.gift_id=g.id ${admin ? "" : "WHERE g.visibility='visible'"}
    ORDER BY g.priority DESC,g.created_at DESC`,
    )
    .all()
    .map((row) => ({ ...row })) as Gift[];
}
export function saveGift(db: DatabaseSync, input: unknown, id?: string) {
  const gift = giftSchema.parse(input);
  return atomic(db, () => saveGiftInTransaction(db, gift, id));
}
// Called inside an existing transaction by import commit too.
export function saveGiftInTransaction(
  db: DatabaseSync,
  gift: ReturnType<typeof giftSchema.parse>,
  id: string = randomUUID(),
  source?: { source: string; source_id: string },
) {
  const owner = db.prepare("SELECT currency FROM owner WHERE id=1").get();
  if (!owner) throw new AppError("Instance non initialisée.");
  const existing = db.prepare("SELECT * FROM gifts WHERE id=?").get(id);
  if (
    gift.category_id &&
    !db.prepare("SELECT 1 FROM categories WHERE id=?").get(gift.category_id)
  )
    throw new AppError("Catégorie inconnue.");
  const duplicate = db
    .prepare("SELECT id FROM gifts WHERE url=? AND id<>?")
    .get(gift.url, id);
  if (duplicate && existing?.url !== gift.url && !gift.allow_duplicate)
    throw new AppError(
      "Ce lien produit existe déjà dans votre Ouichlist. Cochez « Autoriser un doublon » pour créer une autre envie.",
      409,
    );
  // Input target is per unit; the stored target remains the funding total.
  const target = gift.target * gift.quantity;
  if (target > 100000000)
    throw new AppError("Montant hors limites (maximum 1 000 000).");
  // Keep the original import identity on its original wish; explicit copies are local.
  const copiedSource =
    source &&
    gift.allow_duplicate &&
    db
      .prepare("SELECT 1 FROM gifts WHERE source=? AND source_id=? AND id<>?")
      .get(source.source, source.source_id, id);
  const now = dateNow();
  db.prepare(
    `INSERT INTO gifts(id,url,title,description,image,target,quantity,currency,category_id,priority,visibility,purchased,closed,japan_search,source,source_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,description=excluded.description,
    image=excluded.image,target=excluded.target,quantity=excluded.quantity,category_id=excluded.category_id,priority=excluded.priority,visibility=excluded.visibility,
    purchased=excluded.purchased,closed=excluded.closed,japan_search=excluded.japan_search,updated_at=excluded.updated_at`,
  ).run(
    id,
    gift.url,
    gift.title,
    gift.description,
    gift.image,
    target,
    gift.quantity,
    existing?.currency || owner.currency,
    gift.category_id || null,
    gift.priority,
    gift.visibility,
    Number(gift.purchased),
    Number(gift.closed),
    Number(gift.japan_search),
    source?.source || null,
    copiedSource ? null : source?.source_id || null,
    now,
    now,
  );
  if (gift.extracted_at)
    db.prepare(
      "UPDATE gifts SET suggested_price=?,suggested_currency=?,extracted_at=? WHERE id=?",
    ).run(gift.suggested_price, gift.suggested_currency, gift.extracted_at, id);
  audit(db, existing ? "gift.update" : "gift.create", id, {
    before: existing || null,
    after: { ...gift, target },
  });
  return id;
}
