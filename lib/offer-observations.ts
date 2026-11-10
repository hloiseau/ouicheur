import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Gift } from "./gifts.ts";
import type { WishDetails } from "./wish-details.ts";
import { canonicalUrl } from "./validation.ts";

export const priceObservationMaxAge = 48 * 60 * 60 * 1000;
export type PricePoint = { price: number; checkedAt: string };

export type OfferObservation = {
  offerId: string;
  merchant: string;
  currency: string;
  price: number | null;
  shipping: number | null;
  availability: string;
  checkedAt: string;
  priceCheckedAt: string | null;
  verified: boolean;
  stale: boolean;
  promotion?: { referencePrice: number; expiresAt: string | null };
  observedDrop?: { previousPrice: number; checkedAt: string };
};

export function offerFingerprint(
  url: string,
  variant: Pick<WishDetails, "size" | "color" | "model">,
  condition: string,
  currency: string,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        canonicalUrl(url),
        ...[variant.size, variant.color, variant.model].map((v) =>
          (v ?? "").trim().toLowerCase(),
        ),
        condition,
        currency,
      ]),
    )
    .digest("hex");
}

// Read history only for the already authorized, paginated gifts.
export function withOfferObservations(
  db: DatabaseSync,
  gifts: Gift[],
  now = Date.now(),
) {
  const offers = gifts.flatMap((gift) =>
    [
      ...(gift.url
        ? [
            {
              id: "",
              url: gift.url,
              condition: "primary",
              currency: gift.currency,
            },
          ]
        : []),
      ...(gift.offers ?? []),
    ].flatMap(({ id, url, condition, currency }) => {
      if (id === undefined) return [];
      try {
        return [
          {
            gift: gift.id,
            id,
            fingerprint: offerFingerprint(url, gift, condition, currency),
          },
        ];
      } catch {
        return []; // A malformed legacy link has no comparable offer.
      }
    }),
  );
  if (!offers.length) return gifts;

  const rows = db
    .prepare(
      `
    WITH wanted AS (
      SELECT key position, json_extract(value, '$.gift') gift_id,
             json_extract(value, '$.id') offer_id,
             json_extract(value, '$.fingerprint') fingerprint
      FROM json_each(?)
    )
    SELECT wanted.gift_id, wanted.offer_id, latest.hostname,
           latest.state, latest.availability, latest.checked_at,
           latest.price latest_price, priced.price,
           COALESCE(priced.currency, latest.currency) currency,
           CASE WHEN priced.rowid IS NOT NULL THEN priced.shipping
                WHEN latest.state='ok' THEN latest.shipping END shipping,
           priced.checked_at price_checked_at, priced.reference_price, priced.promotion_expires_at,
           earlier.price earlier_price, earlier.checked_at earlier_checked_at
    FROM wanted
    JOIN offer_price_history latest ON latest.rowid=(
      SELECT rowid FROM offer_price_history
      WHERE gift_id=wanted.gift_id AND offer_id=wanted.offer_id AND fingerprint=wanted.fingerprint
      ORDER BY checked_at DESC, rowid DESC LIMIT 1
    )
    LEFT JOIN offer_price_history priced ON priced.rowid=(
      SELECT rowid FROM offer_price_history
      WHERE gift_id=wanted.gift_id AND offer_id=wanted.offer_id AND fingerprint=wanted.fingerprint
        AND state='ok' AND price IS NOT NULL
      ORDER BY checked_at DESC, rowid DESC LIMIT 1
    )
    LEFT JOIN offer_price_history earlier ON earlier.rowid=(
      SELECT rowid FROM offer_price_history
      WHERE gift_id=wanted.gift_id AND offer_id=wanted.offer_id AND fingerprint=wanted.fingerprint
        AND state='ok' AND price IS NOT NULL
        AND (checked_at < priced.checked_at OR (checked_at=priced.checked_at AND rowid < priced.rowid))
      ORDER BY checked_at DESC, rowid DESC LIMIT 1
    )
    ORDER BY wanted.position
  `,
    )
    .all(JSON.stringify(offers));
  const byGift = new Map<string, OfferObservation[]>();
  for (const row of rows) {
    const key = String(row.gift_id);
    const observations = byGift.get(key) ?? [];
    const checkedAt = String(row.checked_at);
    const priceCheckedAt =
      row.price_checked_at === null ? null : String(row.price_checked_at);
    const stale =
      now - Date.parse(priceCheckedAt ?? checkedAt) > priceObservationMaxAge;
    const verified = row.state === "ok" && row.latest_price !== null;
    const price = row.price === null ? null : Number(row.price);
    const expiresAt =
      row.promotion_expires_at === null
        ? null
        : String(row.promotion_expires_at);
    const current =
      verified && !stale && row.availability === "in_stock" && price !== null;
    const promotion =
      current &&
      row.reference_price !== null &&
      (expiresAt === null || Date.parse(expiresAt) > now)
        ? { referencePrice: Number(row.reference_price), expiresAt }
        : undefined;
    const observedDrop =
      current && row.earlier_price !== null && Number(row.earlier_price) > price
        ? {
            previousPrice: Number(row.earlier_price),
            checkedAt: String(row.earlier_checked_at),
          }
        : undefined;
    observations.push({
      offerId: String(row.offer_id),
      merchant: String(row.hostname),
      currency: String(row.currency ?? ""),
      price,
      shipping: row.shipping === null ? null : Number(row.shipping),
      availability: row.state === "ok" ? String(row.availability) : "unknown",
      checkedAt,
      priceCheckedAt,
      verified,
      stale,
      ...(promotion ? { promotion } : {}),
      ...(observedDrop ? { observedDrop } : {}),
    });
    byGift.set(key, observations);
  }
  return gifts.map((gift) => {
    const observations = byGift.get(gift.id);
    return observations ? { ...gift, offer_observations: observations } : gift;
  });
}

export function readOfferSeries(
  db: DatabaseSync,
  gift: Gift,
  now = Date.now(),
) {
  const quote = gift.offer_observations?.[0];
  if (!quote?.priceCheckedAt) return;
  const offer = gift.offers?.find((item) => item.id === quote.offerId);
  const url = offer?.url ?? gift.url;
  const fingerprint = offerFingerprint(
    url,
    gift,
    offer?.condition ?? "primary",
    quote.currency,
  );
  const points = db
    .prepare(
      `SELECT price,checked_at FROM offer_price_history
    WHERE gift_id=? AND offer_id=? AND fingerprint=? AND state='ok' AND price IS NOT NULL AND checked_at>=?
    ORDER BY checked_at DESC,rowid DESC LIMIT 100`,
    )
    .all(
      gift.id,
      quote.offerId,
      fingerprint,
      new Date(now - 180 * 86400000).toISOString(),
    )
    .map((row) => ({
      price: Number(row.price),
      checkedAt: String(row.checked_at),
    }));
  return { merchant: quote.merchant, currency: quote.currency, points };
}
