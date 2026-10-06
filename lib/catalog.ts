import { z } from "zod";
import { validTimezone } from "./event-dates.ts";
import { AppError, text } from "./validation.ts";
import type { Access } from "./lists.ts";

// Persistence-independent rules. The SQLite compatibility facade and the
// asynchronous stores execute these same decisions inside their transaction.
export const listCommandSchema = z.object({
  id: text(64).optional(),
  name: text(80).min(1),
  description: text(1000).default(""),
  visibility: z.enum(["public", "unlisted", "private"]),
  archived: z.boolean().default(false),
  surprise_mode: z.boolean().optional(),
  suggestions_enabled: z.boolean().optional(),
  event_annual: z.boolean().optional(),
  event_timezone: text(80)
    .refine(validTimezone, "Fuseau horaire invalide.")
    .optional(),
  leap_day: z.enum(["feb28", "skip"]).optional(),
  confirm_reveal: z.boolean().default(false),
  event_date: z.union([z.literal(""), z.iso.date()]).default(""),
});
export type ListCommand = z.infer<typeof listCommandSchema>;
export type CatalogList = {
  id: string;
  name: string;
  description: string;
  visibility: ListCommand["visibility"];
  archived: number;
  event_date: string;
  surprise_mode: number;
  suggestions_enabled: number;
  event_annual: number;
  event_timezone: string;
  leap_day: string;
};
export function listDecision(value: ListCommand, existing?: CatalogList) {
  if (value.id && !existing) throw new AppError("Liste introuvable.", 404);
  const surprise = value.surprise_mode ?? !!existing?.surprise_mode;
  if (existing?.surprise_mode && !surprise && !value.confirm_reveal)
    throw new AppError("Confirmez la désactivation du mode surprise.", 409);
  return {
    fields: {
      name: value.name,
      description: value.description,
      visibility: value.visibility,
      archived: Number(value.archived),
      event_date: value.event_date,
      surprise_mode: Number(surprise),
      suggestions_enabled: Number(
        value.suggestions_enabled ?? !!existing?.suggestions_enabled,
      ),
      event_annual: Number(value.event_annual ?? !!existing?.event_annual),
      event_timezone:
        value.event_timezone ?? existing?.event_timezone ?? "Europe/Paris",
      leap_day: value.leap_day ?? existing?.leap_day ?? "feb28",
    },
    revokeShares:
      !!existing &&
      (existing.visibility !== value.visibility || value.archived),
    resetReveals: surprise && !existing?.surprise_mode,
    audit: {
      visibility: value.visibility,
      archived: value.archived,
      surprise_mode: surprise,
    },
  };
}
export const purchaseCommandSchema = z
  .object({ purchased: z.boolean() })
  .strict();
export type PurchaseSnapshot = {
  list_id: string;
  purchased: number;
  surprise_mode: number;
};
export function requireCatalogOwner(access: Access) {
  if (!access.owner)
    throw new AppError("Connexion administrateur requise.", 401);
}
export function purchaseDecision(
  gift: PurchaseSnapshot | undefined,
  purchased: boolean,
  access: Access,
) {
  requireCatalogOwner(access);
  if (!gift) throw new AppError("Cadeau introuvable.", 404);
  if (
    gift.surprise_mode &&
    (access.recipient ?? access.owner) &&
    !access.revealSurprises &&
    (access.recipientLists === undefined ||
      access.recipientLists.includes(gift.list_id))
  )
    throw new AppError(
      "Révélez les surprises pour cette session avant d’ouvrir ces informations ou de modifier cette envie.",
      409,
    );
  return {
    changed: !!gift.purchased !== purchased,
    audit: { before: !!gift.purchased, after: purchased },
  };
}

// A store is already bound to a verified instance/tenant by its server-side
// caller. Access is trusted authorization context, never an HTTP request body.
export interface CatalogStore {
  saveList(command: ListCommand): Promise<string>;
  getList(id: string): Promise<CatalogList | undefined>;
  setGiftPurchased(
    id: string,
    purchased: boolean,
    access: Access,
  ): Promise<{ purchased: boolean }>;
}
export function catalogService(store: CatalogStore) {
  return {
    async saveList(input: unknown, access: Access) {
      requireCatalogOwner(access);
      return store.saveList(listCommandSchema.parse(input));
    },
    async getList(id: string, access: Access) {
      requireCatalogOwner(access);
      return store.getList(text(64).min(1).parse(id));
    },
    async setGiftPurchased(id: string, input: unknown, access: Access) {
      requireCatalogOwner(access);
      const { purchased } = purchaseCommandSchema.parse(input);
      return store.setGiftPurchased(
        text(64).min(1).parse(id),
        purchased,
        access,
      );
    },
  };
}
