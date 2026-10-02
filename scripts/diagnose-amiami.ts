import { fetchSafe } from "../lib/fetch-safe.ts";
import { fetchBrowserHtml } from "../lib/fetch-browser.ts";
import { parseMetadata } from "../lib/metadata.ts";
for (const code of ["FIGURE-055579-R207", "FIGURE-055581-R235"]) {
  const url = "https://www.amiami.com/eng/detail/?scode=" + code;
  for (const transport of ["node", "chromium"]) {
    try {
      const page = await (transport === "node" ? fetchSafe(url) : fetchBrowserHtml(url, Date.now() + 15000));
      const html = page.body.toString();
      console.log("AMIAMI_RESULT " + JSON.stringify({ code, transport, bytes: page.body.length, url: page.url, metadata: parseMetadata(html, page.url), html: html.slice(0, 45000) }));
    } catch (error) {
      console.log("AMIAMI_RESULT " + JSON.stringify({ code, transport, error: error.message, values: error.values }));
    }
  }
}
