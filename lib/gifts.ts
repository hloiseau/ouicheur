import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { atomic, audit } from "./db";
import { AppError, dateNow, giftSchema } from "./validation";

export type Gift = {
  id: string;
  url: string;
  title: string;
  description: string;
  image: string;
  target: number;
  currency: string;
  category_id: string | null;
  priority: number;
  visibility: string;
  purchased: number;
  closed: number;
  confirmed: number;
  unknown_gross: number;
  category: string | null;
  suggested_price: number | null;
  suggested_currency: string | null;
  extracted_at: string | null;
};
export type PublicProfile = {
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
      "SELECT name,bio,avatar,banner,socials,currency,CASE WHEN paypal<>'' THEN 1 ELSE 0 END payments_enabled FROM owner WHERE id=1",
    )
    .get();
  return row ? ({ ...row } as PublicProfile) : undefined;
}
export function listGifts(db: DatabaseSync, admin = false) {
  return db
    .prepare(
      `SELECT g.*,c.name category,
    COALESCE((SELECT SUM(p.net-p.net_reversed) FROM payments p JOIN contributions n ON n.id=p.contribution_id WHERE n.gift_id=g.id AND p.net IS NOT NULL),0) confirmed,
    COALESCE((SELECT SUM(p.gross-p.refunded) FROM payments p JOIN contributions n ON n.id=p.contribution_id WHERE n.gift_id=g.id AND p.net IS NULL),0) unknown_gross
    FROM gifts g LEFT JOIN categories c ON c.id=g.category_id ${admin ? "" : "WHERE g.visibility='visible'"}
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
  if (duplicate)
    throw new AppError("Ce lien produit existe déjà dans votre wishlist.", 409);
  const now = dateNow();
  db.prepare(
    `INSERT INTO gifts(id,url,title,description,image,target,currency,category_id,priority,visibility,purchased,closed,source,source_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,description=excluded.description,
    image=excluded.image,target=excluded.target,category_id=excluded.category_id,priority=excluded.priority,visibility=excluded.visibility,
    purchased=excluded.purchased,closed=excluded.closed,updated_at=excluded.updated_at`,
  ).run(
    id,
    gift.url,
    gift.title,
    gift.description,
    gift.image,
    gift.target,
    existing?.currency || owner.currency,
    gift.category_id || null,
    gift.priority,
    gift.visibility,
    Number(gift.purchased),
    Number(gift.closed),
    source?.source || null,
    source?.source_id || null,
    now,
    now,
  );
  if (gift.extracted_at)
    db.prepare(
      "UPDATE gifts SET suggested_price=?,suggested_currency=?,extracted_at=? WHERE id=?",
    ).run(gift.suggested_price, gift.suggested_currency, gift.extracted_at, id);
  audit(db, existing ? "gift.update" : "gift.create", id, {
    before: existing || null,
    after: gift,
  });
  return id;
}
