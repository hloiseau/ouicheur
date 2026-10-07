import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { database, openDatabase } from "../lib/db";
import {
  createImport,
  runImport,
  getImport,
  prepareImport,
  commitImport,
} from "../lib/imports";
import { initializeOwner } from "../lib/auth";
import { listGifts } from "../lib/gifts";
import { backupInstance, restoreInstance } from "../lib/backup";

const origin = "http://www.amazon.fr";
const shop = "http://shop.example";
const row = (id: number) =>
  `<li data-itemid="${id}"><a title="Produit ${id}" href="/dp/B${String(id).padStart(9, "0")}">Produit ${id}</a><img src="/image.jpg"><span class="a-price"><span class="a-offscreen">12,34 €</span></span></li>`;
const state = (cursor: string | null, next: string) =>
  `<script type="a-state" data-a-state='{"key":"scrollState"}'>${JSON.stringify({ lastEvaluatedKey: cursor, showMoreUrl: next })}</script>`;

test("Amazon : toutes les pages publiques sont importées, sans boucle ni aperçu partiel", async (t) => {
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-import-images-"));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = folder;
  const png = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  let mode = "complete";
  const requests: string[] = [];
  const next = "/hz/wishlist/slv/items?paginationToken=second";
  const server = http.createServer((req, res) => {
    requests.push(req.url!);
    if (req.url!.startsWith("/products/print")) {
      if (mode === "merchant-failed") return void res.writeHead(500).end();
      return void res
        .writeHead(200, { "content-type": "text/html" })
        .end(
          `<script type="application/ld+json">${JSON.stringify({ "@type": "ProductGroup", hasVariant: [1, 2].map((variant) => ({ "@type": "Product", name: `Print ${variant}`, image: "/large.jpg", offers: { url: `${shop}/products/print?variant=${variant}`, price: variant === 1 ? "49" : "59", priceCurrency: "EUR" } })) })}</script>`,
        );
    }
    if (req.url === "/image.jpg" || req.url === "/large.jpg")
      return void res
        .writeHead(mode === "image-failed" ? 503 : 200, {
          "content-type": "image/png",
        })
        .end(png);
    if (req.url!.startsWith("/dp/"))
      return void res
        .writeHead(200, { "content-type": "text/html" })
        .end(
          `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Produit", image: "/large.jpg", offers: { "@type": "Offer", price: "10.95", priceCurrency: "EUR" } })}</script>`,
        );
    const first = req.url!.startsWith("/hz/wishlist/ls/");
    if (mode === "failed" && !first) return void res.writeHead(500).end();
    let body = row(first ? 1 : 2);
    if (mode === "limit")
      body = Array.from({ length: 200 }, (_, i) => row(i + 1)).join("");
    body += state(
      first || mode === "loop" ? "cursor" : null,
      mode === "private" ? "http://127.0.0.1/secret" : next,
    );
    res.writeHead(200, { "content-type": "text/html" }).end(body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  syncBuiltinESMExports();
  const get = http.get;
  t.mock.method(
    http,
    "get",
    (
      url: URL,
      options: http.RequestOptions,
      callback: (res: http.IncomingMessage) => void,
    ) => {
      assert.ok([origin, shop].includes(url.origin));
      assert.ok(options.lookup);
      return get(
        new URL(url.pathname + url.search, `http://127.0.0.1:${port}`),
        { ...options, lookup: undefined },
        callback,
      );
    },
  );
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "test-only-password-2026");
    const execute = async () => {
      requests.length = 0;
      const id = createImport(db, "amazon", origin + "/hz/wishlist/ls/TEST");
      await runImport(db, id);
      return getImport(db, id);
    };
    const complete = await execute();
    assert.equal(complete.state, "preview", complete.error);
    assert.deepEqual(
      complete.items.map((i) => i.title),
      ["Produit 1", "Produit 2"],
    );
    assert.ok(
      complete.items.every(
        (i) =>
          i.price === "10.95" &&
          i.currency === "EUR" &&
          i.image_url === origin + "/large.jpg",
      ),
    );
    // Amazon leaves showMoreUrl populated on the last page; only the cursor ends pagination.
    assert.deepEqual(
      [...requests].sort(),
      [
        "/hz/wishlist/ls/TEST",
        next,
        "/dp/B000000001",
        "/dp/B000000002",
        "/large.jpg",
        "/large.jpg",
      ].sort(),
    );
    assert.ok(
      complete.items.every((i) =>
        /^\/media\/[a-f0-9]{64}\.webp$/.test(i.image || ""),
      ),
    );
    await prepareImport(db, complete.id);
    assert.equal(
      requests.length,
      6,
      "prepared products and images are not downloaded again",
    );
    assert.equal(
      (
        await sharp(
          readFileSync(
            join(folder, "images", complete.items[0].image!.slice(7)),
          ),
        ).metadata()
      ).width,
      1200,
    );
    backupInstance(db, folder, join(folder, "backup"));
    restoreInstance(join(folder, "backup"), join(folder, "restored"));
    assert.deepEqual(
      readFileSync(join(folder, "images", complete.items[0].image!.slice(7))),
      readFileSync(
        join(folder, "restored/images", complete.items[0].image!.slice(7)),
      ),
    );
    commitImport(
      db,
      complete.id,
      complete.items.map((item, index) => ({
        index,
        gift: { url: item.url, title: item.title, target: item.price },
      })),
    );
    assert.equal(listGifts(db).length, 2);
    assert.ok(
      listGifts(db).every(
        (gift) => gift.image && gift.visibility === "visible",
      ),
    );
    const throneHtml = `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { ssrWishlistItems: [2, 1, 1].map((variant, index) => ({ id: `print-${index}`, name: `Print ${variant}`, link: `${shop}/products/print?variant=1`, imgLink: `${shop}/large.jpg`, price: 99900, currency: "USD", partnerStoreData: { variantForeignId: String(variant), extraPartnerStoreData: { storeType: "manual-shopify" } } })) } } })}</script>`;
    const throneId = createImport(db, "throne-html", throneHtml);
    requests.length = 0;
    await prepareImport(db, throneId);
    const throne = getImport(db, throneId);
    assert.deepEqual(
      throne.items.map((i) => [i.price, i.currency, i.duplicate_index]),
      [
        ["59.00", "EUR", undefined],
        ["49.00", "EUR", undefined],
        ["49.00", "EUR", 1],
      ],
    );
    assert.ok(throne.items.every((i) => i.image && !i.metadata_error));
    assert.equal(
      requests.filter((url) => url.startsWith("/products/")).length,
      2,
      "les deux variantes sont lues chez le marchand, le lien répété est partagé",
    );
    commitImport(
      db,
      throneId,
      throne.items.slice(0, 2).map((item, index) => ({
        index,
        gift: { url: item.url, title: item.title, target: item.price },
      })),
    );
    assert.equal(listGifts(db).length, 4, "both variants can be published");
    assert.notEqual(
      getImport(db, throneId).items[0].duplicate_id,
      getImport(db, throneId).items[1].duplicate_id,
    );
    mode = "merchant-failed";
    const failedId = createImport(db, "throne-html", throneHtml);
    await prepareImport(db, failedId);
    assert.ok(
      getImport(db, failedId).items.every(
        (i) => !i.price && !i.currency && i.image && i.metadata_error,
      ),
      "un échec marchand ne doit jamais remplacer le prix par le montant Throne",
    );
    mode = "image-failed";
    const unavailable = await execute();
    assert.equal(unavailable.state, "preview");
    assert.ok(
      unavailable.items.every((i) => i.title && i.price && i.image_error),
    );
    for (mode of ["failed", "loop", "private", "limit"]) {
      const rejected = await execute();
      assert.equal(rejected.state, "failed", mode);
      assert.equal(rejected.items.length, 0, mode);
      assert.ok(requests.length <= 2, mode);
    }
  } finally {
    db.close();
    database().close();
    t.mock.restoreAll();
    syncBuiltinESMExports();
    server.closeAllConnections();
    server.close();
    await once(server, "close");
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    rmSync(folder, { recursive: true, force: true });
  }
});
