import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../lib/db";
import {
  initializeOwner,
  verifyPassword,
  createSession,
  authorized,
  setPassword,
  rateLimit,
  requireOrigin,
} from "../lib/auth";
import { fetchSafe, publicAddress, resolvePublic } from "../lib/fetch-safe";
import { parseMetadata } from "../lib/metadata";
import {
  commitImport,
  createImport,
  getImport,
  importUrl,
  parseAmazon,
  parseGeneric,
  parseThrone,
} from "../lib/imports";
import { backupInstance, restoreInstance } from "../lib/backup";
import { saveGift } from "../lib/gifts";
import { storeImage } from "../lib/images";
import sharp from "sharp";

test("SSRF : protocoles, IP privées/réservées, IPv6 et DNS mixtes refusés", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "::1",
    "::",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  const ipv6 = { address: "2606:4700:4700::1111", family: 6 };
  const ipv4 = { address: "8.8.8.8", family: 4 };
  assert.deepEqual(
    await resolvePublic(
      new URL("https://example.com"),
      async () => [ipv6, ipv4] as never,
    ),
    ipv4,
  );
  assert.deepEqual(
    await resolvePublic(
      new URL("https://example.com"),
      async () => [ipv6] as never,
    ),
    ipv6,
  );
  for (const url of [
    "file:///etc/passwd",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::ffff:127.0.0.1]",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost:3000",
  ])
    await assert.rejects(fetchSafe(url));
  await assert.rejects(
    resolvePublic(
      new URL("https://example.com"),
      async () =>
        [
          { address: "8.8.8.8", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ] as never,
    ),
    /privée/,
  );
  await assert.rejects(
    fetchSafe("https://example.com", "html", 4),
    /redirections/,
  );
});
test("initialisation locale unique, hachage, sessions révoquées, limitation et CSRF", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "private-password-123");
    const hash = String(
      db.prepare("SELECT password_hash FROM owner").get()!.password_hash,
    );
    assert.ok(!hash.includes("private-password"));
    assert.ok(await verifyPassword("private-password-123", hash));
    assert.ok(!(await verifyPassword("wrong", hash)));
    await assert.rejects(
      initializeOwner(db, "Attacker", "another-password-123"),
      /déjà initialisée/,
    );
    const token = createSession(db);
    assert.ok(authorized(db, token));
    assert.ok(!authorized(db, "bad"));
    await setPassword(db, "replacement-password-123");
    assert.ok(!authorized(db, token));
    rateLimit(db, "login-test", 1, 60000);
    assert.throws(
      () => rateLimit(db, "login-test", 1, 60000),
      /Trop de tentatives/,
    );
    assert.throws(
      () =>
        requireOrigin(
          new Request("http://localhost:3000/api/admin/profile", {
            method: "POST",
            headers: {
              origin: "https://attacker.example",
              "content-type": "application/json",
            },
          }),
        ),
      /Origine/,
    );
  } finally {
    db.close();
  }
});
test("importeurs distincts, aperçu éditable, doublons et aucune reprise de financement", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "private-password-123");
    const amazon = parseAmazon(
      readFileSync("tests/fixtures/amazon.html", "utf8"),
      "https://www.amazon.fr/hz/wishlist/ls/FIXTURE",
    );
    assert.equal(amazon.length, 2);
    assert.equal(amazon[0].source_id, "B000TEST01");
    assert.equal(amazon[0].price, "49.90");
    assert.ok(amazon[1].errors.some((e) => e.includes("URL")));
    const throne = parseThrone(
      readFileSync("tests/fixtures/throne.html", "utf8"),
      "https://throne.com/fixture",
    );
    assert.equal(throne.length, 2);
    assert.equal(throne[0].source_id, "fixture-product");
    assert.equal(throne[1].url, "");
    assert.ok(throne[1].errors.length);
    assert.equal(
      parseThrone("<div id='root'></div>", "https://throne.com/fixture").length,
      0,
    );
    assert.throws(() =>
      importUrl("amazon", "https://amazon.fr.evil.example/hz/wishlist/ls/TEST"),
    );
    const content = readFileSync("public/examples/import.json", "utf8");
    assert.equal(
      parseGeneric(readFileSync("public/examples/import.csv", "utf8"), "csv")
        .length,
      1,
    );
    const id = createImport(db, "json", content);
    assert.equal(getImport(db, id).state, "preview");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM gifts").get()!.n, 0);
    const gift = {
      url: "https://example.com/produits/lampe",
      title: "Mon titre local",
      target: "60",
      visibility: "draft",
    };
    const [giftId] = commitImport(db, id, [{ index: 0, gift }]);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM contributions").get()!.n,
      0,
    );
    const again = createImport(db, "json", content);
    assert.equal(getImport(db, again).items[0].duplicate_id, giftId);
    assert.throws(
      () => commitImport(db, again, [{ index: 0, gift }]),
      /Doublon/,
    );
    assert.equal(
      db.prepare("SELECT title FROM gifts WHERE id=?").get(giftId)!.title,
      "Mon titre local",
    );
    commitImport(db, again, [
      {
        index: 0,
        replace: true,
        gift: { ...gift, title: "Remplacement choisi" },
      },
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM gifts").get()!.n, 1);
    assert.equal(
      db.prepare("SELECT title FROM gifts WHERE id=?").get(giftId)!.title,
      "Remplacement choisi",
    );
  } finally {
    db.close();
  }
});
test("métadonnées non exécutées, prix daté, SVG téléversé refusé", async () => {
  const meta = parseMetadata(
    '<meta property="og:title" content="Lampe"><meta property="og:image" content="/lamp.png"><script type="application/ld+json">{"@type":"Product","name":"Tasse","offers":{"price":"29.99","priceCurrency":"EUR"}}</script><script>throw new Error("do not execute")</script>',
    "https://example.com/product",
  );
  assert.equal(meta.title, "Tasse");
  assert.equal(meta.price, 2999);
  assert.equal(meta.currency, "EUR");
  assert.equal(meta.image_url, "https://example.com/lamp.png");
  assert.ok(meta.extracted_at);
  for (const image of [
    [{ "@type": "ImageObject", contentUrl: "/watch.jpg" }],
    { "@type": "ImageObject", url: "/watch.jpg" },
    {},
  ]) {
    const watch = parseMetadata(
      `<meta property="og:image" content="/watch.jpg"><script type="application/ld+json">${JSON.stringify(
        {
          "@type": "Product",
          name: "Seiko Astron",
          image,
          offers: { price: "2500.00", priceCurrency: "EUR" },
        },
      )}</script>`,
      "https://merchant.example/watch",
    );
    assert.equal(watch.title, "Seiko Astron");
    assert.equal(watch.price, 250000);
    assert.equal(watch.image_url, "https://merchant.example/watch.jpg");
  }
  await assert.rejects(
    storeImage(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ),
  );
});
test("sauvegarde cohérente, restauration sur nouvelle instance et reprise des imports", async () => {
  const folder = mkdtempSync(join(tmpdir(), "wishlister-backup-"));
  const source = join(folder, "source");
  const db = openDatabase(join(source, "wishlist.sqlite"));
  const previousDataDir = process.env.DATA_DIR;
  try {
    process.env.DATA_DIR = source;
    await initializeOwner(db, "Backup Owner", "private-password-123");
    const image = await storeImage(
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#aabbcc" },
      })
        .png()
        .toBuffer(),
    );
    saveGift(db, {
      url: "https://example.com/backup",
      title: "Cadeau durable",
      target: "39",
      image,
    });
    const job = createImport(
      db,
      "amazon",
      "https://www.amazon.fr/hz/wishlist/ls/TEST",
    );
    db.prepare(
      "UPDATE imports SET state='running',attempts=1,lease_until=0 WHERE id=?",
    ).run(job);
    const token = createSession(db);
    backupInstance(db, source, join(folder, "snapshot"));
    const target = join(folder, "restored");
    restoreInstance(join(folder, "snapshot"), target);
    const restored = openDatabase(join(target, "wishlist.sqlite"));
    assert.equal(
      restored.prepare("SELECT title FROM gifts").get()!.title,
      "Cadeau durable",
    );
    assert.deepEqual(
      readFileSync(join(target, "images", image.slice(7))),
      readFileSync(join(source, "images", image.slice(7))),
    );
    assert.equal(getImport(restored, job).state, "running");
    assert.ok(!authorized(restored, token));
    assert.equal(
      restored.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
    restored.close();
    const restarted = openDatabase(join(target, "wishlist.sqlite"));
    assert.equal(restarted.prepare("SELECT COUNT(*) n FROM gifts").get()!.n, 1);
    restarted.close();
    assert.throws(
      () => restoreInstance(join(folder, "snapshot"), target),
      /destination sans base/,
    );
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
