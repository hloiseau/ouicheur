import test from "node:test";
import assert from "node:assert/strict";
import { extractMetadata, parseMetadata } from "../lib/metadata";

test("les métadonnées produit sont analysées sans exécuter le HTML, et les pages de contrôle sont refusées", async () => {
  const product = parseMetadata(
    `
    <title>Montre — Boutique</title>
    <meta property="og:image" content="/watch.jpg">
    <script type="application/ld+json">{
      "@type":"Product","name":"Seiko Astron — exemple de test",
      "description":"Montre de collection","offers":{"price":"1250.00","priceCurrency":"EUR"}
    }</script>
    <script>throw new Error("must not execute")</script>
  `,
    "https://merchant.invalid/watch?utm_source=test",
  );
  assert.equal(product.title, "Seiko Astron — exemple de test");
  assert.equal(product.price, 125000);
  assert.equal(product.currency, "EUR");
  assert.equal(product.url, "https://merchant.invalid/watch");
  assert.equal(product.image_url, "https://merchant.invalid/watch.jpg");
  assert.throws(
    () =>
      parseMetadata(
        "<title>Just a moment...</title><script>window._cf_chl_opt = {};</script>",
        "https://merchant.invalid/watch",
      ),
    /contrôle d’accès/,
  );
  await assert.rejects(extractMetadata("javascript:alert(1)"), /HTTP/);
});

test("une salle d’attente marchande ne devient pas le titre du cadeau", () => {
  assert.throws(
    () =>
      parseMetadata(
        "<title>Hang Tight! Routing to checkout...</title>",
        "https://eu.patagonia.com/product/backpack",
      ),
    /contrôle d’accès/,
  );
});

test("un ancien lien redirigé vers une catégorie ne récupère pas son prix minimum", () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"Sac à dos femme","offers":{"@type":"AggregateOffer","lowPrice":2.99,"highPrice":7439,"priceCurrency":"EUR"}}</script>`;
  assert.throws(
    () =>
      parseMetadata(
        html,
        "https://shop.example/category/backpacks",
        "https://shop.example/product/old-backpack",
      ),
    /fiche produit/,
  );
  assert.throws(
    () =>
      parseMetadata(
        "<title>Tous nos produits</title>",
        "https://shop.example/category",
        "https://shop.example/product/old",
      ),
    /fiche produit/,
  );
  const product = `<script type="application/ld+json">{"@type":"Product","name":"Sac à dos","offers":{"@type":"Offer","price":29.99,"priceCurrency":"EUR"}}</script>`;
  assert.equal(
    parseMetadata(
      product,
      "https://shop.example/product/new",
      "https://shop.example/product/old",
    ).price,
    2999,
  );
});
