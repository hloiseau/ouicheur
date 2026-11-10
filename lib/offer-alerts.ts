import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { listLists, type Access } from "./lists.ts";
import { hiddenSurpriseLists } from "./surprise.ts";
import {
  offerFingerprint,
  priceObservationMaxAge,
} from "./offer-observations.ts";

export type OfferAlert = {
  id: string;
  listId: string;
  giftId: string;
  title: string;
  kind: "price" | "stock";
  url: string;
  merchant: string;
  price: number | null;
  shipping: number | null;
  currency: string;
  checkedAt: string;
};
const alertRows = `SELECT a.id,a.list_id AS listId,a.event_kind AS kind,
    h.gift_id AS giftId,g.title,h.url,h.hostname AS merchant,h.price,h.shipping,h.currency,
    h.checked_at AS checkedAt,h.fingerprint,
    g.size,g.color,g.model,CASE WHEN h.offer_id='' THEN g.url ELSE o.url END current_url,
    CASE WHEN h.offer_id='' THEN g.currency ELSE o.currency END current_currency,
    CASE WHEN h.offer_id='' THEN 'primary' ELSE o.condition END current_condition
  FROM offer_alert_events a
  JOIN offer_price_history h ON h.id=a.observation_id
  JOIN gifts g ON g.id=h.gift_id AND g.list_id=a.list_id AND g.visibility='visible'
  JOIN lists l ON l.id=a.list_id AND l.archived=0
  LEFT JOIN gift_offers o ON o.gift_id=h.gift_id AND o.id=h.offer_id
  WHERE (h.offer_id='' OR o.id IS NOT NULL)`;

export function recordOfferAlert(
  db: DatabaseSync,
  observationId: string,
  listId: string,
  kind: OfferAlert["kind"],
) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO offer_alert_events(id,observation_id,list_id,event_kind) VALUES (?,?,?,?)",
  ).run(id, observationId, listId, kind);
  return id;
}

function matchingAlert(row: Record<string, unknown>): OfferAlert | undefined {
  const {
    fingerprint,
    current_url,
    current_currency,
    current_condition,
    size,
    color,
    model,
    ...alert
  } = row;
  try {
    if (
      offerFingerprint(
        String(current_url),
        { size: String(size), color: String(color), model: String(model) },
        String(current_condition),
        String(current_currency),
      ) !== fingerprint
    )
      return;
    return alert as OfferAlert;
  } catch {
    return;
  }
}

export function readOfferAlerts(db: DatabaseSync, access: Access) {
  const hidden = hiddenSurpriseLists(db, access);
  const lists = listLists(db, access)
    .filter(
      (list) =>
        (access.owner || access.managedLists?.includes(list.id)) &&
        !hidden.includes(list.id),
    )
    .map((list) => list.id);
  if (!lists.length) return [];
  return db
    .prepare(
      `${alertRows} AND a.list_id IN (SELECT value FROM json_each(?))
      ORDER BY h.checked_at DESC,h.rowid DESC,a.id LIMIT 30`,
    )
    .all(JSON.stringify(lists))
    .flatMap((row) => matchingAlert(row) ?? []);
}

export function offerAlertForDelivery(
  db: DatabaseSync,
  id: string,
  giftId: string,
  listId: string,
  now: Date,
) {
  const row = db
    .prepare(
      `${alertRows} AND a.id=? AND h.gift_id=? AND a.list_id=? AND h.checked_at>=?
       AND EXISTS (
         SELECT 1 FROM price_watches w
         JOIN offer_price_history recent ON recent.rowid=(
           SELECT rowid FROM offer_price_history
           WHERE gift_id=h.gift_id AND offer_id=h.offer_id AND fingerprint=h.fingerprint
           ORDER BY checked_at DESC,rowid DESC LIMIT 1
         )
         WHERE w.gift_id=h.gift_id AND w.offer_id=h.offer_id AND w.fingerprint=h.fingerprint
           AND w.paused='' AND w.confirmed_variant=1 AND recent.state='ok' AND recent.availability='in_stock'
           AND CASE a.event_kind WHEN 'stock' THEN w.stock_alert=1 ELSE
             CASE w.threshold_basis WHEN 'delivered' THEN
               recent.shipping=o.shipping AND recent.price+recent.shipping<=w.threshold
             ELSE recent.price<=w.threshold END
           END
       )`,
    )
    .get(
      id,
      giftId,
      listId,
      new Date(now.getTime() - priceObservationMaxAge).toISOString(),
    );
  return row ? matchingAlert(row) : undefined;
}

export function formatOfferAlert(alert: OfferAlert, timeZone: string) {
  const money = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: alert.currency,
  });
  const date = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
  return [
    `${alert.kind === "price" ? "Target price reached" : "Back in stock"} · ${alert.merchant}`,
    alert.price === null
      ? "Price unverified"
      : `Verified unit price: ${money.format(alert.price / 100)}`,
    alert.shipping === null
      ? "Shipping unknown"
      : `Shipping: ${money.format(alert.shipping / 100)}`,
    `Checked: ${date.format(new Date(alert.checkedAt))}`,
    alert.url,
  ].join("\n");
}
