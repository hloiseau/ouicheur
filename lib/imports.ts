import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import * as cheerio from "cheerio";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { atomic, audit } from "./db";
import { fetchHtml } from "./fetch-browser";
import { MAX_HTML_BYTES } from "./fetch-safe";
import {
  structuredProducts,
  productPrice,
  productImage,
  amazonCurrency,
  extractMetadata,
} from "./metadata";
import {
  AppError,
  canonicalUrl,
  dateNow,
  giftSchema,
  imageSchema,
  money,
  webUrl,
} from "./validation";
import { saveGiftInTransaction } from "./gifts";
import { downloadImage } from "./images";

export type ImportItem = {
  source: string;
  source_id: string;
  url: string;
  title: string;
  description: string;
  image_url: string;
  image?: string;
  image_error?: string;
  metadata_checked?: boolean;
  metadata_error?: string;
  price: string;
  currency: string;
  conversion?: { price: string; currency: string; date: string };
  conversion_error?: string;
  errors: string[];
  duplicate_id?: string;
  duplicate_currency?: string;
  duplicate_index?: number;
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
  const selector = "li[data-itemid],li[data-id],li.g-item-sortable,[data-asin]";
  $(selector).each((_, element) => {
    const el = $(element);
    if (el.parents(selector).length) return;
    const link = el.find("a[href*='/dp/'],a[href*='/gp/product/']").first();
    const href = link.attr("href");
    let productUrl = "";
    try {
      if (href) productUrl = new URL(href, url).toString();
    } catch {
      /* Keep the row editable. */
    }
    const asin = productUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1];
    const id =
      asin || el.attr("data-itemid") || el.attr("data-id") || productUrl;
    if (!id) return;
    const price =
      el.find(".a-price .a-offscreen").first().text() ||
      el.find("[id^='itemPrice_']").text();
    const amount = productPrice(price);
    rows.push(
      item(
        {
          url: productUrl,
          title:
            link.attr("title") ||
            link.text().trim() ||
            el.find("h2,h3").first().text().trim(),
          image_url: productImage(el.find("img").first().attr("src"), url),
          price: amount === null ? "" : (amount / 100).toFixed(2),
          currency: price ? amazonCurrency(url, price) : "",
        },
        "amazon",
        id,
      ),
    );
  });
  return [...new Map(rows.map((row) => [row.source_id, row])).values()].slice(
    0,
    200,
  );
}
export function parseThrone(html: string, url: string): ImportItem[] {
  // Read only data embedded in the public page; never execute remote scripts.
  let products = structuredProducts(html);
  try {
    const $ = cheerio.load(html);
    const data = JSON.parse($("script#__NEXT_DATA__").text());
    const rows = data?.props?.pageProps?.ssrWishlistItems;
    if (Array.isArray(rows)) {
      products = rows
        .filter(
          (p) =>
            p &&
            typeof p === "object" &&
            !Array.isArray(p) &&
            !p.isHidden &&
            !p.isSavedForLater,
        )
        .slice(0, 200)
        .map((p) => {
          let merchant = p.link;
          const partner = p.partnerStoreData;
          const variant = String(partner?.variantForeignId || "");
          try {
            const link = webUrl(String(merchant || ""));
            if (amazonCurrency(link.href))
              link.hostname = link.hostname.replace(/^amazon\./, "www.amazon.");
            // Throne sometimes keeps the first variant's URL for every choice.
            // Its merchant variant identifier, unlike the wish ID, identifies the selection.
            if (
              ["shopify", "manual-shopify"].includes(
                partner?.extraPartnerStoreData?.storeType,
              ) &&
              /^\d+$/.test(variant)
            )
              link.searchParams.set("variant", variant);
            else if (
              amazonCurrency(link.href) &&
              /^[A-Z0-9]{10}$/.test(variant)
            )
              link.pathname = `/dp/${variant}`;
            merchant = link.href;
          } catch {
            // The normal item validation reports an invalid merchant link.
          }
          return {
            productID: p.id || p.itemId,
            name: p.name,
            description: p.description,
            image: p.imgLink,
            url: merchant,
            offers: {
              url: merchant,
            },
          };
        });
    }
  } catch {
    // Older public pages may contain only JSON-LD.
  }
  return products.map((p, index) => {
    const rawOffer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
    const offer = (
      rawOffer && typeof rawOffer === "object" ? rawOffer : {}
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
        image_url: productImage(p.image, url),
        // Only the merchant supplies the product price, never Throne's amount.
        price: "",
        currency: "",
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
        ? JSON.parse(content.replace(/^\uFEFF/, ""))
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
  if (!rows.length) throw new AppError("Le fichier d’import est vide.");
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
    throw new AppError("Indiquez un lien de liste Amazon public ou partagé.");
  if (
    source === "throne" &&
    (!/^(www\.)?throne\.com$/.test(host) ||
      !/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))
  )
    throw new AppError("Indiquez le lien public de votre profil Throne.");
  if (source === "throne")
    return `https://throne.com${url.pathname.replace(/\/$/, "")}`;
  return url.toString();
}
export function createImport(
  db: DatabaseSync,
  source: "amazon" | "throne" | "throne-html" | "csv" | "json",
  content: string,
) {
  const id = randomUUID();
  if (source === "csv" || source === "json" || source === "throne-html") {
    let sourceUrl = "";
    if (source === "throne-html") {
      const $ = cheerio.load(content);
      const canonical = $("link[rel='canonical']").attr("href");
      if (canonical) sourceUrl = importUrl("throne", canonical);
    }
    const items =
      source === "throne-html"
        ? parseThrone(content, sourceUrl || "https://throne.com/")
        : parseGeneric(content, source);
    if (source === "throne-html" && !items.length)
      throw new AppError(
        "Aucun produit dans cette page Throne. Ouvrez le profil public, attendez l’affichage des cadeaux et enregistrez la page au format HTML (Ctrl+S).",
      );
    db.prepare(
      "INSERT INTO imports(id,source,source_url,state,items,created_at) VALUES (?,?,?,'preview',?,?)",
    ).run(id, source, sourceUrl, JSON.stringify(items), dateNow());
  } else
    db.prepare(
      "INSERT INTO imports(id,source,source_url,state,created_at) VALUES (?,?,?,'queued',?)",
    ).run(id, source, importUrl(source, content), dateNow());
  return id;
}
export async function fetchImportPage(
  source: "amazon" | "throne",
  url: string,
) {
  const deadline = Date.now() + 15000;
  const first = await fetchHtml(
    source === "throne" && new URL(url).pathname !== "/"
      ? importUrl(source, url)
      : url,
    deadline,
  );
  if (source !== "amazon") return first;

  const origin = new URL(first.url).origin;
  const chunks: Buffer[] = [];
  const seen = new Set<string>([first.url]);
  const items = new Set<string>();
  let page = first;
  let bytes = 0;
  const invalid = () =>
    new AppError(
      "Pagination Amazon invalide ou interrompue. Aucun aperçu partiel n’a été enregistré.",
    );
  while (true) {
    bytes += page.body.length;
    if (bytes > MAX_HTML_BYTES)
      throw new AppError("Fichier distant trop volumineux.");
    const html = page.body.toString("utf8");
    const rows = parseAmazon(html, page.url);
    if (new URL(page.url).origin !== origin || (chunks.length && !rows.length))
      throw invalid();
    for (const row of rows) items.add(row.source_id);
    chunks.push(page.body);
    const $ = cheerio.load(html);
    const scroll = $("script[data-a-state]")
      .toArray()
      .find((element) => {
        try {
          return (
            JSON.parse($(element).attr("data-a-state")!).key === "scrollState"
          );
        } catch {
          return false;
        }
      });
    let state;
    try {
      state = scroll ? JSON.parse($(scroll).text()) : null;
    } catch {
      throw invalid();
    }
    // Amazon keeps showMoreUrl on the final page, but clears lastEvaluatedKey.
    if (!state?.lastEvaluatedKey) {
      if (items.size > 200)
        throw new AppError(
          "La liste Amazon dépasse la limite de 200 éléments ou de 20 pages.",
        );
      return { ...first, body: Buffer.concat(chunks) };
    }
    if (items.size >= 200 || chunks.length >= 20)
      throw new AppError(
        "La liste Amazon dépasse la limite de 200 éléments ou de 20 pages.",
      );
    let next: URL;
    try {
      if (typeof state.showMoreUrl !== "string") throw invalid();
      next = webUrl(new URL(state.showMoreUrl, page.url).toString());
    } catch {
      throw invalid();
    }
    if (
      next.origin !== origin ||
      next.pathname !== "/hz/wishlist/slv/items" ||
      seen.has(next.toString())
    )
      throw invalid();
    seen.add(next.toString());
    // Follow only the public continuation provided by this list, within one deadline.
    page = await fetchHtml(next.toString(), deadline);
  }
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
    const page = await fetchImportPage(
      job.source === "amazon" ? "amazon" : "throne",
      String(job.source_url),
    );
    const html = page.body.toString("utf8");
    const items =
      job.source === "amazon"
        ? parseAmazon(html, page.url)
        : parseThrone(html, page.url);
    if (
      !items.length &&
      /captcha|robot check|validateCaptcha|cf-chl-/i.test(html)
    )
      throw new AppError(
        "La source présente une protection anti-robot. Import natif bloqué ; utilisez votre export CSV/JSON.",
      );
    if (!items.length)
      throw new AppError(
        "Aucun produit exploitable dans le HTML public. Liste vide, privée ou chargée par JavaScript ; import natif non vérifié. Utilisez votre export CSV/JSON.",
      );
    db.prepare("UPDATE imports SET items=?,error='' WHERE id=?").run(
      JSON.stringify(items),
      id,
    );
    await prepareImport(db, id);
    db.prepare("UPDATE imports SET state='preview' WHERE id=?").run(id);
  } catch (error) {
    db.prepare("UPDATE imports SET state='failed',error=? WHERE id=?").run(
      error instanceof AppError
        ? JSON.stringify([error.key, ...error.values])
        : "Accès à la source impossible (réseau, DNS ou délai). Aucun contournement effectué.",
      id,
    );
  }
}
// Both wishlists are enriched from the merchant's selected product.
// At most four products are prepared at once; a failed merchant keeps its row editable.
// Renew the existing lease so a large list cannot start a duplicate worker.
export async function prepareImport(db: DatabaseSync, id: string) {
  const job = db.prepare("SELECT items FROM imports WHERE id=?").get(id);
  if (!job) throw new AppError("Import introuvable.", 404);
  const items: ImportItem[] = JSON.parse(String(job.items));
  const pending = items.filter(
    (item) =>
      (["amazon", "throne"].includes(item.source) && !item.metadata_checked) ||
      (item.image_url && !item.image && !item.image_error),
  );
  const pages = new Map<string, ReturnType<typeof extractMetadata>>();
  for (let offset = 0; offset < pending.length; offset += 4) {
    db.prepare("UPDATE imports SET lease_until=? WHERE id=?").run(
      Date.now() + 60000,
      id,
    );
    await Promise.all(
      pending.slice(offset, offset + 4).map(async (item) => {
        if (
          ["amazon", "throne"].includes(item.source) &&
          !item.metadata_checked
        ) {
          if (item.source === "throne") {
            item.price = "";
            item.currency = "";
            delete item.conversion;
          }
          try {
            let page = pages.get(item.url);
            if (!page) {
              page = extractMetadata(item.url);
              pages.set(item.url, page);
            }
            const metadata = await page;
            item.url = metadata.url;
            if (metadata.price !== null && metadata.currency) {
              item.price = (metadata.price / 100).toFixed(2);
              item.currency = metadata.currency;
            }
            if (metadata.image_url && metadata.image_url !== item.image_url) {
              item.image_url = metadata.image_url;
              delete item.image;
              delete item.image_error;
            }
          } catch {
            item.metadata_error =
              "Les informations du produit n’ont pas pu être récupérées chez le marchand.";
          }
          item.metadata_checked = true;
          item.errors = item.errors.filter(
            (error) => error !== "Objectif à renseigner.",
          );
          if (!item.price) item.errors.push("Objectif à renseigner.");
        }
        if (!item.image_url || item.image || item.image_error) return;
        try {
          item.image = await downloadImage(item.image_url);
        } catch {
          item.image_error =
            "L’image n’a pas pu être récupérée automatiquement.";
        }
      }),
    );
    db.prepare("UPDATE imports SET items=? WHERE id=?").run(
      JSON.stringify(items),
      id,
    );
  }
  const owner = db.prepare("SELECT currency FROM owner WHERE id=1").get()!;
  const conversions = items.flatMap((item) => {
    const duplicate = db
      .prepare(
        "SELECT currency FROM gifts WHERE url=? OR (source=? AND source_id=?)",
      )
      .get(item.url, item.source, item.source_id);
    const currency = String(duplicate?.currency || owner.currency);
    return item.price && item.currency && item.currency !== currency
      ? [{ item, currency }]
      : [];
  });
  if (conversions.length) {
    try {
      const response = await fetch(
        "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
        { signal: AbortSignal.timeout(10000), redirect: "error" },
      );
      if (!response.ok) throw new Error("Exchange rates unavailable");
      const $ = cheerio.load(await response.text(), { xmlMode: true });
      const date = $("Cube[time]").attr("time") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error("Invalid rate date");
      const rates = new Map<string, number>([["EUR", 1]]);
      $("Cube[currency][rate]").each((_, el) => {
        const rate = Number($(el).attr("rate"));
        if (Number.isFinite(rate) && rate > 0)
          rates.set($(el).attr("currency")!, rate);
      });
      for (const { item, currency } of conversions) {
        const original = item.conversion || item;
        const from = rates.get(original.currency);
        const to = rates.get(currency);
        if (!from || !to) {
          item.conversion_error = "Conversion indisponible pour cette devise.";
          continue;
        }
        const price = (
          Math.round((money(original.price) * to) / from) / 100
        ).toFixed(2);
        money(price);
        item.conversion = {
          price: original.price,
          currency: original.currency,
          date,
        };
        item.price = price;
        item.currency = currency;
        delete item.conversion_error;
      }
    } catch {
      for (const { item, currency } of conversions)
        if (item.currency !== currency)
          item.conversion_error =
            "Conversion temporairement indisponible. Réessayez l’import.";
    }
    db.prepare("UPDATE imports SET items=? WHERE id=?").run(
      JSON.stringify(items),
      id,
    );
  }
}
export function getImport(db: DatabaseSync, id: string) {
  const job = db.prepare("SELECT * FROM imports WHERE id=?").get(id);
  if (!job) throw new AppError("Import introuvable.", 404);
  const items: ImportItem[] = JSON.parse(String(job.items));
  const seenUrls = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    if (item.url) {
      const previous = seenUrls.get(item.url);
      if (previous !== undefined) item.duplicate_index = previous;
      else seenUrls.set(item.url, index);
    }
    const duplicate = db
      .prepare(
        "SELECT id,currency FROM gifts WHERE url=? OR (source=? AND source_id=?)",
      )
      .get(item.url, item.source, item.source_id);
    if (duplicate) {
      item.duplicate_id = String(duplicate.id);
      item.duplicate_currency = String(duplicate.currency);
    }
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
      gift: giftSchema.extend({ image: imageSchema.optional() }),
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
      const duplicates = db
        .prepare(
          "SELECT id FROM gifts WHERE url=? OR (source=? AND source_id=?)",
        )
        .all(choice.gift.url, row.source, row.source_id);
      const duplicate = duplicates[0];
      if (choice.replace && duplicates.length > 1)
        throw new AppError(
          "Plusieurs envies correspondent. Modifiez l’envie souhaitée dans Mes envies ou autorisez un doublon.",
        );
      if (choice.replace && choice.gift.allow_duplicate)
        throw new AppError(
          "Choisissez de remplacer ou de créer un doublon, pas les deux.",
        );
      if (duplicate && !choice.replace && !choice.gift.allow_duplicate)
        throw new AppError(
          "Doublon : « {0} ». Choisissez de remplacer, d’autoriser un doublon ou décochez cet élément.",
          409,
          [choice.gift.title],
        );
      if (duplicate && choice.replace && ids.includes(String(duplicate.id)))
        throw new AppError(
          "Un même cadeau ne peut être remplacé qu’une fois par import.",
        );
      ids.push(
        saveGiftInTransaction(
          db,
          { ...choice.gift, image: choice.gift.image ?? row.image ?? "" },
          duplicate && choice.replace ? String(duplicate.id) : undefined,
          row,
        ),
      );
    }
    db.prepare("UPDATE imports SET state='done' WHERE id=?").run(id);
    audit(db, "import.commit", id, { gifts: ids });
    return ids;
  });
}
