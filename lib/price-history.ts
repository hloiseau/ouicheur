import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { atomic } from "./db.ts";
import { AppError, canonicalUrl } from "./validation.ts";
import { extractMetadata } from "./metadata.ts";
import { enqueueNotification } from "./notifications.ts";
import {
  offerFingerprint,
  priceObservationMaxAge,
} from "./offer-observations.ts";
import type { WishDetails } from "./wish-details.ts";
import { recordOfferAlert } from "./offer-alerts.ts";
export function offerIdentity(db: DatabaseSync, giftId: string, offerId = "") {
  const gift = db.prepare("SELECT * FROM gifts WHERE id=?").get(giftId);
  if (!gift) throw new AppError("Envie introuvable.", 404);
  const offer = offerId
    ? db
        .prepare("SELECT * FROM gift_offers WHERE id=? AND gift_id=?")
        .get(offerId, giftId)
    : null;
  if (offerId && !offer) throw new AppError("Offre introuvable.", 404);
  const url = String(offer?.url || gift.url),
    currency = String(offer?.currency || gift.currency);
  if (!url) throw new AppError("Cette envie n’a pas de lien marchand.", 409);
  const fingerprint = offerFingerprint(
    url,
    gift as Pick<WishDetails, "size" | "color" | "model">,
    String(offer?.condition || "primary"),
    currency,
  );
  return {
    giftId,
    offerId,
    listId: String(gift.list_id),
    url,
    currency,
    shipping: offer?.shipping == null ? null : Number(offer.shipping),
    fingerprint,
    archived:
      gift.visibility === "archived" ||
      !!db.prepare("SELECT archived FROM lists WHERE id=?").get(gift.list_id)
        ?.archived,
  };
}
type Identity = ReturnType<typeof offerIdentity>;
type Observation = {
  url: string;
  price: number | null;
  currency: string;
  availability: string;
  promotion?: { referencePrice: number; expiresAt: string | null };
};
export function recordOfferPrice(
  db: DatabaseSync,
  identity: Identity,
  observed: Observation | null,
  method: "manual" | "scheduled",
  now = new Date(),
) {
  return atomic(db, () => {
    let current: Identity | null = null;
    try {
      current = offerIdentity(db, identity.giftId, identity.offerId);
    } catch (error) {
      if (
        method === "scheduled" ||
        !db.prepare("SELECT 1 FROM gifts WHERE id=?").get(identity.giftId)
      )
        throw error;
    }
    if (method === "scheduled" && current?.archived)
      throw new AppError("Envie archivée.", 409);
    if (observed)
      observed = {
        ...observed,
        currency: /^[A-Z]{3}$/.test(observed.currency) ? observed.currency : "",
        availability: [
          "in_stock",
          "out_of_stock",
          "preorder",
          "unknown",
        ].includes(observed.availability)
          ? observed.availability
          : "unknown",
      };
    let sameUrl = false;
    try {
      sameUrl =
        !!observed && canonicalUrl(observed.url) === canonicalUrl(identity.url);
    } catch {}
    const comparable =
      !!observed &&
      !!current &&
      current.fingerprint === identity.fingerprint &&
      sameUrl &&
      observed.currency === identity.currency;
    const state = !observed ? "failed" : comparable ? "ok" : "uncertain",
      id = randomUUID();
    const price =
      observed &&
      Number.isSafeInteger(observed.price) &&
      observed.price! >= 0 &&
      observed.price! <= 100000000
        ? observed.price
        : null;
    const promotion = observed?.promotion;
    const referencePrice =
      comparable &&
      price !== null &&
      promotion &&
      Number.isSafeInteger(promotion.referencePrice) &&
      promotion.referencePrice > price &&
      promotion.referencePrice <= 100000000 &&
      (promotion.expiresAt === null ||
        Date.parse(promotion.expiresAt) > now.getTime())
        ? promotion.referencePrice
        : null;
    db.prepare(
      `INSERT INTO offer_price_history
      (id,gift_id,offer_id,url,hostname,fingerprint,price,currency,shipping,availability,checked_at,state,method,reference_price,promotion_expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      identity.giftId,
      identity.offerId,
      identity.url,
      new URL(identity.url).hostname,
      identity.fingerprint,
      price,
      observed?.currency || "",
      identity.shipping,
      observed?.availability || "unknown",
      now.toISOString(),
      state,
      method,
      referencePrice,
      referencePrice !== null ? promotion!.expiresAt : null,
    );
    const watch = db
      .prepare("SELECT * FROM price_watches WHERE gift_id=? AND offer_id=?")
      .get(identity.giftId, identity.offerId);
    if (
      watch &&
      watch.fingerprint === identity.fingerprint &&
      watch.confirmed_variant &&
      !watch.paused &&
      !current?.archived &&
      comparable
    ) {
      const delivered = watch.threshold_basis === "delivered";
      const shipping = delivered ? identity.shipping : 0;
      const comparablePrice =
        price !== null &&
        shipping !== null &&
        observed!.availability === "in_stock" &&
        now.getTime() >= Date.now() - priceObservationMaxAge &&
        (!delivered || shipping === current?.shipping)
          ? price + shipping
          : null;
      const key = `${identity.fingerprint}:${watch.threshold}${delivered ? ":delivered" : ""}`,
        day = now.toISOString().slice(0, 10);
      if (
        comparablePrice !== null &&
        watch.threshold !== null &&
        comparablePrice <= Number(watch.threshold) &&
        watch.last_price_alert !== key
      ) {
        enqueueNotification(db, "offer_changed", `price:${id}`, {
          listId: identity.listId,
          sourceKey: identity.giftId,
          now,
          offerAlertId: recordOfferAlert(db, id, identity.listId, "price"),
        });
        db.prepare(
          "UPDATE price_watches SET last_price_alert=? WHERE gift_id=? AND offer_id=?",
        ).run(key, identity.giftId, identity.offerId);
      }
      if (
        comparablePrice !== null &&
        watch.threshold !== null &&
        comparablePrice > Number(watch.threshold)
      )
        db.prepare(
          "UPDATE price_watches SET last_price_alert='' WHERE gift_id=? AND offer_id=?",
        ).run(identity.giftId, identity.offerId);
      if (watch.stock_alert && observed!.availability === "in_stock") {
        const previous = db
          .prepare(
            "SELECT availability FROM offer_price_history WHERE gift_id=? AND offer_id=? AND fingerprint=? AND state='ok' AND availability IN ('in_stock','out_of_stock') AND id<>? ORDER BY checked_at DESC,rowid DESC LIMIT 1",
          )
          .get(identity.giftId, identity.offerId, identity.fingerprint, id);
        if (
          previous?.availability === "out_of_stock" &&
          watch.last_stock_alert !== day
        ) {
          enqueueNotification(
            db,
            "offer_changed",
            `stock:${identity.giftId}:${identity.offerId}:${day}`,
            {
              listId: identity.listId,
              sourceKey: identity.giftId,
              now,
              offerAlertId: recordOfferAlert(db, id, identity.listId, "stock"),
            },
          );
          db.prepare(
            "UPDATE price_watches SET last_stock_alert=? WHERE gift_id=? AND offer_id=?",
          ).run(day, identity.giftId, identity.offerId);
        }
      }
    }
    if (watch && state !== "ok" && method === "scheduled")
      db.prepare(
        "UPDATE price_watches SET automatic=0,paused=? WHERE gift_id=? AND offer_id=?",
      ).run(
        state === "failed" ? "source_unavailable" : "identity_changed",
        identity.giftId,
        identity.offerId,
      );
    db.prepare(
      "DELETE FROM offer_price_history WHERE gift_id=? AND offer_id=? AND (checked_at<? OR id IN (SELECT id FROM offer_price_history WHERE gift_id=? AND offer_id=? ORDER BY checked_at DESC,rowid DESC LIMIT -1 OFFSET 100))",
    ).run(
      identity.giftId,
      identity.offerId,
      new Date(now.getTime() - 180 * 86400000).toISOString(),
      identity.giftId,
      identity.offerId,
    );
    return db.prepare("SELECT * FROM offer_price_history WHERE id=?").get(id)!;
  });
}
export async function refreshOfferPrice(
  db: DatabaseSync,
  giftId: string,
  offerId = "",
  extract = extractMetadata,
  method: "manual" | "scheduled" = "manual",
  now = new Date(),
) {
  const identity = offerIdentity(db, giftId, offerId);
  let observation: Observation | null = null;
  try {
    observation = await extract(identity.url);
  } catch {
    /* No retries or bypass. */
  }
  return recordOfferPrice(db, identity, observation, method, now);
}
export function readPriceHistory(
  db: DatabaseSync,
  giftId: string,
  offerId = "",
) {
  const identity = offerIdentity(db, giftId, offerId);
  const row = db
    .prepare("SELECT * FROM price_watches WHERE gift_id=? AND offer_id=?")
    .get(giftId, offerId);
  return {
    identity,
    watch: row
      ? {
          ...row,
          paused: String(row.paused),
          threshold_basis:
            row.threshold_basis === "delivered" ? "delivered" : "price",
          stale: row.fingerprint !== identity.fingerprint,
        }
      : null,
    items: db
      .prepare(
        "SELECT id,url,price,currency,shipping,availability,checked_at,state,method,fingerprint FROM offer_price_history WHERE gift_id=? AND offer_id=? ORDER BY checked_at DESC,rowid DESC LIMIT 100",
      )
      .all(giftId, offerId),
  };
}
export function savePriceWatch(db: DatabaseSync, input: unknown) {
  const v = z
    .object({
      gift_id: z.uuid(),
      offer_id: z.union([z.uuid(), z.literal("")]).default(""),
      threshold: z
        .number()
        .int()
        .min(0)
        .max(100000000)
        .nullable()
        .default(null),
      stock_alert: z.boolean().default(false),
      threshold_basis: z.enum(["price", "delivered"]).default("price"),
      automatic: z.boolean().default(false),
      confirmed_variant: z.boolean(),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  const identity = offerIdentity(db, v.gift_id, v.offer_id);
  if (
    (v.automatic || v.stock_alert || v.threshold !== null) &&
    !v.confirmed_variant
  )
    throw new AppError(
      "Confirmez que ce lien correspond à la variante choisie.",
    );
  db.prepare(
    "INSERT INTO price_watches(gift_id,offer_id,fingerprint,currency,threshold,threshold_basis,stock_alert,automatic,confirmed_variant,next_check) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(gift_id,offer_id) DO UPDATE SET fingerprint=excluded.fingerprint,currency=excluded.currency,threshold=excluded.threshold,threshold_basis=excluded.threshold_basis,stock_alert=excluded.stock_alert,automatic=excluded.automatic,confirmed_variant=excluded.confirmed_variant,paused='',next_check=MAX(price_watches.next_check,excluded.next_check),last_price_alert=CASE WHEN price_watches.threshold IS excluded.threshold AND price_watches.threshold_basis=excluded.threshold_basis AND price_watches.fingerprint=excluded.fingerprint THEN price_watches.last_price_alert ELSE '' END,last_stock_alert=CASE WHEN price_watches.fingerprint=excluded.fingerprint THEN price_watches.last_stock_alert ELSE '' END",
  ).run(
    v.gift_id,
    v.offer_id,
    identity.fingerprint,
    identity.currency,
    v.threshold,
    v.threshold_basis,
    Number(v.stock_alert),
    Number(v.automatic),
    Number(v.confirmed_variant),
    Date.now(),
  );
}
export function updatePriceWatch(db: DatabaseSync, input: unknown) {
  const { gift_id, offer_id, action } = z
    .object({
      gift_id: z.uuid(),
      offer_id: z.union([z.uuid(), z.literal("")]).default(""),
      action: z.enum(["pause", "delete"]),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    if (action === "pause")
      db.prepare(
        "UPDATE price_watches SET paused='manual' WHERE gift_id=? AND offer_id=?",
      ).run(gift_id, offer_id);
    else
      db.prepare(
        "DELETE FROM price_watches WHERE gift_id=? AND offer_id=?",
      ).run(gift_id, offer_id);
    db.prepare(
      `DELETE FROM notification_jobs
      WHERE kind='offer_changed' AND state='pending' AND source_key=? AND (
        event_key LIKE ? OR EXISTS (
          SELECT 1 FROM offer_price_history h WHERE h.gift_id=? AND h.offer_id=?
            AND notification_jobs.event_key LIKE 'offer_changed:price:' || h.id || ':%'
        )
      )`,
    ).run(
      gift_id,
      `offer_changed:stock:${gift_id}:${offer_id}:%`,
      gift_id,
      offer_id,
    );
  });
}
export async function pollPriceWatches(
  db: DatabaseSync,
  extract = extractMetadata,
  now = new Date(),
) {
  // Only one automatic request per maintenance tick; durable daily/host quotas.
  const watch = atomic(db, () => {
    const day = now.toISOString().slice(0, 10),
      hour = now.toISOString().slice(0, 13);
    db.prepare("DELETE FROM price_poll_usage WHERE bucket<?").run(
      new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10),
    );
    if (
      Number(
        db
          .prepare(
            "SELECT count FROM price_poll_usage WHERE scope='instance' AND bucket=?",
          )
          .get(day)?.count || 0,
      ) >= 20
    )
      return null;
    const rows = db
      .prepare(
        "SELECT * FROM price_watches WHERE automatic=1 AND confirmed_variant=1 AND paused='' AND next_check<=? ORDER BY next_check,gift_id,offer_id LIMIT 50",
      )
      .all(now.getTime());
    for (const row of rows) {
      let identity: Identity;
      try {
        identity = offerIdentity(db, String(row.gift_id), String(row.offer_id));
      } catch {
        db.prepare(
          "DELETE FROM price_watches WHERE gift_id=? AND offer_id=?",
        ).run(row.gift_id, row.offer_id);
        continue;
      }
      if (identity.fingerprint !== row.fingerprint || identity.archived) {
        db.prepare(
          "UPDATE price_watches SET automatic=0,paused='identity_changed' WHERE gift_id=? AND offer_id=?",
        ).run(row.gift_id, row.offer_id);
        continue;
      }
      const scope = `host:${new URL(identity.url).hostname}`;
      if (
        Number(
          db
            .prepare(
              "SELECT count FROM price_poll_usage WHERE scope=? AND bucket=?",
            )
            .get(scope, hour)?.count || 0,
        ) >= 2
      )
        continue;
      for (const [key, bucket] of [
        ["instance", day],
        [scope, hour],
      ])
        db.prepare(
          "INSERT INTO price_poll_usage VALUES (?,?,1) ON CONFLICT(scope,bucket) DO UPDATE SET count=count+1",
        ).run(key, bucket);
      db.prepare(
        "UPDATE price_watches SET next_check=? WHERE gift_id=? AND offer_id=?",
      ).run(now.getTime() + 86400000, row.gift_id, row.offer_id);
      return row;
    }
    return null;
  });
  if (watch) {
    try {
      await refreshOfferPrice(
        db,
        String(watch.gift_id),
        String(watch.offer_id),
        extract,
        "scheduled",
        now,
      );
    } catch (error) {
      if (!(error instanceof AppError) || ![404, 409].includes(error.status))
        throw error;
    }
  }
}
