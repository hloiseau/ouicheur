import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import * as cheerio from "cheerio";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { atomic, audit } from "./db";
import { fetchSafe } from "./fetch-safe";
import { structuredProducts } from "./metadata";
import {
  AppError,
  canonicalUrl,
  dateNow,
  giftSchema,
  money,
  webUrl,
} from "./validation";
import { saveGiftInTransaction } from "./gifts";

export type ImportItem = {
  source: string;
  source_id: string;
  url: string;
  title: string;
  description: string;
  image_url: string;
  price: string;
  currency: string;
  errors: string[];
  duplicate_id?: string;
};
function item(
  input: Record<string, unknown>,
  source: string,
  id: string,
): ImportItem {
  const result: ImportItem = {
    source,
    source_id: id,
    url: "",
    title: String(input.title || "").slice(0, 160),
    description: String(input.description || "").slice(0, 2000),
    image_url: String(input.image_url || "").slice(0, 2048),
    price: String(input.price || ""),
    currency: String(input.currency || "").toUpperCase(),
    errors: [],
  };
  try {
    result.url = canonicalUrl(String(input.url || ""));
  } catch {
    result.errors.push(
      "URL marchande manquante ou invalide : correction requise.",
    );
  }
  if (!result.title) result.errors.push("Titre manquant.");
  try {
    money(result.price);
  } catch {
    result.price = "";
    result.errors.push("Objectif à renseigner.");
  }
  if (result.currency && !/^[A-Z]{3}$/.test(result.currency)) {
    result.currency = "";
    result.errors.push("Devise à vérifier.");
  }
  return result;
}
export function parseAmazon(html: string, url: string): ImportItem[] {
  const $ = cheerio.load(html);
  const rows: ImportItem[] = [];
  $("li[data-itemid],li[data-id],li.g-item-sortable,[data-asin]").each(
    (_, element) => {
      const el = $(element);
      const link = el.find("a[href*='/dp/'],a[href*='/gp/product/']").first();
      const href = link.attr("href");
      const productUrl = href ? new URL(href, url).toString() : "";
      const asin = productUrl.match(
        /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i,
      )?.[1];
      const id =
        asin || el.attr("data-itemid") || el.attr("data-id") || productUrl;
      if (!id) return;
      const price =
        el.find(".a-price .a-offscreen").first().text() ||
        el.find("[id^='itemPrice_']").text();
      rows.push(
        item(
          {
            url: productUrl,
            title:
              link.attr("title") ||
              link.text().trim() ||
              el.find("h2,h3").first().text().trim(),
            image_url: el.find("img").first().attr("src"),
            price: price
              .replace(/[^\d.,]/g, "")
              .replace(/,(?=\d{3}(?:\D|$))/g, ""),
            currency: price.includes("€")
              ? "EUR"
              : price.includes("£")
                ? "GBP"
                : "",
          },
          "amazon",
          id,
        ),
      );
    },
  );
  return [...new Map(rows.map((row) => [row.source_id, row])).values()].slice(
    0,
    200,
  );
}
export function parseThrone(html: string, url: string): ImportItem[] {
  // Public HTML/JSON-LD only. No undocumented API, session, or anti-bot bypass.
  return structuredProducts(html).map((p, index) => {
    const offer = (
      Array.isArray(p.offers) ? p.offers[0] : p.offers || {}
    ) as Record<string, unknown>;
    const merchant = String(offer.url || p.url || "");
    let usable = merchant;
    try {
      if (/(^|\.)throne\.com$/.test(new URL(merchant, url).hostname))
        usable = "";
    } catch {
      usable = "";
    }
    return item(
      {
        url: usable,
        title: p.name,
        description: p.description,
        image_url: Array.isArray(p.image) ? p.image[0] : p.image,
        price: offer.price,
        currency: offer.priceCurrency,
      },
      "throne",
      String(p.productID || p.sku || p["@id"] || p.url || `${url}#${index}`),
    );
  });
}
export function parseGeneric(content: string, format: "csv" | "json") {
  let rows: unknown;
  try {
    rows =
      format === "json"
        ? JSON.parse(content)
        : parse(content.replace(/^\uFEFF/, ""), {
            columns: true,
            skip_empty_lines: true,
            bom: true,
            max_record_size: 20000,
          });
  } catch {
    throw new AppError(
      "Fichier invalide. Vérifiez le format de l’exemple CSV ou JSON.",
    );
  }
  if (!Array.isArray(rows) || rows.length > 200)
    throw new AppError("L’import attend un tableau de 200 éléments maximum.");
  return rows.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return item({}, "generic", `missing-${randomUUID()}`);
    const row = value as Record<string, unknown>;
    return item(
      row,
      "generic",
      String(row.source_id || row.url || `missing-${randomUUID()}`).slice(
        0,
        2048,
      ),
    );
  });
}
export function importUrl(source: "amazon" | "throne", value: string) {
  const url = webUrl(value);
  const host = url.hostname.toLowerCase();
  if (
    source === "amazon" &&
    (!/^(?:www\.)?amazon\.(fr|com|co\.uk|de|es|it|ca|com\.au|co\.jp)$/.test(
      host,
    ) ||
      !/^\/(?:hz\/wishlist\/ls|gp\/registry\/wishlist)\/[A-Z0-9]+/i.test(
        url.pathname,
      ))
  )
    throw new AppError(
      "Indiquez un lien de wishlist Amazon public ou partagé.",
    );
  if (
    source === "throne" &&
    (!/^(www\.)?throne\.com$/.test(host) ||
      !/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))
  )
    throw new AppError("Indiquez le lien public de votre profil Throne.");
  return url.toString();
}
export function createImport(
  db: DatabaseSync,
  source: "amazon" | "throne" | "csv" | "json",
  content: string,
) {
  const id = randomUUID();
  if (source === "csv" || source === "json") {
    const items = parseGeneric(content, source);
    db.prepare(
      "INSERT INTO imports(id,source,state,items,created_at) VALUES (?,?,'preview',?,?)",
    ).run(id, source, JSON.stringify(items), dateNow());
  } else
    db.prepare(
      "INSERT INTO imports(id,source,source_url,state,created_at) VALUES (?,?,?,'queued',?)",
    ).run(id, source, importUrl(source, content), dateNow());
  return id;
}
export async function runImport(db: DatabaseSync, id: string) {
  const job = atomic(db, () => {
    const row = db.prepare("SELECT * FROM imports WHERE id=?").get(id);
    if (!row) throw new AppError("Import introuvable.", 404);
    if (row.state === "running" && Number(row.lease_until) > Date.now())
      return null;
    if (!["queued", "running"].includes(String(row.state))) return null;
    if (Number(row.attempts) >= 3) {
      db.prepare(
        "UPDATE imports SET state='failed',error='Trois tentatives atteintes.' WHERE id=?",
      ).run(id);
      return null;
    }
    db.prepare(
      "UPDATE imports SET state='running',attempts=attempts+1,lease_until=? WHERE id=?",
    ).run(Date.now() + 30000, id);
    return row;
  });
  if (!job) return;
  try {
    const page = await fetchSafe(String(job.source_url));
    const html = page.body.toString("utf8");
    if (/captcha|robot check|validateCaptcha|cf-chl-/i.test(html))
      throw new AppError(
        "La source présente une protection anti-robot. Import natif bloqué ; utilisez votre export CSV/JSON.",
      );
    const items =
      job.source === "amazon"
        ? parseAmazon(html, page.url)
        : parseThrone(html, page.url);
    if (!items.length)
      throw new AppError(
        "Aucun produit exploitable dans le HTML public. Liste vide, privée ou chargée par JavaScript ; import natif non vérifié. Utilisez votre export CSV/JSON.",
      );
    db.prepare(
      "UPDATE imports SET state='preview',items=?,error='' WHERE id=?",
    ).run(JSON.stringify(items), id);
  } catch (error) {
    db.prepare("UPDATE imports SET state='failed',error=? WHERE id=?").run(
      error instanceof AppError
        ? error.message
        : "Accès à la source impossible (réseau, DNS ou délai). Aucun contournement effectué.",
      id,
    );
  }
}
export function getImport(db: DatabaseSync, id: string) {
  const job = db.prepare("SELECT * FROM imports WHERE id=?").get(id);
  if (!job) throw new AppError("Import introuvable.", 404);
  const items: ImportItem[] = JSON.parse(String(job.items));
  for (const item of items) {
    const duplicate = db
      .prepare("SELECT id FROM gifts WHERE url=? OR (source=? AND source_id=?)")
      .get(item.url, item.source, item.source_id);
    if (duplicate) item.duplicate_id = String(duplicate.id);
  }
  return {
    id: String(job.id),
    source: String(job.source),
    state: String(job.state),
    source_url: String(job.source_url),
    attempts: Number(job.attempts),
    error: String(job.error),
    created_at: String(job.created_at),
    items,
  };
}
const selectionSchema = z
  .array(
    z.object({
      index: z.number().int().min(0).max(199),
      replace: z.boolean().default(false),
      gift: giftSchema,
    }),
  )
  .min(1)
  .max(200);
export function commitImport(db: DatabaseSync, id: string, input: unknown) {
  const selection = selectionSchema.parse(input);
  return atomic(db, () => {
    const job = getImport(db, id);
    if (job.state !== "preview")
      throw new AppError(
        "Cet aperçu est déjà enregistré ou indisponible.",
        409,
      );
    const seen = new Set<number>();
    const ids: string[] = [];
    for (const choice of selection) {
      const row = job.items[choice.index];
      if (!row || seen.has(choice.index))
        throw new AppError("Sélection invalide.");
      seen.add(choice.index);
      const duplicate = db
        .prepare(
          "SELECT id FROM gifts WHERE url=? OR (source=? AND source_id=?)",
        )
        .get(choice.gift.url, row.source, row.source_id);
      if (duplicate && !choice.replace)
        throw new AppError(
          `Doublon : « ${choice.gift.title} ». Choisissez explicitement de remplacer ou décochez cet élément.`,
          409,
        );
      ids.push(
        saveGiftInTransaction(
          db,
          choice.gift,
          duplicate ? String(duplicate.id) : undefined,
          row,
        ),
      );
    }
    db.prepare("UPDATE imports SET state='done' WHERE id=?").run(id);
    audit(db, "import.commit", id, { gifts: ids });
    return ids;
  });
}
