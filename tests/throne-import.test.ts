import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import {
  parseThrone,
  createImport,
  getImport,
  commitImport,
  prepareImport,
} from "../lib/imports";

const html = readFileSync("tests/fixtures/throne-next.html", "utf8");

test("Throne : les produits publics Next.js deviennent un aperçu sans frais ni financement", async () => {
  const items = parseThrone(html, "https://throne.com/fixture");
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    source: "throne",
    source_id: "wish-camera",
    title: "Objectif photo",
    description: "Pour les photos",
    url: "https://www.amazon.fr/dp/B000TEST01",
    image_url: "https://example.com/camera.png",
    price: "",
    currency: "",
    errors: ["Objectif à renseigner."],
  });
  assert.equal(items[1].url, "");
  assert.equal(items[1].price, "");
  assert.ok(items[1].errors.some((e) => e.includes("URL")));

  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "private-password-123");
    const id = createImport(db, "throne-html", html);
    const preview = getImport(db, id);
    assert.equal(preview.state, "preview");
    assert.equal(preview.source, "throne-html");
    assert.equal(preview.source_url, "https://throne.com/fixture");
    assert.equal(preview.attempts, 0);
    assert.deepEqual(preview.items, items);
    assert.ok(!JSON.stringify(preview).includes("must-not-be-persisted"));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM gifts").get()!.n, 0);
    const [giftId] = commitImport(db, id, [
      {
        index: 0,
        gift: {
          url: items[0].url,
          title: items[0].title,
          target: "500",
          visibility: "draft",
        },
      },
    ]);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM contributions").get()!.n,
      0,
    );
    const again = createImport(db, "throne-html", html);
    assert.equal(getImport(db, again).items[0].duplicate_id, giftId);
    const repeated = createImport(
      db,
      "json",
      JSON.stringify([
        {
          source_id: "a",
          url: "https://example.com/shared",
          title: "Premier",
          price: "10",
          currency: "EUR",
        },
        {
          source_id: "b",
          url: "https://example.com/shared",
          title: "Second",
          price: "10",
          currency: "EUR",
        },
      ]),
    );
    const duplicates = getImport(db, repeated).items;
    assert.equal(duplicates[0].duplicate_index, undefined);
    assert.equal(duplicates[1].duplicate_index, 0);
    for (const invalid of [
      "<h1>Verify you are human</h1>",
      '<script id="__NEXT_DATA__">{broken}</script>',
    ]) {
      assert.throws(
        () => createImport(db, "throne-html", invalid),
        /Aucun produit/,
      );
    }
  } finally {
    db.close();
  }
});

test("Throne conserve la variante marchande même si le lien pointe sur une autre", () => {
  const rows = ["44070238552151", "44070238519383"].map((variant, index) => ({
    id: `print-${index}`,
    name: `Metal Print | Artwork ${index ? "A" : "B"}`,
    link: "https://shop.example/products/print?variant=44070238519383",
    price: 4804.592726,
    currency: "USD",
    partnerStoreData: {
      variantForeignId: variant,
      extraPartnerStoreData: { storeType: "manual-shopify" },
    },
  }));
  const items = parseThrone(
    `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { ssrWishlistItems: rows } } })}</script>`,
    "https://throne.com/fixture",
  );
  assert.equal(
    items[0].url,
    "https://shop.example/products/print?variant=44070238552151",
  );
  assert.notEqual(items[0].url, items[1].url);
  assert.ok(items.every((item) => item.price === "" && item.currency === ""));
});

test("les prix importés sont convertis une seule fois avec les taux BCE", async (t) => {
  const db = openDatabase(":memory:");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(
      url,
      "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    );
    calls++;
    return new Response(
      `<Envelope><Cube time="2026-09-25"><Cube currency="USD" rate="1.2"/><Cube currency="GBP" rate="0.8"/></Cube></Envelope>`,
    );
  });
  try {
    await initializeOwner(db, "Test", "test-only-password-2026");
    const items = [
      {
        name: "USD",
        price: "120.00",
        currency: "USD",
        fee: 1000,
        shipping: 500,
        totalContributionPrice: 13500,
      },
      { name: "GBP", price: "80.00", currency: "GBP" },
      { name: "EUR", price: "7.95", currency: "EUR" },
    ].map((p) => ({
      ...p,
      title: p.name,
      url: `https://shop.example/${p.name}`,
    }));
    const id = createImport(db, "json", JSON.stringify(items));
    await prepareImport(db, id);
    const preview = getImport(db, id);
    assert.deepEqual(
      preview.items.map((i) => [i.price, i.currency]),
      [
        ["100.00", "EUR"],
        ["100.00", "EUR"],
        ["7.95", "EUR"],
      ],
    );
    assert.deepEqual(preview.items[0].conversion, {
      price: "120.00",
      currency: "USD",
      date: "2026-09-25",
    });
    assert.ok(
      preview.items.every((i) => !i.metadata_checked && !i.metadata_error),
    );
    await prepareImport(db, id);
    assert.equal(
      calls,
      1,
      "un seul téléchargement des taux, aucune conversion répétée",
    );
    assert.deepEqual(getImport(db, id).items, preview.items);
    const ids = commitImport(
      db,
      id,
      preview.items.map((item, index) => ({
        index,
        gift: { title: item.title, url: item.url, target: item.price },
      })),
    );
    assert.equal(
      db.prepare("SELECT target FROM gifts WHERE id=?").get(ids[0])!.target,
      10000,
    );

    const missingRate = createImport(
      db,
      "json",
      JSON.stringify([
        {
          title: "Devise inconnue",
          url: "https://shop.example/unknown",
          price: "30",
          currency: "ZZZ",
        },
      ]),
    );
    await prepareImport(db, missingRate);
    assert.equal(getImport(db, missingRate).items[0].price, "30");
    assert.equal(getImport(db, missingRate).items[0].currency, "ZZZ");
    assert.ok(getImport(db, missingRate).items[0].conversion_error);

    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("offline");
    });
    const offline = createImport(
      db,
      "json",
      JSON.stringify([
        {
          title: "Prix conservé",
          url: "https://shop.example/offline",
          price: "120",
          currency: "USD",
        },
      ]),
    );
    await prepareImport(db, offline);
    assert.equal(getImport(db, offline).items[0].price, "120");
    assert.equal(getImport(db, offline).items[0].currency, "USD");
    assert.ok(getImport(db, offline).items[0].conversion_error);
  } finally {
    db.close();
  }
});
