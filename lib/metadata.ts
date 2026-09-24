import * as cheerio from "cheerio";
import { fetchSafe } from "./fetch-safe";
import { canonicalUrl, money, webUrl } from "./validation";

type JsonObject = Record<string, unknown>;
export function structuredProducts(html: string): JsonObject[] {
  const $ = cheerio.load(html);
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
    const type = object["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product")))
      products.push(object);
    for (const key of ["@graph", "itemListElement", "item", "mainEntity"])
      if (object[key]) walk(object[key], depth + 1);
  };
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      walk(JSON.parse($(element).text()));
    } catch {
      /* Invalid JSON is untrusted data, not executable code. */
    }
  });
  return products;
}
export function parseMetadata(html: string, url: string) {
  const $ = cheerio.load(html);
  const meta = (name: string) =>
    $(`meta[property='${name}'],meta[name='${name}']`)
      .first()
      .attr("content")
      ?.trim() || "";
  const product = structuredProducts(html)[0] || {};
  const offers = Array.isArray(product.offers)
    ? product.offers[0]
    : product.offers;
  const offer = (
    offers && typeof offers === "object" ? offers : {}
  ) as JsonObject;
  const title = String(
    product.name || meta("og:title") || $("title").text(),
  ).slice(0, 160);
  const description = String(
    product.description || meta("og:description") || meta("description"),
  ).slice(0, 2000);
  const rawImage = Array.isArray(product.image)
    ? product.image[0]
    : product.image;
  const imageValue =
    typeof rawImage === "string"
      ? rawImage
      : rawImage && typeof rawImage === "object"
        ? String((rawImage as JsonObject).url || "")
        : meta("og:image");
  let image_url = "";
  try {
    if (imageValue)
      image_url = webUrl(new URL(imageValue, url).toString()).toString();
  } catch {
    /* Leave image editable. */
  }
  let price: number | null = null;
  try {
    const value = offer.price || meta("product:price:amount");
    if (value) price = money(String(value));
  } catch {
    /* Price is only an optional suggestion. */
  }
  const currency = String(
    offer.priceCurrency || meta("product:price:currency"),
  ).toUpperCase();
  return {
    url: canonicalUrl(url),
    title,
    description,
    image_url,
    price,
    currency,
    extracted_at: new Date().toISOString(),
  };
}
export async function extractMetadata(url: string) {
  const page = await fetchSafe(url);
  return parseMetadata(page.body.toString("utf8"), page.url);
}
