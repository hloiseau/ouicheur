import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { hashToken, sessionAccount } from "./auth.ts";
import { atomic } from "./db.ts";
import { AppError, dateNow, text } from "./validation.ts";
import { updateReservationById } from "./reservations.ts";
import type { ReservedDetails } from "./reservation-details.ts";
function accountId(db: DatabaseSync, token: string) {
  const account = sessionAccount(db, token);
  if (!account)
    throw new AppError("Votre session a expiré. Reconnectez-vous.", 401);
  return account.memberId || "owner";
}
export function saveDonorReservation(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  const account = accountId(db, token),
    v = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        confirm: z.literal(true),
      })
      .strict()
      .parse(input);
  return atomic(db, () => {
    const row = db
      .prepare("SELECT id FROM reservations WHERE token_hash=?")
      .get(hashToken(v.token));
    if (!row) throw new AppError("Réservation introuvable.", 404);
    const previous = db
      .prepare(
        "SELECT account_id FROM donor_reservations WHERE reservation_id=?",
      )
      .get(row.id);
    if (previous && previous.account_id !== account)
      throw new AppError(
        "Cette réservation est déjà rattachée à un autre compte.",
        409,
      );
    if (
      !previous &&
      Number(
        db
          .prepare(
            "SELECT COUNT(*) n FROM donor_reservations WHERE account_id=?",
          )
          .get(account)!.n,
      ) >= 500
    )
      throw new AppError(
        "Retirez d’anciens suivis avant d’en ajouter de nouveaux.",
        409,
      );
    db.prepare("INSERT OR IGNORE INTO donor_reservations VALUES (?,?,?)").run(
      row.id,
      account,
      dateNow(),
    );
  });
}
export function donorReservations(db: DatabaseSync, token: string, page = 0) {
  const account = accountId(db, token);
  z.number().int().min(0).max(100).parse(page);
  db.prepare(
    "UPDATE reservations SET state='expired' WHERE state='reserved' AND expires_at<=?",
  ).run(dateNow());
  const rows = db
    .prepare(
      "SELECT r.id,r.quantity,r.state,r.expires_at,r.details_snapshot FROM donor_reservations d JOIN reservations r ON r.id=d.reservation_id WHERE d.account_id=? ORDER BY d.saved_at DESC,r.id LIMIT 50 OFFSET ?",
    )
    .all(account, page * 50);
  // Only the original snapshot is returned, even after sharing is revoked.
  return {
    items: rows.map(({ details_snapshot, ...row }) => ({
      id: String(row.id),
      quantity: Number(row.quantity),
      state: String(row.state),
      expires_at: String(row.expires_at),
      details: details_snapshot
        ? (JSON.parse(String(details_snapshot)) as ReservedDetails)
        : null,
    })),
    total: Number(
      db
        .prepare("SELECT COUNT(*) n FROM donor_reservations WHERE account_id=?")
        .get(account)!.n,
    ),
    page,
  };
}
export function changeDonorReservation(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  const account = accountId(db, token),
    v = z
      .object({
        id: z.uuid(),
        action: z.enum(["purchased", "cancelled", "forget"]),
        confirm: z.literal(true),
      })
      .strict()
      .parse(input);
  atomic(db, () => {
    if (
      !db
        .prepare(
          "SELECT 1 FROM donor_reservations WHERE reservation_id=? AND account_id=?",
        )
        .get(v.id, account)
    )
      throw new AppError("Réservation introuvable.", 404);
    if (v.action === "forget")
      db.prepare(
        "DELETE FROM donor_reservations WHERE reservation_id=? AND account_id=?",
      ).run(v.id, account);
    else updateReservationById(db, v.id, v.action);
  });
}
function recipientAllowed(db: DatabaseSync, account: string, giftId: string) {
  return !!db
    .prepare(
      "SELECT 1 FROM gifts g JOIN lists l ON l.id=g.list_id LEFT JOIN family_profiles p ON p.id=l.profile_id WHERE g.id=? AND (?='owner' OR (COALESCE(p.recipient,'owner')=? AND EXISTS(SELECT 1 FROM member_lists ml WHERE ml.member_id=? AND ml.list_id=l.id)))",
    )
    .get(giftId, account, account, account);
}
export function receivedGifts(
  db: DatabaseSync,
  token: string,
  page = 0,
  query = "",
) {
  const account = accountId(db, token);
  z.number().int().min(0).max(100000).parse(page);
  query = text(160).parse(query);
  const where =
    "WHERE (?='owner' OR (COALESCE(p.recipient,'owner')=? AND EXISTS(SELECT 1 FROM member_lists ml WHERE ml.member_id=? AND ml.list_id=l.id))) AND (?='' OR instr(lower(g.title),lower(?))>0)";
  const args = [account, account, account, query, query];
  return {
    items: db
      .prepare(
        `SELECT g.id,g.title,l.name list_name,COALESCE(r.received,0) received,COALESCE(r.received_on,'') received_on,COALESCE(r.note,'') note,COALESCE(r.thanks,'') thanks,COALESCE(r.thanked,0) thanked FROM gifts g JOIN lists l ON l.id=g.list_id LEFT JOIN family_profiles p ON p.id=l.profile_id LEFT JOIN received_gifts r ON r.gift_id=g.id AND r.account_id=? ${where} ORDER BY COALESCE(r.updated_at,g.created_at) DESC,g.id LIMIT 50 OFFSET ?`,
      )
      .all(account, ...args, page * 50),
    total: Number(
      db
        .prepare(
          `SELECT COUNT(*) n FROM gifts g JOIN lists l ON l.id=g.list_id LEFT JOIN family_profiles p ON p.id=l.profile_id ${where}`,
        )
        .get(...args)!.n,
    ),
    page,
  };
}
export function saveReceivedGift(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  const account = accountId(db, token),
    v = z
      .object({
        gift_id: z.uuid(),
        received: z.boolean(),
        received_on: z.union([z.literal(""), z.iso.date()]).default(""),
        note: text(2000).default(""),
        thanks: text(2000).default(""),
        thanked: z.boolean().default(false),
        remove: z.boolean().default(false),
      })
      .strict()
      .parse(input);
  atomic(db, () => {
    if (!recipientAllowed(db, account, v.gift_id))
      throw new AppError("Envie introuvable.", 404);
    if (v.remove)
      db.prepare(
        "DELETE FROM received_gifts WHERE gift_id=? AND account_id=?",
      ).run(v.gift_id, account);
    else
      db.prepare(
        "INSERT INTO received_gifts VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(gift_id,account_id) DO UPDATE SET received=excluded.received,received_on=excluded.received_on,note=excluded.note,thanks=excluded.thanks,thanked=excluded.thanked,updated_at=excluded.updated_at",
      ).run(
        v.gift_id,
        account,
        Number(v.received),
        v.received ? v.received_on : "",
        v.note,
        v.thanks,
        Number(v.thanked),
        dateNow(),
      );
    // No journal text or donor identity is copied to audit, public gifts or notifications.
  });
}
