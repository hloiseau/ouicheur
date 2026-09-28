import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { hashToken } from "./auth.ts";
import { atomic, audit } from "./db.ts";
import { assertGiftAccess, publicAccess, type Access } from "./lists.ts";
import { AppError, dateNow, text } from "./validation.ts";
import { enqueueNotification } from "./notifications.ts";

export const reservedSql = `SELECT COALESCE(SUM(quantity),0) quantity FROM reservations WHERE gift_id=? AND (state='purchased' OR (state='reserved' AND expires_at>?))`;
export function reservedQuantity(db: DatabaseSync, id: string) {
  return Number(db.prepare(reservedSql).get(id, dateNow())!.quantity);
}
export function createReservation(
  db: DatabaseSync,
  input: unknown,
  access: Access = publicAccess,
) {
  const v = z
    .object({
      gift_id: text(64).min(1),
      quantity: z.number().int().min(1).max(999),
    })
    .parse(input);
  return atomic(db, () => {
    assertGiftAccess(db, v.gift_id, access);
    const gift = db.prepare("SELECT * FROM gifts WHERE id=?").get(v.gift_id)!;
    const list = db
      .prepare("SELECT archived FROM lists WHERE id=?")
      .get(gift.list_id)!;
    if (
      gift.closed ||
      gift.purchased ||
      gift.visibility !== "visible" ||
      list.archived
    )
      throw new AppError("Cette envie est fermée.", 409);
    if (
      db
        .prepare(
          "SELECT 1 FROM contributions c LEFT JOIN payments p ON p.contribution_id=c.id WHERE c.gift_id=? AND (p.id IS NOT NULL OR c.state IN ('declared','detected') OR (c.state='intent' AND c.expires_at>?))",
        )
        .get(v.gift_id, dateNow())
    )
      throw new AppError(
        "Des contributions existent déjà pour cette envie. La réservation est indisponible.",
        409,
      );
    if (reservedQuantity(db, v.gift_id) + v.quantity > Number(gift.quantity))
      throw new AppError(
        "Cette quantité vient d’être réservée. Rechargez la page.",
        409,
      );
    const token = randomBytes(32).toString("hex");
    const id = randomUUID();
    db.prepare(
      "INSERT INTO reservations(id,token_hash,gift_id,quantity,created_at,expires_at) VALUES (?,?,?,?,?,?)",
    ).run(
      id,
      hashToken(token),
      v.gift_id,
      v.quantity,
      dateNow(),
      new Date(Date.now() + 14 * 86400000).toISOString(),
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
      "SELECT id,quantity,state,expires_at FROM reservations WHERE token_hash=?",
    )
    .get(hashToken(token));
  if (!row) throw new AppError("Réservation introuvable.", 404);
  return row;
}
export function updateReservation(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  const v = z
    .object({ state: z.enum(["purchased", "cancelled"]) })
    .parse(input);
  return atomic(db, () => {
    const row = reservationStatus(db, token);
    if (row.state === v.state) return;
    if (row.state !== "reserved")
      throw new AppError("Cette réservation n’est plus active.", 409);
    db.prepare("UPDATE reservations SET state=? WHERE id=?").run(
      v.state,
      row.id,
    );
    audit(db, "reservation." + v.state, String(row.id));
  });
}
