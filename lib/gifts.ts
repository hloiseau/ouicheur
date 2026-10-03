import { variantKey } from "./wish-details.ts";
import type { WishDetails, GiftOffer } from "./wish-details.ts";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { atomic, audit } from "./db";
import { AppError, dateNow, giftSchema, webUrl } from "./validation";
import { listLists, publicAccess, type Access } from "./lists.ts";
import { reservedQuantity } from "./reservations.ts";
import type { Appearance } from "./appearance";
import { hiddenSurpriseLists, requireSurpriseReveal } from "./surprise.ts";

export type Gift = WishDetails & {
  id: string;
  list_id: string;
  reserved: number | null;
  surprise_hidden?: boolean;
  declared: number;
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
  strict_contributions?: number;
};
export function publicProfile(db: DatabaseSync) {
  const row = db
    .prepare(
      "SELECT strict_contributions,name,bio,avatar,banner,socials,currency,background,accent,banner_position,layout,CASE WHEN paypal<>'' THEN 1 ELSE 0 END payments_enabled FROM owner WHERE id=1",
    )
    .get();
  return row ? ({ ...row } as PublicProfile) : undefined;
}
// A recorded payment replaces its declaration, including after a refund.
export const fundingTotalsSql = `SELECT c.gift_id,
  SUM(CASE WHEN p.id IS NOT NULL THEN COALESCE(p.net-p.net_reversed,p.gross-MAX(p.refunded,p.net_reversed))
    WHEN c.state='declared' AND (c.approved=1 OR (SELECT strict_contributions FROM owner WHERE id=1)=0) THEN c.amount ELSE 0 END) funded
  FROM contributions c LEFT JOIN payments p ON p.contribution_id=c.id GROUP BY c.gift_id`;

export function listGifts(
  db: DatabaseSync,
  admin = false,
  access: Access = admin ? { owner: true, lists: [] } : publicAccess,
) {
  const allowed = listLists(db, access).map((l) => l.id);
  const rows = db
    .prepare(
      `SELECT g.*,c.name category,COALESCE(f.funded,0) funded,
    COALESCE((SELECT SUM(quantity) FROM reservations r WHERE r.gift_id=g.id AND (r.state='purchased' OR (r.state='reserved' AND r.expires_at>?))),0) reserved,
    COALESCE((SELECT SUM(amount) FROM contributions c WHERE c.gift_id=g.id AND c.state='declared' AND c.approved=0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.contribution_id=c.id)),0) declared,
    COALESCE((SELECT SUM(p.net-p.net_reversed) FROM payments p JOIN contributions n ON n.id=p.contribution_id WHERE n.gift_id=g.id AND p.net IS NOT NULL),0) confirmed,
    COALESCE((SELECT SUM(p.gross-MAX(p.refunded,p.net_reversed)) FROM payments p JOIN contributions n ON n.id=p.contribution_id WHERE n.gift_id=g.id AND p.net IS NULL),0) unknown_gross
    FROM gifts g LEFT JOIN categories c ON c.id=g.category_id
    LEFT JOIN gift_priorities gp ON gp.id=COALESCE(g.priority_id,g.priority)
    LEFT JOIN (${fundingTotalsSql}) f ON f.gift_id=g.id ${admin ? "" : "WHERE g.visibility='visible'"}
    ORDER BY gp.position,g.created_at DESC`,
    )
    .all(dateNow())
    .map(({ japan_search: _retired, priority_id, ...row }) => ({
      ...row,
      priority: priority_id ?? row.priority,
    })) as Omit<Gift, "surprise_hidden">[];
  const offers = db
    .prepare(
      "SELECT id,gift_id,url,condition,note,price,currency,shipping,availability,checked_at FROM gift_offers ORDER BY position,id",
    )
    .all();
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
      offers: offers
        .filter((o) => o.gift_id === gift.id)
        .map(({ gift_id: _id, ...o }) => o) as GiftOffer[],
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
  const raw = input as Record<string, unknown>;
  const gift = giftSchema.parse({
    ...raw,
    original_url: raw.original_url ?? raw.url ?? "",
  });
  return atomic(db, () => saveGiftInTransaction(db, gift, id));
}
export function setGiftPurchased(
  db: DatabaseSync,
  id: string,
  input: unknown,
  access: Access,
) {
  if (!access.owner)
    throw new AppError("Connexion administrateur requise.", 401);
  const { purchased } = z
    .object({ purchased: z.boolean() })
    .strict()
    .parse(input);
  return atomic(db, () => {
    const gift = db
      .prepare("SELECT list_id,purchased FROM gifts WHERE id=?")
      .get(id);
    if (!gift) throw new AppError("Cadeau introuvable.", 404);
    requireSurpriseReveal(db, access, String(gift.list_id));
    if (!!gift.purchased !== purchased) {
      db.prepare("UPDATE gifts SET purchased=?,updated_at=? WHERE id=?").run(
        Number(purchased),
        dateNow(),
        id,
      );
      audit(db, "gift.purchase", id, {
        before: !!gift.purchased,
        after: purchased,
      });
    }
    return { purchased };
  });
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
  if (gift.kind === "product" && !gift.url)
    throw new AppError(
      "Un produit doit avoir un lien. Choisissez un autre type pour une envie sans lien.",
    );
  if (gift.budget_mode === "fixed" && gift.target <= 0)
    throw new AppError(
      "Renseignez un budget positif ou choisissez un budget non précisé ou sans dépense.",
    );
  if (gift.original_url) webUrl(gift.original_url);
  if (
    gift.budget_mode !== "fixed" &&
    db.prepare("SELECT 1 FROM contributions WHERE gift_id=?").get(id)
  )
    throw new AppError(
      "Le budget ne peut pas être retiré tant qu’un historique de contributions existe.",
      409,
    );
  const listId = gift.list_id || String(existing?.list_id || "default");
  if (!db.prepare("SELECT 1 FROM lists WHERE id=?").get(listId))
    throw new AppError("Liste introuvable.", 404);
  if (reservedQuantity(db, id) > gift.quantity)
    throw new AppError(
      "La quantité ne peut pas être inférieure aux réservations actives.",
      409,
    );
  if (
    gift.category_id &&
    !db.prepare("SELECT 1 FROM categories WHERE id=?").get(gift.category_id)
  )
    throw new AppError("Catégorie inconnue.");
  if (
    !db.prepare("SELECT 1 FROM gift_priorities WHERE id=?").get(gift.priority)
  )
    throw new AppError("Priorité inconnue.");
  const duplicate =
    gift.url &&
    db
      .prepare(
        "SELECT id FROM gifts WHERE url=? AND size=? COLLATE NOCASE AND color=? COLLATE NOCASE AND model=? COLLATE NOCASE AND id<>?",
      )
      .get(gift.url, gift.size, gift.color, gift.model, id);
  if (
    duplicate &&
    (!existing ||
      variantKey({
        url: String(existing.url),
        size: String(existing.size),
        color: String(existing.color),
        model: String(existing.model),
      }) !== variantKey(gift)) &&
    !gift.allow_duplicate
  )
    throw new AppError(
      "Ce lien produit existe déjà dans votre Ouichlist. Cochez « Autoriser un doublon » pour créer une autre envie.",
      409,
    );
  // Input target is per unit; the stored target remains the funding total.
  const target = gift.budget_mode === "fixed" ? gift.target * gift.quantity : 1;
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
    existing?.currency || owner.currency,
    gift.category_id || null,
    gift.priority <= 2 ? gift.priority : 0,
    gift.priority,
    gift.visibility,
    Number(gift.purchased ?? existing?.purchased ?? false),
    Number(gift.closed),
    source?.source || null,
    copiedSource ? null : source?.source_id || null,
    now,
    now,
  );
  db.prepare("UPDATE gifts SET list_id=? WHERE id=?").run(listId, id);
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
  const retained: string[] = [];
  for (const [position, offer] of gift.offers.entries()) {
    const offerId = offer.id || randomUUID();
    const previous = db
      .prepare("SELECT gift_id FROM gift_offers WHERE id=?")
      .get(offerId);
    if (previous && previous.gift_id !== id)
      throw new AppError("Offre inconnue.", 404);
    if (retained.includes(offerId))
      throw new AppError("Une offre ne peut apparaître qu’une fois.");
    retained.push(offerId);
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
  audit(db, existing ? "gift.update" : "gift.create", id, {
    before: existing || null,
    after: { ...gift, target },
  });
  return id;
}
