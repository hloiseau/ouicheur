import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { LaunchOptions } from "playwright-core";
import { fetchHtml, fetchBrowserHtml } from "../lib/fetch-browser";
import { MAX_HTML_BYTES } from "../lib/fetch-safe";
import { parseThrone } from "../lib/imports";
import { extractMetadata } from "../lib/metadata";

process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(".local/pw-browsers");
const { chromium } = await import("playwright-core");

test("le transport Chromium lit le HTML et bloque scripts, ressources et redirections privées", async (t) => {
  const requests: string[] = [];
  const fixture = readFileSync("tests/fixtures/throne-next.html", "utf8");
  // Local HTTP proxy used ONLY by this test: no external website or TLS exception.
  const server = http.createServer((req, res) => {
    requests.push(req.url!);
    const path = new URL(req.url!, "http://shop.amazon.fr").pathname;
    if (path === "/eng/detail/") {
      if (req.headers["user-agent"]?.includes("Ouicheur"))
        res
          .writeHead(406, { "content-type": "text/html" })
          .end("Not acceptable");
      else
        res
          .writeHead(200, { "content-type": "text/html" })
          .end(
            '<meta property="og:title" content="Figurine de test"><meta property="product:price:amount" content="12,900"><meta property="product:price:currency" content="JPY">',
          );
      return;
    }
    if (path === "/still-refused" || path === "/missing") {
      res.writeHead(path === "/missing" ? 404 : 406).end("Unavailable");
      return;
    }
    if (path === "/dp/B000TEST01") {
      res
        .writeHead(200, { "content-type": "text/html" })
        .end(
          req.headers["user-agent"]?.includes("Ouicheur")
            ? '<form action="/errors_page/validateCaptcha"><button>Continuer les achats</button></form>'
            : '<span id="productTitle">Objectif photo</span><div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">523,90 €</span></span></div>',
        );
      return;
    }
    if (path === "/accept" && !req.headers.accept?.includes("text/html"))
      res
        .writeHead(403, { "content-type": "text/html" })
        .end("HTML Accept header required");
    else if (path === "/redirect")
      res.writeHead(302, { location: "http://example.com/profile" }).end();
    else if (path === "/external")
      res.writeHead(302, { location: "http://shop.example/profile" }).end();
    else if (path === "/loop")
      res.writeHead(302, { location: "http://example.com/loop" }).end();
    else if (path === "/private")
      res.writeHead(302, { location: "http://127.0.0.1/secret" }).end();
    else if (path === "/large")
      res
        .writeHead(200, { "content-type": "text/html" })
        .end("x".repeat(MAX_HTML_BYTES + 1));
    else if (path === "/slow") return;
    else
      res
        .writeHead(200, { "content-type": "text/html" })
        .end(
          fixture +
            `<script>location.href='http://127.0.0.1/script'</script><img src='http://127.0.0.1/image'><iframe src='http://127.0.0.1/frame'></iframe>`,
        );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  syncBuiltinESMExports();
  const launch = chromium.launch.bind(chromium);
  t.mock.method(chromium, "launch", (options: LaunchOptions) => {
    assert.ok(
      options.args?.some((arg) =>
        /^--host-resolver-rules=MAP (example\.com|shop\.example|shop\.amazon\.fr) 8\.8\.8\.8$/.test(
          arg,
        ),
      ),
    );
    return launch({
      ...options,
      args: options.args!.filter(
        (arg: string) =>
          !arg.startsWith("--host-resolver-rules=") &&
          arg !== "--no-proxy-server",
      ),
      proxy: { server: `http://127.0.0.1:${port}`, bypass: "<-loopback>" },
    });
  });
  try {
    const negotiated = await fetchBrowserHtml(
      "http://example.com/accept",
      Date.now() + 15000,
    );
    assert.equal(
      parseThrone(negotiated.body.toString(), negotiated.url).length,
      2,
    );
    requests.length = 0;
    const page = await fetchBrowserHtml(
      "http://example.com/redirect",
      Date.now() + 15000,
    );
    assert.equal(page.url, "http://example.com/profile");
    assert.equal(parseThrone(page.body.toString(), page.url).length, 2);
    assert.deepEqual(requests, [
      "http://example.com/redirect",
      "http://example.com/profile",
    ]);
    const external = await fetchBrowserHtml(
      "http://example.com/external",
      Date.now() + 15000,
    );
    assert.equal(external.url, "http://shop.example/profile");
    assert.equal(parseThrone(external.body.toString(), external.url).length, 2);
    assert.deepEqual(requests.slice(-2), [
      "http://example.com/external",
      "http://shop.example/profile",
    ]);
    await assert.rejects(
      fetchBrowserHtml("http://example.com/loop", Date.now() + 15000),
      /redirections/,
    );
    assert.equal(requests.filter((url) => url.endsWith("/loop")).length, 4);
    await assert.rejects(
      fetchBrowserHtml("http://example.com/private", Date.now() + 15000),
      /interdite|privées/,
    );
    assert.ok(!requests.some((url) => url.includes("127.0.0.1")));
    await assert.rejects(
      fetchBrowserHtml("http://example.com/large", Date.now() + 15000),
      /volumineux/,
    );
    await assert.rejects(
      fetchBrowserHtml("http://example.com/slow", Date.now() + 1500),
    );
    const get = http.get;
    t.mock.method(
      http,
      "get",
      (
        url: URL,
        options: http.RequestOptions,
        callback: (res: http.IncomingMessage) => void,
      ) => {
        assert.ok(["shop.amazon.fr", "example.com"].includes(url.hostname));
        return get(
          new URL(url.pathname + url.search, `http://127.0.0.1:${port}`),
          { ...options, lookup: undefined },
          callback,
        );
      },
    );
    requests.length = 0;
    const product = await extractMetadata(
      "http://shop.amazon.fr/dp/B000TEST01",
    );
    assert.equal(product.price, 52390);
    assert.equal(product.currency, "EUR");
    assert.equal(
      requests.length,
      2,
      "une seule nouvelle lecture Chromium du produit",
    );
    assert.ok(!requests.some((url) => url.includes("validateCaptcha")));
    requests.length = 0;
    const itemUrl = "http://example.com/eng/detail/?scode=FIGURE-055579-R207";
    const figure = await extractMetadata(itemUrl);
    assert.equal(figure.title, "Figurine de test");
    assert.equal(figure.price, 1290000);
    assert.equal(figure.currency, "JPY");
    assert.equal(figure.url, itemUrl);
    assert.deepEqual(requests, [
      new URL(itemUrl).pathname + new URL(itemUrl).search,
      itemUrl,
    ]);
    requests.length = 0;
    await assert.rejects(fetchHtml("http://example.com/still-refused"), /406/);
    assert.equal(
      requests.length,
      2,
      "un refus persistant ne crée pas de boucle",
    );
    requests.length = 0;
    await assert.rejects(fetchHtml("http://example.com/missing"), /404/);
    assert.equal(
      requests.length,
      1,
      "une page absente ne déclenche pas de seconde lecture",
    );
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
