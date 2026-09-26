import test from "node:test";
import assert from "node:assert/strict";
import { parseMetadata } from "../lib/metadata";
import {
  parseAmazon,
  parseThrone,
  parseGeneric,
  importUrl,
  createImport,
  getImport,
  commitImport,
} from "../lib/imports";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveGift } from "../lib/gifts";

test("les boutiques Open Graph fournissent leur prix localisé et leur image HTTPS", () => {
  const p = parseMetadata(
    `<meta property="og:title" content="Montre"><meta property="og:price:amount" content="1.170,95"><meta property="og:price:currency" content="GBP"><meta property="og:image" content="http://shop.example/watch.jpg"><meta property="og:image:secure_url" content="https://shop.example/watch.jpg">`,
    "https://shop.example/watch",
  );
  assert.equal(p.price, 117095);
  assert.equal(p.currency, "GBP");
  assert.equal(p.image_url, "https://shop.example/watch.jpg");
});

test("le prix et la devise affichés pour la variante sélectionnée priment sur les balises de la boutique", () => {
  const html = `<meta property="og:price:amount" content="1.170,95"><meta property="og:price:currency" content="GBP">
    <select name="id"><option value="m">Medium - €1.170,95 EUR</option><option value="l" selected>Large - €1.190,95 EUR</option></select>`;
  const selected = parseMetadata(
    html,
    "https://shop.example/products/watch?variant=l",
  );
  assert.equal(selected.price, 119095);
  assert.equal(selected.currency, "EUR");
  const medium = parseMetadata(
    html,
    "https://shop.example/products/watch?variant=m",
  );
  assert.equal(medium.price, 117095);
  assert.equal(medium.currency, "EUR");
});

test("les variantes JSON-LD correspondent au lien choisi et héritent de la description", () => {
  const data = {
    "@type": "ProductGroup",
    name: "Bracelet",
    description: "Acier",
    hasVariant: [
      {
        "@type": "Product",
        name: "Bracelet M",
        image: "/m.jpg",
        offers: {
          url: "https://shop.example/bracelet?variant=m",
          price: "65.00",
          priceCurrency: "USD",
        },
      },
      {
        "@type": "Product",
        name: "Bracelet L",
        image: [{ "@type": "ImageObject", contentUrl: "/l.jpg" }],
        offers: {
          url: "https://shop.example/bracelet?variant=l",
          price: "72.00",
          priceCurrency: "USD",
        },
      },
    ],
  };
  const p = parseMetadata(
    `<script type="application/ld+json">${JSON.stringify(data)}</script>`,
    "https://shop.example/bracelet?variant=l&utm_source=test",
  );
  assert.equal(p.title, "Bracelet L");
  assert.equal(p.description, "Acier");
  assert.equal(p.price, 7200);
  assert.equal(p.currency, "USD");
  assert.equal(p.image_url, "https://shop.example/l.jpg");
});

test("Amazon : les données du produit principal priment sur les recommandations", () => {
  const p = parseMetadata(
    `<title>Clavier : Amazon.fr</title><span id="productTitle">Clavier AZERTY</span><img id="landingImage" src="/keyboard.jpg"><div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">119,99€</span></span></div><div class="recommendation"><span class="a-offscreen">9,99€</span></div>`,
    "https://www.amazon.fr/dp/B000TEST01",
  );
  assert.equal(p.title, "Clavier AZERTY");
  assert.equal(p.price, 11999);
  assert.equal(p.currency, "EUR");
  assert.equal(p.image_url, "https://www.amazon.fr/keyboard.jpg");
});

test("Amazon : le prix visible est lu quand sa copie accessible est vide", () => {
  const p = parseMetadata(
    `<span id="productTitle">Livre</span><div id="corePriceDisplay_desktop_feature_div"><span class="a-price a-text-price"><span class="a-offscreen">35,00€</span></span><span class="a-price"><span class="a-offscreen"> </span><span aria-hidden="true"><span class="a-price-whole">29<span class="a-price-decimal">,</span></span><span class="a-price-fraction">90</span><span class="a-price-symbol">€</span></span></span></div><aside><span class="a-price">9,99€</span></aside>`,
    "https://www.amazon.fr/dp/B000TEST01",
  );
  assert.equal(p.price, 2990);
  assert.equal(p.currency, "EUR");
});

test("Amazon préfère l’image originale puis la plus grande résolution de l’image principale", () => {
  const html = `<meta property="og:image" content="/thumbnail.jpg"><img id="landingImage" src="/small.jpg" data-a-dynamic-image='{"/medium.jpg":[400,600],"/large.jpg":[1000,1500]}'`;
  const url = "https://www.amazon.fr/dp/B000TEST01";
  assert.equal(
    parseMetadata(html + ">", url).image_url,
    "https://www.amazon.fr/large.jpg",
  );
  assert.equal(
    parseMetadata(html + ' data-old-hires="/original.jpg">', url).image_url,
    "https://www.amazon.fr/original.jpg",
  );
});

test("Schema.org : références de graphe, offres multiples et prix détaillés", () => {
  const data = {
    "@graph": [
      {
        "@type": "https://schema.org/Product",
        name: "Ordinateur",
        image: { "@id": "#photo" },
        offers: [{ "@id": "#other" }, { "@id": "#offer" }],
      },
      {
        "@id": "#other",
        "@type": "Offer",
        url: "https://shop.example/pc?grade=fair",
        price: "300",
        priceCurrency: "EUR",
      },
      {
        "@id": "#offer",
        "@type": "Offer",
        url: "https://shop.example/pc?grade=good",
        priceSpecification: [
          {
            "@type": "UnitPriceSpecification",
            price: "400",
            priceCurrency: "EUR",
            validForMemberTier: "https://shop.example/gold",
          },
          {
            "@type": "DeliveryChargeSpecification",
            price: "5",
            priceCurrency: "EUR",
          },
          {
            "@type": "UnitPriceSpecification",
            price: "540.00",
            priceCurrency: "EUR",
          },
        ],
      },
      { "@id": "#photo", "@type": "ImageObject", contentUrl: "/pc.jpg" },
    ],
  };
  const p = parseMetadata(
    `<script type="application/ld+json">${JSON.stringify(data)}</script>`,
    "https://shop.example/pc?grade=good",
  );
  assert.equal(p.title, "Ordinateur");
  assert.equal(p.price, 54000);
  assert.equal(p.currency, "EUR");
  assert.equal(p.image_url, "https://shop.example/pc.jpg");
  const aggregate = parseMetadata(
    `<script type="application/ld+json">{"@type":"Product","name":"Livre","offers":{"@type":"AggregateOffer","lowPrice":"29.90","highPrice":"39.90","priceCurrency":"EUR"}}</script>`,
    "https://shop.example/book",
  );
  assert.equal(aggregate.price, 2990);
});

test("Schema.org : Microdata et RDFa restent limités au produit et à son offre", () => {
  for (const html of [
    `<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Montre</span><img itemprop="image" src="/watch.jpg"><div itemprop="review" itemscope itemtype="https://schema.org/Review"><span itemprop="name">Avis</span><meta itemprop="price" content="1"></div><div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="EUR"><meta itemprop="price" content="1170.95"></div></div>`,
    `<div vocab="https://schema.org/" typeof="Product"><span property="name">Montre</span><link property="image" href="/watch.jpg"><div rel="review"><div typeof="Review"><span property="name">Avis</span><meta property="price" content="1"></div></div><div rel="offers"><div typeof="Offer"><meta property="priceCurrency" content="EUR"><meta property="price" content="1170.95"></div></div></div>`,
    `<div typeof="schema:Product"><span property="schema:name" content="Montre"></span><div rel="schema:image" resource="/watch.jpg"></div><div rel="schema:offers"><div typeof="schema:Offer"><meta property="schema:priceCurrency" content="EUR"><meta property="schema:price" content="1170.95"></div></div></div>`,
    `<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Montre</span><img itemprop="image" src="/watch.jpg"><div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="EUR"><div itemprop="priceSpecification" itemscope itemtype="https://schema.org/UnitPriceSpecification"><meta itemprop="price" content="100"><link itemprop="validForMemberTier" href="/gold"></div><div itemprop="priceSpecification" itemscope itemtype="https://schema.org/UnitPriceSpecification"><meta itemprop="price" content="1170.95"></div></div></div>`,
  ]) {
    const p = parseMetadata(html, "https://shop.example/watch");
    assert.equal(p.title, "Montre");
    assert.equal(p.price, 117095);
    assert.equal(p.currency, "EUR");
    assert.equal(p.image_url, "https://shop.example/watch.jpg");
  }
});

test("Amazon : les lignes imbriquées, prix groupés et URL malformées ne cassent pas l’import", () => {
  const rows = parseAmazon(
    `<li data-itemid="wish"><a href="/dp/B000TEST01" title="Montre">Montre</a><span class="a-price"><span class="a-offscreen">1.234,56 €</span></span><div data-asin="B000TEST01"><a href="/dp/B000TEST01">Miniature</a></div></li><li data-itemid="broken"><a href="http://[invalid/dp/B000TEST02">À corriger</a></li>`,
    "https://www.amazon.fr/hz/wishlist/ls/TEST",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Montre");
  assert.equal(rows[0].price, "1234.56");
  assert.equal(rows[1].url, "");
  assert.ok(rows[1].errors.length);
  const dollars = parseAmazon(
    `<li data-itemid="us"><a href="/dp/B000TEST03">Livre</a><span class="a-price"><span class="a-offscreen">$1,234.56</span></span></li>`,
    "https://www.amazon.com/hz/wishlist/ls/TEST",
  );
  assert.equal(dollars[0].price, "1234.56");
  assert.equal(dollars[0].currency, "USD");
});

test("les profils Throne ont une URL canonique et les offres incomplètes restent éditables", () => {
  for (const url of [
    "http://throne.com/fixture",
    "https://www.throne.com/fixture/",
    "https://throne.com/fixture?utm_source=test",
  ])
    assert.equal(importUrl("throne", url), "https://throne.com/fixture");
  const rows = parseThrone(
    `<script type="application/ld+json">${JSON.stringify([{ "@type": "Product", name: "Montre", url: "https://shop.example/watch", image: { contentUrl: "https://shop.example/watch.jpg" }, offers: [] }])}</script>`,
    "https://throne.com/fixture",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].image_url, "https://shop.example/watch.jpg");
  assert.ok(rows[0].errors.some((e) => e.includes("Objectif")));
});

test("JSON exporté avec BOM et fichiers vides : validation explicite", () => {
  const rows = parseGeneric(
    '\uFEFF[{"title":"Livre","url":"https://shop.example/book","price":"20","currency":"EUR"}]',
    "json",
  );
  assert.equal(rows.length, 1);
  assert.throws(() => parseGeneric("[]", "json"), /vide/);
  assert.throws(
    () => parseGeneric("title,url,price,currency\n", "csv"),
    /vide/,
  );
});

test("le réimport indique la devise du cadeau existant et interdit deux remplacements du même cadeau", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "private-password-123");
    db.prepare("UPDATE owner SET currency='USD'").run();
    const gift = {
      title: "Mon titre",
      url: "https://shop.example/watch",
      target: "65",
    };
    const giftId = saveGift(db, gift);
    db.prepare("UPDATE owner SET currency='EUR'").run();
    const id = createImport(
      db,
      "json",
      JSON.stringify([
        { ...gift, source_id: "one", price: "65", currency: "USD" },
        { ...gift, source_id: "two", price: "70", currency: "USD" },
      ]),
    );
    const preview = getImport(db, id);
    assert.equal(preview.items[0].duplicate_currency, "USD");
    assert.throws(() =>
      commitImport(db, id, [
        { index: 0, replace: true, gift: { ...gift, title: "Premier" } },
        { index: 1, replace: true, gift: { ...gift, title: "Second" } },
      ]),
    );
    assert.equal(
      db.prepare("SELECT title FROM gifts WHERE id=?").get(giftId)!.title,
      "Mon titre",
    );
    assert.equal(getImport(db, id).state, "preview");
  } finally {
    db.close();
  }
});
