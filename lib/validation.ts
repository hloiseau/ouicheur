import { z } from "zod";
import { interpolate } from "./i18n.ts";

export class AppError extends Error {
  status: number;
  key: string;
  values: (string | number)[];
  constructor(message: string, status = 400, values: (string | number)[] = []) {
    super(interpolate(message, values));
    this.status = status;
    this.key = message;
    this.values = values;
  }
}
export const currencies = ["EUR", "USD", "GBP", "CAD", "CHF", "AUD"] as const;
export const currencySchema = z.enum(currencies);
export const text = (max: number) => z.string().trim().max(max);
export function money(value: string, allowZero = false): number {
  const clean = value.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean))
    throw new AppError(
      "Montant invalide : utilisez au maximum deux décimales.",
    );
  const [whole, decimals = ""] = clean.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (cents < (allowZero ? 0 : 1) || cents > 100000000)
    throw new AppError("Montant hors limites (maximum 1 000 000).");
  return cents;
}
export const amountSchema = z.string().transform((v) => money(v));
export function webUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("URL invalide.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    value.length > 2048
  )
    throw new AppError("Utilisez un lien HTTP(S) sans identifiants.");
  return url;
}
export function canonicalUrl(value: string) {
  const url = webUrl(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|ref$|tag$|fbclid$|gclid$)/i.test(key))
      url.searchParams.delete(key);
  if (/(^|\.)amazon\.[a-z.]+$/i.test(url.hostname)) {
    const asin = url.pathname.match(
      /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i,
    )?.[1];
    if (asin) {
      url.pathname = `/dp/${asin.toUpperCase()}`;
      url.search = "";
    }
  }
  return url.toString();
}
export const urlSchema = text(2048).transform((v) => canonicalUrl(v));
export const imageSchema = text(200).refine(
  (v) => !v || /^\/media\/[a-f0-9]{64}\.webp$/.test(v),
  "Importez d’abord cette image dans le stockage local.",
);
export function paypalName(value: string) {
  if (!value) return "";
  const name = value
    .trim()
    .replace(/^https:\/\/(?:www\.)?paypal\.me\//i, "")
    .replace(/\/$/, "");
  if (!/^[a-zA-Z0-9]{3,30}$/.test(name))
    throw new AppError(
      "Lien PayPal.Me invalide : indiquez le nom ou https://paypal.me/nom.",
    );
  return name;
}
export function paypalLink(name: string, amount: number, currency: string) {
  if (!name)
    throw new AppError("Le propriétaire n’a pas encore configuré PayPal.Me.");
  return `https://paypal.me/${paypalName(name)}/${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}${currencySchema.parse(currency)}`;
}
export const offerSchema = z.object({
  id: z.uuid().optional(),
  url: urlSchema,
  condition: z.enum(["new", "used", "refurbished", "handmade"]).default("new"),
  note: text(500).default(""),
  price: z.number().int().min(0).max(100000000).nullable().default(null),
  currency: currencySchema.default("EUR"),
  shipping: z.number().int().min(0).max(100000000).nullable().default(null),
  availability: z
    .enum(["unknown", "available", "unavailable"])
    .default("unknown"),
  checked_at: z.iso.datetime().nullable().default(null),
});
export const wishDetailsSchema = z.object({
  kind: z
    .enum(["product", "experience", "service", "handmade", "other"])
    .default("product"),
  budget_mode: z.enum(["fixed", "unknown", "free"]).default("fixed"),
  size: text(100).default(""),
  color: text(100).default(""),
  model: text(160).default(""),
  variant_note: text(500).default(""),
  variant_policy: z.enum(["exact", "flexible"]).default("exact"),
  time_hint: text(300).default(""),
  original_url: text(2048).default(""),
  offers: z.array(offerSchema).max(10).default([]),
});
export const giftSchema = z.object({
  ...wishDetailsSchema.shape,
  list_id: text(64).min(1).optional(),
  url: z.union([z.literal(""), urlSchema]).default(""),
  title: text(160).min(1),
  description: text(2000).default(""),
  image: imageSchema.default(""),
  target: z
    .string()
    .default("")
    .transform((v) => (v.trim() ? money(v, true) : 0)),
  quantity: z.number().int().min(1).max(999).default(1),
  allow_duplicate: z.boolean().default(false),
  category_id: text(64).nullable().default(null),
  priority: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
  visibility: z.preprocess(
    // Accept old saved forms while removing drafts from the current model.
    (value) => (value === "draft" ? "visible" : value),
    z.enum(["visible", "archived"]).default("visible"),
  ),
  purchased: z.boolean().optional(),
  closed: z.boolean().default(false),
  suggested_price: z
    .number()
    .int()
    .min(1)
    .max(100000000)
    .nullable()
    .default(null),
  suggested_currency: text(3)
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .default(null),
  extracted_at: z.iso.datetime().nullable().default(null),
});
export const dateNow = () => new Date().toISOString();
