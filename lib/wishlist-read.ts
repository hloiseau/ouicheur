import { z } from "zod";
import { AppError } from "./validation.ts";
import type { Access } from "./lists.ts";
export const wishlistQuerySchema = z
  .object({
    mode: z.enum(["public", "owner", "team"]).default("public"),
    list: z.string().max(64).default(""),
    search: z.string().trim().max(300).default(""),
    category: z.string().max(64).default(""),
    priority: z.string().regex(/^\d*$/).max(16).default(""),
    view: z.enum(["all", "favorites", "completed", "archived"]).default("all"),
    currency: z
      .union([z.literal(""), z.string().regex(/^[A-Z]{3}$/)])
      .default(""),
    basis: z.enum(["unit", "total", "remaining"]).default("unit"),
    minimum: z.coerce.number().int().min(0).max(100000000).optional(),
    maximum: z.coerce.number().int().min(0).max(100000000).optional(),
    available: z.enum(["0", "1"]).default("0"),
    sort: z
      .enum([
        "manual",
        "priority",
        "price",
        "price-desc",
        "unit-price",
        "unit-price-desc",
        "remaining",
        "progress",
        "title",
      ])
      .default("priority"),
    locale: z.enum(["fr", "en"]).default("en"),
    cursor: z.string().max(2048).default(""),
    limit: z.coerce.number().int().min(1).max(60).default(24),
  })
  .strict();
export type WishlistQuery = z.input<typeof wishlistQuerySchema>;

export function wishlistAccess(input: unknown, original: Access) {
  const query = wishlistQuerySchema.parse(input);
  if (query.mode === "owner" && !original.owner)
    throw new AppError("Connexion administrateur requise.", 401);
  if (query.mode === "team" && !original.memberId)
    throw new AppError("Connexion coorganisateur requise.", 401);
  return {
    query,
    admin: query.mode !== "public",
    access: query.mode === "public" ? { ...original, owner: false } : original,
  };
}
export function normalizeWishlistSearch(text: string, locale: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase(locale);
}
