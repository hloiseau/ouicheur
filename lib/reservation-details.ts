import type { DatabaseSync } from "node:sqlite";
import { AppError } from "./validation.ts";
export type ReservedDetails = {
  title: string;
  url: string;
  size: string;
  color: string;
  model: string;
  variant_note: string;
  variant_policy: string;
  kind: string;
  time_hint: string;
  offer_id: string | null;
  offer_note: string;
  condition: string;
};
export function captureReservationDetails(
  db: DatabaseSync,
  giftId: string,
  offerId: string | null,
): ReservedDetails {
  const g = db
    .prepare(
      "SELECT title,url,size,color,model,variant_note,variant_policy,kind,time_hint FROM gifts WHERE id=?",
    )
    .get(giftId);
  if (!g) throw new AppError("Cadeau introuvable.", 404);
  const offer = offerId
    ? db
        .prepare(
          "SELECT url,note,condition FROM gift_offers WHERE id=? AND gift_id=?",
        )
        .get(offerId, giftId)
    : null;
  return buildReservationDetails(
    g as Omit<ReservedDetails, "offer_id" | "offer_note" | "condition">,
    offerId,
    offer as { url: string; note: string; condition: string } | undefined,
  );
}
export function buildReservationDetails(
  g: Omit<ReservedDetails, "offer_id" | "offer_note" | "condition">,
  offerId: string | null,
  offer?: { url: string; note: string; condition: string } | null,
): ReservedDetails {
  if (offerId && !offer) throw new AppError("Offre inconnue.", 404);
  return {
    ...g,
    url: offer ? offer.url : g.url,
    offer_id: offerId,
    offer_note: offer?.note || "",
    condition: offer?.condition || "",
  } as ReservedDetails;
}
export function reservationDetails(
  db: DatabaseSync,
  giftId: string,
  raw: string,
) {
  if (!raw) return { details: null, details_changed: false };
  const details = JSON.parse(raw) as ReservedDetails;
  let changed = true;
  try {
    changed =
      JSON.stringify(
        captureReservationDetails(db, giftId, details.offer_id),
      ) !== raw;
  } catch {
    /* A removed offer also needs a new check. */
  }
  return { details, details_changed: changed };
}
