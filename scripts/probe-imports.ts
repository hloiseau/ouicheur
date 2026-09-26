import { fetchImportPage, parseAmazon, parseThrone } from "../lib/imports";

// Defaults test public entry points only; supply YOUR authorized list URLs to validate an import.
const urls = process.argv.slice(2);
for (const [source, url] of [
  ["amazon", urls[0] || "https://www.amazon.fr/hz/wishlist/ls/"],
  ["throne", urls[1] || "https://throne.com/"],
] as const) {
  try {
    const page = await fetchImportPage(source, url);
    const html = page.body.toString("utf8");
    const items =
      source === "amazon"
        ? parseAmazon(html, page.url)
        : parseThrone(html, page.url);
    const blocked =
      !items.length &&
      /captcha|robot check|validateCaptcha|cf-chl-/i.test(html);
    console.log(
      JSON.stringify({
        date: new Date().toISOString(),
        source,
        url,
        status: 200,
        bytes: page.body.length,
        blocked,
        products: items.length,
        scope: urls.length ? "provided-links" : "public-entry-points-only",
      }),
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        date: new Date().toISOString(),
        source,
        url,
        error: e instanceof Error ? e.message : "unknown",
      }),
    );
  }
}
