import { randomUUID } from "node:crypto";
import { AppError, giftSchema, text, webUrl } from "./validation.ts";
import { requireCatalogOwner, purchaseDecision } from "./catalog.ts";
import { variantKey } from "./wish-details.ts";
import type { Access } from "./lists.ts";

export type GiftCommand = ReturnType<typeof giftSchema.parse>;
export type GiftSource = { source: string; source_id: string };
export type GiftSnapshot = Record<string, unknown> & {
  id: string;
  list_id: string;
  url: string;
  size: string;
  color: string;
  model: string;
  currency: string;
  purchased: number;
};
export function parseGift(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;
  return giftSchema.parse({
    ...raw,
    original_url: raw.original_url ?? raw.url ?? "",
  });
}
// Match SQLite's existing URL equality and ASCII-only NOCASE variant lookup.
export function duplicateGiftKey(
  gift: Pick<GiftCommand, "url" | "size" | "color" | "model">,
) {
  return JSON.stringify([
    gift.url,
    ...[gift.size, gift.color, gift.model].map((s) =>
      s.replace(/[A-Z]/g, (c) => c.toLowerCase()),
    ),
  ]);
}
export type GiftFacts = {
  currency?: string;
  existing?: GiftSnapshot;
  listExists: boolean;
  categoryExists: boolean;
  priorityExists: boolean;
  reserved: number;
  hasContributions: boolean;
  duplicate: boolean;
  copiedSource: boolean;
  offerOwners: Map<string, string>;
};
export function giftDecision(
  gift: GiftCommand,
  id: string,
  facts: GiftFacts,
  source?: GiftSource,
) {
  const existing = facts.existing;
  if (!facts.currency) throw new AppError("Instance non initialisée.");
  if (gift.kind === "product" && !gift.url)
    throw new AppError(
      "Un produit doit avoir un lien. Choisissez un autre type pour une envie sans lien.",
    );
  if (gift.budget_mode === "fixed" && gift.target <= 0)
    throw new AppError(
      "Renseignez un budget positif ou choisissez un budget non précisé ou sans dépense.",
    );
  if (gift.original_url) webUrl(gift.original_url);
  if (gift.budget_mode !== "fixed" && facts.hasContributions)
    throw new AppError(
      "Le budget ne peut pas être retiré tant qu’un historique de contributions existe.",
      409,
    );
  if (!facts.listExists) throw new AppError("Liste introuvable.", 404);
  if (facts.reserved > gift.quantity)
    throw new AppError(
      "La quantité ne peut pas être inférieure aux réservations actives.",
      409,
    );
  if (!facts.categoryExists) throw new AppError("Catégorie inconnue.");
  if (!facts.priorityExists) throw new AppError("Priorité inconnue.");
  if (
    facts.duplicate &&
    (!existing || variantKey(existing) !== variantKey(gift)) &&
    !gift.allow_duplicate
  )
    throw new AppError(
      "Ce lien produit existe déjà dans votre Ouichlist. Cochez « Autoriser un doublon » pour créer une autre envie.",
      409,
    );
  const target = gift.budget_mode === "fixed" ? gift.target * gift.quantity : 1;
  if (target > 100000000)
    throw new AppError("Montant hors limites (maximum 1 000 000).");
  const retained = new Set<string>();
  const offers = gift.offers.map((offer, position) => {
    const offerId = offer.id || randomUUID();
    const owner = facts.offerOwners.get(offerId);
    if (owner && owner !== id) throw new AppError("Offre inconnue.", 404);
    if (retained.has(offerId))
      throw new AppError("Une offre ne peut apparaître qu’une fois.");
    retained.add(offerId);
    return { ...offer, id: offerId, position };
  });
  return {
    target,
    offers,
    listId: gift.list_id || existing?.list_id || "default",
    currency: existing?.currency || facts.currency,
    purchased: Number(gift.purchased ?? existing?.purchased ?? false),
    source: source?.source || null,
    sourceId: facts.copiedSource ? null : source?.source_id || null,
    action: existing ? "gift.update" : "gift.create",
    audit: { before: existing || null, after: { ...gift, target } },
  };
}
export const giftFields = [
  "id",
  "list_id",
  "url",
  "title",
  "description",
  "image",
  "target",
  "quantity",
  "currency",
  "category_id",
  "priority",
  "visibility",
  "purchased",
  "closed",
  "kind",
  "budget_mode",
  "size",
  "color",
  "model",
  "variant_note",
  "variant_policy",
  "time_hint",
  "original_url",
  "source",
  "source_id",
  "position",
  "suggested_price",
  "suggested_currency",
  "extracted_at",
  "created_at",
  "updated_at",
] as const;
export type GiftRecord = Record<(typeof giftFields)[number], unknown> & {
  offers: GiftCommand["offers"];
  surprise_hidden?: boolean;
};
export function giftRecord(
  row: Record<string, unknown>,
  offers: GiftCommand["offers"],
  access: Access,
  surprise: number,
): GiftRecord {
  const result = Object.fromEntries(
    giftFields.map((k) => [
      k,
      row[k] instanceof Date ? row[k].toISOString() : row[k],
    ]),
  ) as GiftRecord;
  result.priority = row.priority_id ?? row.priority;
  result.target = row.budget_mode === "fixed" ? row.target : 0;
  result.offers = offers;
  if (
    surprise &&
    (access.recipient ?? access.owner) &&
    !access.revealSurprises &&
    (access.recipientLists === undefined ||
      access.recipientLists.includes(String(row.list_id)))
  ) {
    result.purchased = null;
    result.closed = null;
    result.surprise_hidden = true;
  }
  return result;
}
export function requireGiftEdit(
  existing: GiftSnapshot | undefined,
  surprise: number,
  access: Access,
  id?: string,
) {
  if (id && !existing) throw new AppError("Cadeau introuvable.", 404);
  if (existing)
    purchaseDecision(
      {
        list_id: existing.list_id,
        purchased: existing.purchased,
        surprise_mode: surprise,
      },
      !!existing.purchased,
      access,
    );
}
export interface GiftStore {
  saveGift(gift: GiftCommand, access: Access, id?: string): Promise<string>;
  getGift(id: string, access: Access): Promise<GiftRecord | undefined>;
}
// Owner metadata API. It does not invent reservation/funding totals or expose
// public/guest access before those domains have their own shared contracts.
export function giftService(store: GiftStore) {
  return {
    async saveGift(input: unknown, access: Access, id?: string) {
      requireCatalogOwner(access);
      return store.saveGift(
        parseGift(input),
        access,
        id === undefined ? undefined : text(64).min(1).parse(id),
      );
    },
    async getGift(id: string, access: Access) {
      requireCatalogOwner(access);
      return store.getGift(text(64).min(1).parse(id), access);
    },
  };
}
