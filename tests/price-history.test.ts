import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveGift, listGifts } from "../lib/gifts";
import {
  savePriceWatch,
  refreshOfferPrice,
  readPriceHistory,
  pollPriceWatches,
  offerIdentity,
  recordOfferPrice,
  updatePriceWatch,
} from "../lib/price-history";
import { withOfferObservations } from "../lib/offer-observations";
import { readOfferAlerts } from "../lib/offer-alerts";
import { queryWishlist } from "../lib/wishlist-query";
import { refreshProduct, applyProductPrice } from "../lib/product-refresh";
import { deliverNotifications } from "../lib/notifications";
import { saveNotificationPreferences } from "../lib/notification-preferences";
const input = {
  title: "Book",
  url: "https://example.org/book?edition=2",
  target: "30",
  model: "Edition 2",
};
const owner = { owner: true, lists: [] };
const metadata = (
  url: string,
  price: number | null = 2000,
  currency = "EUR",
  availability = "in_stock",
) => ({
  url,
  price,
  currency,
  availability,
  title: "Book",
  description: "",
  image_url: "",
  extracted_at: new Date().toISOString(),
});
async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Owner", "price-test-only-password");
  return db;
}
test("wishlist observations retain the last verified price and exclude other variants", async () => {
  const db = await fixture();
  try {
    const id = saveGift(db, input);
    const identity = offerIdentity(db, id);
    const now = new Date();
    const old = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    recordOfferPrice(db, identity, metadata(identity.url, 2000), "manual", old);
    recordOfferPrice(
      db,
      identity,
      metadata(identity.url, 1500, "USD"),
      "manual",
      now,
    );
    const item = queryWishlist(db, { mode: "owner" }, owner).items[0];
    assert.equal(item.target, 3000);
    assert.deepEqual(item.offer_observations?.[0], {
      offerId: "",
      merchant: "example.org",
      currency: "EUR",
      price: 2000,
      shipping: null,
      availability: "unknown",
      checkedAt: now.toISOString(),
      priceCheckedAt: old.toISOString(),
      verified: false,
      stale: true,
    });
    recordOfferPrice(db, identity, metadata(identity.url, 1800), "manual", now);
    const latest = withOfferObservations(db, listGifts(db), now.getTime())[0]
      .offer_observations?.[0];
    assert.equal(latest?.price, 1800);
    assert.equal(latest?.availability, "in_stock");
    assert.equal(latest?.verified, true);
    assert.equal(latest?.stale, false);
    saveGift(db, { ...input, model: "Edition 3" }, id);
    assert.equal(
      queryWishlist(db, { mode: "public" }, owner).items[0].offer_observations,
      undefined,
    );
  } finally {
    db.close();
  }
});
test("current merchant promotions expire independently of observed price drops", async () => {
  const db = await fixture();
  try {
    const id = saveGift(db, input);
    const offer = offerIdentity(db, id);
    const now = new Date();
    const previous = new Date(now.getTime() - 86400000);
    const expiresAt = new Date(now.getTime() + 60000).toISOString();
    recordOfferPrice(db, offer, metadata(offer.url, 2500), "manual", previous);
    recordOfferPrice(
      db,
      offer,
      {
        ...metadata(offer.url, 2000),
        promotion: { referencePrice: 3000, expiresAt },
      },
      "manual",
      now,
    );
    const read = (time: number) =>
      withOfferObservations(db, listGifts(db), time)[0].offer_observations?.[0];
    const quote = read(now.getTime());
    assert.deepEqual(quote?.promotion, { referencePrice: 3000, expiresAt });
    assert.deepEqual(quote?.observedDrop, {
      previousPrice: 2500,
      checkedAt: previous.toISOString(),
    });
    assert.equal(read(Date.parse(expiresAt))?.promotion, undefined);
    assert.equal(
      read(Date.parse(expiresAt))?.observedDrop?.previousPrice,
      2500,
    );
    assert.equal(read(now.getTime() + 3 * 86400000)?.observedDrop, undefined);
  } finally {
    db.close();
  }
});

test("price and stock alerts are distinct, scoped and emailed only while the offer qualifies", async () => {
  const db = await fixture();
  const smtp = {
    SMTP_HOST: "smtp.invalid",
    SMTP_FROM: "from@example.test",
    SMTP_TO: "owner@example.test",
  };
  const previous = Object.fromEntries(
    Object.keys(smtp).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, smtp);
  try {
    const id = saveGift(db, input);
    const offer = offerIdentity(db, id);
    const now = new Date();
    saveNotificationPreferences(
      db,
      {
        enabled: true,
        quiet_start: "00:00",
        quiet_end: "00:00",
        rules: [
          { kind: "offer_changed", channel: "email", frequency: "daily" },
        ],
      },
      owner,
    );
    savePriceWatch(db, {
      gift_id: id,
      threshold: 2000,
      stock_alert: true,
      confirmed_variant: true,
      confirm: true,
    });
    recordOfferPrice(
      db,
      offer,
      metadata(offer.url, 1700, "EUR", "out_of_stock"),
      "manual",
      new Date(now.getTime() - 60000),
    );
    recordOfferPrice(db, offer, metadata(offer.url, 1700), "manual", now);
    assert.deepEqual(
      readOfferAlerts(db, owner)
        .map((alert) => alert.kind)
        .sort(),
      ["price", "stock"],
    );
    assert.deepEqual(
      readOfferAlerts(db, { owner: false, lists: [], memberId: "unrelated" }),
      [],
    );
    const emails: string[] = [];
    await deliverNotifications(
      db,
      async (kind, channel, target, details) => {
        assert.equal(kind, "digest");
        assert.equal(channel, "email");
        assert.equal(target, smtp.SMTP_TO);
        emails.push(details || "");
      },
      now,
    );
    assert.equal(emails.length, 1);
    assert.match(emails[0], /Target price reached · example\.org/);
    assert.match(emails[0], /Back in stock · example\.org/);
    assert.match(emails[0], /Checked: .+\nhttps:\/\/example\.org\/book/);
    const later = new Date(now.getTime() + 86400000);
    recordOfferPrice(
      db,
      offer,
      metadata(offer.url, 2200),
      "manual",
      new Date(later.getTime() - 60000),
    );
    recordOfferPrice(db, offer, metadata(offer.url, 1700), "manual", later);
    recordOfferPrice(
      db,
      offer,
      metadata(offer.url, 1700, "EUR", "out_of_stock"),
      "manual",
      new Date(later.getTime() + 1000),
    );
    await deliverNotifications(
      db,
      async () => {
        assert.fail("Invalidated alert was sent");
      },
      new Date(later.getTime() + 2000),
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM notification_jobs WHERE state='pending'",
        )
        .get()!.n,
      0,
    );
  } finally {
    db.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("price history keeps dated offers separate from goals, currencies and variants", async () => {
  const db = await fixture();
  try {
    const id = saveGift(db, {
      ...input,
      offers: [
        {
          url: "https://example.net/used",
          condition: "used",
          price: 1000,
          currency: "EUR",
          shipping: 400,
        },
      ],
    });
    const offer = listGifts(db, true).find((g) => g.id === id)!.offers![0].id!;
    assert.equal(
      (
        await refreshOfferPrice(db, id, offer, async (url) =>
          metadata(url, 800),
        )
      ).state,
      "ok",
    );
    assert.equal(listGifts(db, true)[0].target, 3000);
    assert.equal(readPriceHistory(db, id, offer).items[0].shipping, 400);
    assert.equal(
      (
        await refreshOfferPrice(db, id, offer, async (url) =>
          metadata(url, 500, "USD"),
        )
      ).state,
      "uncertain",
    );
    assert.equal(
      (
        await refreshOfferPrice(db, id, offer, async (url) =>
          metadata(url, null),
        )
      ).price,
      null,
    );
    const pending = refreshOfferPrice(db, id, "", async (url) => {
      db.prepare("UPDATE gifts SET model='Edition 3' WHERE id=?").run(id);
      return metadata(url);
    });
    assert.equal((await pending).state, "uncertain");
    const check = await refreshProduct(db, id, async (url) => metadata(url));
    db.prepare("UPDATE gifts SET color='Blue' WHERE id=?").run(id);
    assert.throws(() => applyProductPrice(db, String(check.id)), /changé/);
    db.prepare("UPDATE gifts SET budget_mode='free' WHERE id=?").run(id);
    const free = await refreshProduct(db, id, async (url) => metadata(url));
    assert.throws(() => applyProductPrice(db, String(free.id)), /changé/);
  } finally {
    db.close();
  }
});
test("threshold and stock alerts are explicit and deduplicated without changing the funding goal", async () => {
  const db = await fixture(),
    old = process.env.NTFY_URL;
  process.env.NTFY_URL = "https://ntfy.invalid/test";
  try {
    const id = saveGift(db, input);
    saveNotificationPreferences(
      db,
      {
        enabled: true,
        rules: [
          { kind: "offer_changed", channel: "ntfy", frequency: "instant" },
        ],
      },
      owner,
    );
    assert.throws(
      () =>
        savePriceWatch(db, {
          gift_id: id,
          threshold: 2000,
          confirmed_variant: false,
          confirm: true,
        }),
      /Confirmez/,
    );
    savePriceWatch(db, {
      gift_id: id,
      threshold: 2000,
      stock_alert: true,
      confirmed_variant: true,
      confirm: true,
    });
    const observe = (price: number, stock = "in_stock", currency = "EUR") =>
      refreshOfferPrice(db, id, "", async (url) =>
        metadata(url, price, currency, stock),
      );
    await observe(1900, "out_of_stock");
    await observe(1800, "out_of_stock");
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      0,
    );
    await observe(1900, "in_stock");
    await observe(1800, "in_stock");
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      2,
    );
    await observe(100, "in_stock", "USD");
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      2,
    );
    await observe(2200);
    await observe(1900);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      3,
    );
    assert.equal(listGifts(db, true)[0].target, 3000);
    assert.doesNotMatch(
      JSON.stringify(db.prepare("SELECT * FROM notification_jobs").all()),
      /Book|example.org/,
    );
    db.prepare("UPDATE gifts SET visibility='archived' WHERE id=?").run(id);
    let sent = 0;
    await deliverNotifications(db, async () => {
      sent++;
    });
    assert.equal(sent, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      0,
    );
  } finally {
    db.close();
    if (old === undefined) delete process.env.NTFY_URL;
    else process.env.NTFY_URL = old;
  }
});
test("delivered thresholds require known shipping and fresh stock, and can be paused or deleted", async () => {
  const db = await fixture();
  const old = process.env.NTFY_URL;
  process.env.NTFY_URL = "https://ntfy.invalid/test";
  try {
    const gift_id = saveGift(db, {
      ...input,
      offers: [{ url: "https://example.net/book", shipping: 400 }],
    });
    const offer_id = listGifts(db)[0].offers![0].id!;
    saveNotificationPreferences(
      db,
      {
        enabled: true,
        rules: [
          { kind: "offer_changed", channel: "ntfy", frequency: "instant" },
        ],
      },
      owner,
    );
    const config = {
      gift_id,
      threshold: 2000,
      threshold_basis: "delivered",
      confirmed_variant: true,
      confirm: true,
    };
    savePriceWatch(db, config);
    savePriceWatch(db, { ...config, offer_id });
    const alternative = offerIdentity(db, gift_id, offer_id);
    const primary = offerIdentity(db, gift_id);
    const pending = () =>
      db
        .prepare(
          "SELECT COUNT(*) n FROM notification_jobs WHERE state='pending'",
        )
        .get()!.n;
    recordOfferPrice(db, primary, metadata(primary.url, 800), "manual");
    recordOfferPrice(
      db,
      alternative,
      metadata(alternative.url, 800),
      "manual",
      new Date(Date.now() - 72 * 60 * 60 * 1000),
    );
    recordOfferPrice(
      db,
      alternative,
      metadata(alternative.url, 1800),
      "manual",
    );
    assert.equal(pending(), 0);
    recordOfferPrice(
      db,
      alternative,
      metadata(alternative.url, 1600),
      "manual",
    );
    recordOfferPrice(
      db,
      alternative,
      metadata(alternative.url, 1500),
      "manual",
    );
    assert.equal(pending(), 1);
    const quotes = queryWishlist(db, { mode: "owner" }, owner).items[0]
      .offer_observations;
    assert.equal(
      quotes?.find((quote) => quote.offerId === offer_id)?.shipping,
      400,
    );
    updatePriceWatch(db, { gift_id, offer_id, action: "pause", confirm: true });
    assert.equal(
      readPriceHistory(db, gift_id, offer_id).watch?.paused,
      "manual",
    );
    assert.equal(pending(), 0);
    updatePriceWatch(db, {
      gift_id,
      offer_id,
      action: "delete",
      confirm: true,
    });
    assert.equal(readPriceHistory(db, gift_id, offer_id).watch, null);
    assert.equal(readPriceHistory(db, gift_id, offer_id).items.length, 4);
    assert.equal(
      readPriceHistory(db, gift_id).watch?.threshold_basis,
      "delivered",
    );
  } finally {
    db.close();
    if (old === undefined) delete process.env.NTFY_URL;
    else process.env.NTFY_URL = old;
  }
});
test("optional polling respects durable host and instance quotas and stops on any refusal", async () => {
  const db = await fixture(),
    now = new Date(Date.now() + 1000);
  try {
    const ids = Array.from({ length: 3 }, (_, i) =>
      saveGift(db, { ...input, url: `https://example.org/book-${i}` }),
    );
    for (const id of ids)
      savePriceWatch(db, {
        gift_id: id,
        automatic: true,
        confirmed_variant: true,
        confirm: true,
      });
    let calls = 0;
    const extract = async (url: string) => {
      calls++;
      return metadata(url);
    };
    await pollPriceWatches(db, extract, now);
    await pollPriceWatches(db, extract, now);
    await pollPriceWatches(db, extract, now);
    assert.equal(calls, 2);
    const future = new Date(now.getTime() + 3600000);
    await pollPriceWatches(
      db,
      async () => {
        calls++;
        throw new Error("HTTP 403 CAPTCHA");
      },
      future,
    );
    assert.equal(calls, 3);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM price_watches WHERE automatic=0 AND paused='source_unavailable'",
        )
        .get()!.n,
      1,
    );
    await pollPriceWatches(db, extract, future);
    assert.equal(calls, 3);
    db.prepare(
      "UPDATE price_poll_usage SET count=20 WHERE scope='instance'",
    ).run();
    db.exec("UPDATE price_watches SET next_check=0");
    await pollPriceWatches(db, extract, future);
    assert.equal(calls, 3);
    db.exec("UPDATE price_poll_usage SET count=0");
    db.prepare("UPDATE gifts SET model='Different'").run();
    await pollPriceWatches(db, extract, new Date(future.getTime() + 3600000));
    assert.equal(calls, 3);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM price_watches WHERE automatic=1")
        .get()!.n,
      0,
    );
  } finally {
    db.close();
  }
});
test("price history is bounded and never treats missing or malformed currency as a comparable price", async () => {
  const db = await fixture();
  try {
    const id = saveGift(db, input),
      now = new Date();
    await refreshOfferPrice(
      db,
      id,
      "",
      async (url) => metadata(url),
      "manual",
      new Date(now.getTime() - 181 * 86400000),
    );
    for (let i = 0; i < 105; i++)
      await refreshOfferPrice(
        db,
        id,
        "",
        async (url) => metadata(url, i),
        "manual",
        new Date(now.getTime() + i),
      );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM offer_price_history").get()!.n,
      100,
    );
    const bad = await refreshOfferPrice(db, id, "", async (url) =>
      metadata(url, 100, "NOT_A_CURRENCY"),
    );
    assert.equal(bad.state, "uncertain");
    assert.equal(bad.currency, "");
  } finally {
    db.close();
  }
});
