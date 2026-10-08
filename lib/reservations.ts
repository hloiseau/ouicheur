import {
  captureReservationDetails,
  reservationDetails,
} from "./reservation-details.ts";
import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hashToken } from "./auth.ts";
import { atomic, audit } from "./db.ts";
import { publicAccess, type Access } from "./lists.ts";
import { AppError, dateNow } from "./validation.ts";
import { enqueueNotification } from "./notifications.ts";
import { readParticipationGift } from "./participation-sqlite-context.ts";
import {
  reservationSchema,
  reservationStateSchema,
  reservationDecision,
  reservationStateDecision,
  type ReservationCommand,
} from "./participation.ts";

export const reservedSql = `SELECT COALESCE(SUM(quantity),0) quantity FROM reservations WHERE gift_id=? AND (state='purchased' OR (state='reserved' AND expires_at>?))`;
export function reservedQuantity(db: DatabaseSync, id: string) {
  return Number(db.prepare(reservedSql).get(id, dateNow())!.quantity);
}
export function createReservation(
  db: DatabaseSync,
  input: unknown,
  access: Access = publicAccess,
) {
  return createReservationCommand(db, reservationSchema.parse(input), access);
}
export function createReservationCommand(
  db: DatabaseSync,
  v: ReservationCommand,
  access: Access,
) {
  return atomic(db, () => {
    const gift = readParticipationGift(db, v.gift_id, access);
    const hasContributions = !!db
      .prepare(
        "SELECT 1 FROM contributions c LEFT JOIN payments p ON p.contribution_id=c.id WHERE c.gift_id=? AND (p.id IS NOT NULL OR c.state IN ('declared','detected') OR (c.state='intent' AND (c.method='pledge' OR c.expires_at>?)))",
      )
      .get(v.gift_id, dateNow());
    reservationDecision(
      gift,
      v.quantity,
      reservedQuantity(db, v.gift_id),
      hasContributions,
    );
    const token = randomBytes(32).toString("hex");
    const id = randomUUID();
    db.prepare(
      "INSERT INTO reservations(id,token_hash,gift_id,quantity,created_at,expires_at,details_snapshot) VALUES (?,?,?,?,?,?,?)",
    ).run(
      id,
      hashToken(token),
      v.gift_id,
      v.quantity,
      dateNow(),
      new Date(Date.now() + 14 * 86400000).toISOString(),
      JSON.stringify(captureReservationDetails(db, v.gift_id, v.offer_id)),
    );
    audit(db, "reservation.create", id, {
      gift_id: v.gift_id,
      quantity: v.quantity,
    });
    enqueueNotification(db, "reservation", id);
    return { token };
  });
}
export function reservationStatus(db: DatabaseSync, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError("Réservation introuvable.", 404);
  db.prepare(
    "UPDATE reservations SET state='expired' WHERE state='reserved' AND expires_at<=?",
  ).run(dateNow());
  const row = db
    .prepare(
      "SELECT id,gift_id,details_snapshot,quantity,state,expires_at FROM reservations WHERE token_hash=?",
    )
    .get(hashToken(token));
  if (!row) throw new AppError("Réservation introuvable.", 404);
  return {
    id: String(row.id),
    quantity: Number(row.quantity),
    state: String(row.state),
    expires_at: String(row.expires_at),
    ...reservationDetails(
      db,
      String(row.gift_id),
      String(row.details_snapshot),
    ),
  };
}
export function updateReservation(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  const v = reservationStateSchema.parse(input);
  return atomic(db, () => {
    const row = reservationStatus(db, token);
    updateReservationById(db, row.id, v.state);
  });
}
// Caller has proved possession of the token or an explicitly saved account mapping.
// Runs inside the caller's transaction; never grants access to the current list.
export function updateReservationById(
  db: DatabaseSync,
  id: string,
  state: "purchased" | "cancelled",
) {
  const row = db
    .prepare("SELECT state,expires_at FROM reservations WHERE id=?")
    .get(id);
  if (
    !reservationStateDecision(
      row as { state: string; expires_at: string } | undefined,
      state,
      dateNow(),
    )
  )
    return;
  db.prepare("UPDATE reservations SET state=? WHERE id=?").run(state, id);
  audit(db, "reservation." + state, id);
}
