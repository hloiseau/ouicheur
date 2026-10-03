import type { DatabaseSync } from "node:sqlite";
import type { Access } from "./lists.ts";
import { sessionAccount, hashToken } from "./auth.ts";
import { atomic, audit } from "./db.ts";
import { AppError } from "./validation.ts";

// The recipient remains the recipient in the public preview. Access to a list
// and the choice to reveal its activity are independent decisions.
export function hiddenSurpriseLists(db: DatabaseSync, access: Access) {
  if (!(access.recipient ?? access.owner) || access.revealSurprises) return [];
  return db
    .prepare("SELECT id FROM lists WHERE surprise_mode=1")
    .all()
    .map((row) => String(row.id))
    .filter(
      (id) =>
        access.recipientLists === undefined ||
        access.recipientLists.includes(id),
    );
}

export function requireSurpriseReveal(
  db: DatabaseSync,
  access: Access,
  listId?: string,
) {
  const hidden = hiddenSurpriseLists(db, access);
  if (listId ? hidden.includes(listId) : hidden.length > 0)
    throw new AppError(
      "Révélez les surprises pour cette session avant d’ouvrir ces informations ou de modifier cette envie.",
      409,
    );
}

export function setSurpriseReveal(
  db: DatabaseSync,
  token: string,
  reveal: boolean,
) {
  const account = sessionAccount(db, token);
  if (!account) throw new AppError("Connexion administrateur requise.", 401);
  atomic(db, () => {
    db.prepare("UPDATE sessions SET surprises_revealed=? WHERE hash=?").run(
      Number(reveal),
      hashToken(token),
    );
    audit(
      db,
      reveal ? "surprise.reveal" : "surprise.hide",
      account.memberId || "1",
    );
  });
}

export function reservationNotificationHidden(db: DatabaseSync, id: string) {
  const row = db
    .prepare(
      "SELECT l.surprise_mode FROM reservations r JOIN gifts g ON g.id=r.gift_id JOIN lists l ON l.id=g.list_id WHERE r.id=?",
    )
    .get(id);
  return !row || !!row.surprise_mode;
}
