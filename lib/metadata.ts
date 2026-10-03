import * as cheerio from "cheerio";
import { boundedWork } from "./bounded-work.ts";
import type { Element } from "domhandler";
import { fetchHtml, fetchBrowserHtml } from "./fetch-browser.ts";
import { AppError, canonicalUrl, money, webUrl } from "./validation.ts";

type JsonObject = Record<string, unknown>;
const list = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const schemaName = (value: string) =>
  value.replace(/^https?:\/\/schema\.org[\/#]|^schema:/, "");
const schemaType = (object: JsonObject, type: string) =>
  list(object["@type"]).some(
    (v) => typeof v === "string" && schemaName(v) === type,
  );

// Only read product fields and their own nested scopes, never prices from reviews
// or recommended products. Both HTML encodings feed the same Schema.org parser.
function markupProducts($: cheerio.CheerioAPI): JsonObject[] {
  let remaining = 5000;
  const read = (root: cheerio.Cheerio<Element>, depth = 0): JsonObject => {
    const result: JsonObject = {
      "@type": (root.attr("itemtype") || root.attr("typeof") || "").split(
        /\s+/,
      ),
    };
    if (depth > 12 || remaining-- <= 0) return result;
    root.find("[itemprop],[property],[rel]").each((_, element) => {
      if (remaining-- <= 0) return false;
      const field = $(element);
      if (
        field
          .parentsUntil(root)
          .filter("[itemscope],[typeof],[itemprop],[property],[rel]").length
      )
        return;
      const keys = (
        field.attr("itemprop") ||
        field.attr("property") ||
        field.attr("rel") ||
        ""
      )
        .split(/\s+/)
        .map(schemaName);
      for (const key of keys) {
        if (
          ![
            "name",
            "description",
            "url",
            "image",
            "contentUrl",
            "offers",
            "availability",
            "price",
            "priceCurrency",
            "lowPrice",
            "priceSpecification",
            "priceType",
            "billingDuration",
            "billingIncrement",
            "validForMemberTier",
            "hasVariant",
          ].includes(key)
        )
          continue;
        const nested = field.is("[itemscope],[typeof]")
          ? field
          : field.find("[itemscope],[typeof]").first();
        const value = nested.length
          ? read(nested, depth + 1)
          : (field.attr("content") ??
            field.attr("resource") ??
            field.attr("href") ??
            field.attr("src") ??
            field.text().trim());
        result[key] =
          result[key] == null ? value : [...list(result[key]), value];
      }
    });
    return result;
  };
  return $("[itemtype],[typeof]")
    .filter((_, e) =>
      ($(e).attr("itemtype") || $(e).attr("typeof") || "")
        .split(/\s+/)
        .some((v) => ["Product", "ProductGroup"].includes(schemaName(v))),
    )
    .slice(0, 200)
    .toArray()
    .map((e) => read($(e)));
}
// Merchant display prices may use grouping separators. User-entered money stays strict.
export function productPrice(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let text = String(value)
    .trim()
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/^[A-Z]{3}|[A-Z]{3}$/g, "")
    .replace(/[€£$¥]/g, "");
  if (typeof value === "string") {
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text))
      text = text.replace(/,/g, "");
    else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text))
      text = text.replace(/\./g, "");
  }
  try {
    return money(text);
  } catch {
    return null;
  }
}
export function productImage(value: unknown, base: string): string {
  for (const candidate of Array.isArray(value) ? value : [value]) {
    const raw =
      candidate && typeof candidate === "object"
        ? candidate.contentUrl || candidate.url
        : candidate;
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      return webUrl(new URL(raw, base).toString()).toString();
    } catch {
      /* Try the next image. */
    }
  }
  return "";
}
export function amazonCurrency(url: string, price = "") {
  const market = new URL(url).hostname.match(
    /(?:^|\.)amazon\.(fr|com|co\.uk|de|es|it|ca|com\.au|co\.jp)$/i,
  )?.[1];
  if (!market) return "";
  if (price.includes("€")) return "EUR";
  if (price.includes("£")) return "GBP";
  return (
    {
      fr: "EUR",
      com: "USD",
      "co.uk": "GBP",
      de: "EUR",
      es: "EUR",
      it: "EUR",
      ca: "CAD",
      "com.au": "AUD",
      "co.jp": "JPY",
    } as Record<string, string>
  )[market];
}
export function structuredProducts(html: string): JsonObject[] {
  const $ = cheerio.load(html);
  const roots: unknown[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      roots.push(JSON.parse($(element).text()));
    } catch {
      /* Invalid JSON is data, never executable code. */
    }
  });
  roots.push(...markupProducts($));
  const nodes = new Map<string, JsonObject>();
  let remaining = 5000;
  const index = (value: unknown, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 12 || remaining-- <= 0)
      return;
    if (!Array.isArray(value)) {
      const object = value as JsonObject;
      if (typeof object["@id"] === "string" && Object.keys(object).length > 1)
        nodes.set(object["@id"], { ...nodes.get(object["@id"]), ...object });
    }
    for (const child of Object.values(value).slice(0, 500))
      index(child, depth + 1);
  };
  roots.forEach((root) => index(root));
  remaining = 5000;
  const linked = (value: unknown, depth = 0): unknown => {
    if (!value || typeof value !== "object" || depth > 12 || remaining-- <= 0)
      return value;
    if (Array.isArray(value))
      return value.slice(0, 500).map((v) => linked(v, depth + 1));
    const raw = value as JsonObject;
    const object = {
      ...(typeof raw["@id"] === "string" ? nodes.get(raw["@id"]) : {}),
      ...raw,
    };
    for (const key of [
      "offers",
      "image",
      "priceSpecification",
      "hasVariant",
      "@graph",
      "itemListElement",
      "item",
      "mainEntity",
    ])
      if (object[key]) object[key] = linked(object[key], depth + 1);
    return object;
  };
  const products: JsonObject[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (
      depth > 12 ||
      products.length >= 200 ||
      !value ||
      typeof value !== "object"
    )
      return;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 500)) walk(child, depth + 1);
      return;
    }
    const object = value as JsonObject;
    if (schemaType(object, "Product")) products.push(object);
    if (object.hasVariant)
      for (const variant of list(object.hasVariant).slice(0, 200))
        if (variant && typeof variant === "object" && !Array.isArray(variant))
          walk(
            {
              name: object.name,
              description: object.description,
              image: object.image,
              ...variant,
            },
            depth + 1,
          );
    for (const key of ["@graph", "itemListElement", "item", "mainEntity"])
      if (object[key]) walk(object[key], depth + 1);
  };
  roots.forEach((root) => walk(linked(root)));
  return products;
}
function matchesUrl(candidate: unknown, url: string) {
  if (typeof candidate !== "string" || !candidate) return false;
  try {
    return (
      canonicalUrl(new URL(candidate, url).toString()) === canonicalUrl(url)
    );
  } catch {
    return false;
  }
}
function offerPrice(
  value: unknown,
  url: string,
  depth = 0,
): { price: number; currency: string; availability: string } | null {
  if (depth > 8) return null;
  const offers = list(value).filter(
    (v): v is JsonObject => !!v && typeof v === "object",
  );
  offers.sort(
    (a, b) => Number(matchesUrl(b.url, url)) - Number(matchesUrl(a.url, url)),
  );
  for (const offer of offers) {
    const price = productPrice(
      offer.price ??
        (schemaType(offer, "AggregateOffer") ? offer.lowPrice : null),
    );
    if (price != null)
      return {
        price,
        currency: String(offer.priceCurrency || ""),
        availability: String(offer.availability || ""),
      };
    const specifications = list(offer.priceSpecification).filter(
      (v): v is JsonObject => {
        if (!v || typeof v !== "object") return false;
        const spec = v as JsonObject;
        return (
          (schemaType(spec, "PriceSpecification") ||
            schemaType(spec, "UnitPriceSpecification") ||
            !spec["@type"]) &&
          !spec.priceType &&
          !spec.billingDuration &&
          !spec.billingIncrement &&
          !spec.validForMemberTier
        );
      },
    );
    const nested =
      offerPrice(offer.offers, url, depth + 1) ||
      offerPrice(specifications, url, depth + 1);
    if (nested)
      return {
        ...nested,
        currency: nested.currency || String(offer.priceCurrency || ""),
        availability: nested.availability || String(offer.availability || ""),
      };
  }
  return null;
}
export function parseMetadata(html: string, url: string) {
  const $ = cheerio.load(html);
  const meta = (name: string) =>
    $(`meta[property='${name}'],meta[name='${name}']`)
      .first()
      .attr("content")
      ?.trim() || "";
  const products = structuredProducts(html);
  const product =
    products.find((p) => {
      const offers = Array.isArray(p.offers) ? p.offers : [p.offers];
      return [
        p.url,
        p["@id"],
        ...offers.map((o) => (o && typeof o === "object" ? o.url : "")),
      ].some((candidate) => matchesUrl(candidate, url));
    }) ||
    products[0] ||
    {};
  const amazon = amazonCurrency(url);
  const amazonTitle = amazon ? $("#productTitle").text().trim() : "";
  const amazonPrice = amazon
    ? $(
        "#corePrice_feature_div .a-price:not(.a-text-price),#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price),#priceblock_ourprice,#priceblock_dealprice",
      )
        .map(
          (_, e) =>
            $(e).find(".a-offscreen").text().trim() || $(e).text().trim(),
        )
        .get()
        .find((v) => productPrice(v) != null) || ""
    : "";
  // Some localized shops leave the base currency in their metadata. The selected
  // purchase option contains the displayed amount and currency together.
  const variant = new URL(url).searchParams.get("variant");
  const option = $("select[name='id'] option")
    .filter((_, el) =>
      variant ? $(el).attr("value") === variant : $(el).is("[selected]"),
    )
    .first()
    .text()
    .trim()
    .match(/\s[-–]\s*(.+?)\s+([A-Z]{3})$/);
  const optionPrice = option ? productPrice(option[1]) : null;
  const offer =
    optionPrice !== null
      ? { price: optionPrice, currency: option![2], availability: "" }
      : offerPrice(product.offers, url);
  const title = String(
    product.name || amazonTitle || meta("og:title") || $("title").text().trim(),
  ).slice(0, 160);
  if (
    !product.name &&
    !amazonTitle &&
    (/window\._cf_chl_opt\s*=/.test(html) ||
      /^(Just a moment\.\.\.|Access denied|Attention Required!|Robot Check|Vercel Security Checkpoint)/i.test(
        title,
      ) ||
      $("form[action*='validateCaptcha'],#captchacharacters").length > 0)
  )
    throw new AppError(
      "La page marchande présente un contrôle d’accès. Réessayez plus tard.",
    );
  const description = String(
    product.description || meta("og:description") || meta("description"),
  ).slice(0, 2000);
  const mainImage = amazon ? $("#landingImage,#imgBlkFront").first() : null;
  let dynamicImages: string[] = [];
  try {
    const images = JSON.parse(mainImage?.attr("data-a-dynamic-image") || "{}");
    dynamicImages = Object.entries(images)
      .filter(
        (entry): entry is [string, number[]] =>
          Array.isArray(entry[1]) &&
          entry[1].length === 2 &&
          entry[1].every((n) => typeof n === "number" && n > 0),
      )
      .sort((a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1])
      .map(([src]) => src);
  } catch {
    // A malformed optional image set does not invalidate the product.
  }
  const image_url =
    productImage([mainImage?.attr("data-old-hires"), ...dynamicImages], url) ||
    productImage(product.image, url) ||
    productImage(
      [meta("og:image:secure_url"), meta("og:image"), mainImage?.attr("src")],
      url,
    );
  const price =
    offer?.price ??
    productPrice(
      meta("product:price:amount") || meta("og:price:amount") || amazonPrice,
    );
  const currency = String(
    offer?.currency ||
      meta("product:price:currency") ||
      meta("og:price:currency") ||
      (amazonPrice ? amazonCurrency(url, amazonPrice) : ""),
  )
    .trim()
    .toUpperCase();
  return {
    url: canonicalUrl(url),
    title,
    description,
    image_url,
    price,
    currency,
    availability: (() => {
      const raw = offer?.availability || meta("product:availability");
      return /(?:OutOfStock|SoldOut|Discontinued)$/i.test(raw)
        ? "out_of_stock"
        : /InStock$/i.test(raw)
          ? "in_stock"
          : /PreOrder|BackOrder/i.test(raw)
            ? "preorder"
            : "unknown";
    })(),
    extracted_at: new Date().toISOString(),
  };
}
const extraction = boundedWork(2, 8, 30000);
export async function extractMetadata(url: string) {
  return extraction(() => extractMetadataNow(url));
}
async function extractMetadataNow(url: string) {
  const validatedUrl = canonicalUrl(url);
  const deadline = Date.now() + 15000;
  let page = await fetchHtml(validatedUrl, deadline);
  // Amazon may return its interstitial with HTTP 200. Retry the public URL once
  // with Chromium's native network stack, without submitting the access form.
  if (
    amazonCurrency(page.url) &&
    /<form\b[^>]*action=["'][^"']*validateCaptcha/i.test(
      page.body.toString("utf8"),
    )
  )
    page = await fetchBrowserHtml(page.url, deadline);
  return parseMetadata(page.body.toString("utf8"), page.url);
}
