import type { DatabaseSync } from "node:sqlite";
import { atomic, audit } from "./db.ts";
import {
  sessionAccount,
  createSession,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./auth.ts";
import { AppError } from "./validation.ts";

export type SessionSummary = {
  id: string;
  current: boolean;
  device: string;
  created_at: string | null;
  last_seen: string | null;
  expires_at: string;
};
function requireSession(db: DatabaseSync, token: string) {
  const account = sessionAccount(db, token);
  if (!account)
    throw new AppError("Votre session a expiré. Reconnectez-vous.", 401);
  return { hash: hashToken(token), memberId: account.memberId };
}
export function touchSession(db: DatabaseSync, token: string) {
  const now = Date.now();
  db.prepare(
    "UPDATE sessions SET last_seen=? WHERE hash=? AND expires>? AND last_seen<?",
  ).run(now, hashToken(token), now, now - 60000);
}
export function listSessions(
  db: DatabaseSync,
  token: string,
): SessionSummary[] {
  const { hash: currentHash, memberId } = requireSession(db, token);
  const date = (value: unknown) =>
    Number(value) > 0 ? new Date(Number(value)).toISOString() : null;
  return db
    .prepare(
      "SELECT id,hash,device,created_at,last_seen,expires FROM sessions WHERE member_id IS ? AND expires>? ORDER BY (hash=?) DESC,last_seen DESC,id",
    )
    .all(memberId, Date.now(), currentHash)
    .map((row) => ({
      id: String(row.id),
      current: row.hash === currentHash,
      device: String(row.device),
      created_at: date(row.created_at),
      last_seen: date(row.last_seen),
      expires_at: new Date(Number(row.expires)).toISOString(),
    }));
}
export function revokeSessions(
  db: DatabaseSync,
  token: string,
  target: string,
) {
  return atomic(db, () => {
    const { hash: currentHash, memberId } = requireSession(db, token);
    if (target === "others") {
      const result = db
        .prepare("DELETE FROM sessions WHERE hash<>? AND member_id IS ?")
        .run(currentHash, memberId);
      audit(db, "sessions.revoke_others", memberId || "1", {
        count: Number(result.changes),
      });
      return { signed_out: false };
    }
    const session = db
      .prepare(
        "SELECT hash FROM sessions WHERE id=? AND expires>? AND member_id IS ?",
      )
      .get(target, Date.now(), memberId);
    if (!session)
      throw new AppError("Cette session est déjà fermée ou introuvable.", 404);
    db.prepare("DELETE FROM sessions WHERE id=?").run(target);
    audit(db, "session.revoke", target, { actor: memberId || "1" });
    return { signed_out: session.hash === currentHash };
  });
}

export async function loginOwner(
  db: DatabaseSync,
  password: string,
  userAgent = "",
) {
  const encoded = db
    .prepare("SELECT password_hash FROM owner WHERE id=1")
    .get()?.password_hash;
  if (!encoded || !(await verifyPassword(password, String(encoded))))
    throw new AppError("Connexion impossible. Vérifiez le mot de passe.", 401);
  return atomic(db, () => {
    // Password derivation yields: a simultaneous reset must invalidate this login.
    if (
      db.prepare("SELECT password_hash FROM owner WHERE id=1").get()
        ?.password_hash !== encoded
    )
      throw new AppError(
        "Connexion impossible. Vérifiez le mot de passe.",
        401,
      );
    const token = createSession(db, userAgent);
    audit(db, "owner.login", "1");
    return token;
  });
}
export async function changeSessionPassword(
  db: DatabaseSync,
  token: string,
  current: string,
  password: string,
  userAgent = "",
) {
  const { memberId } = requireSession(db, token);
  const table = memberId === null ? "owner" : "members";
  const id = memberId ?? 1;
  const before = String(
    db.prepare(`SELECT password_hash FROM ${table} WHERE id=?`).get(id)!
      .password_hash,
  );
  if (!(await verifyPassword(current, before)))
    throw new AppError("Mot de passe actuel incorrect.", 403);
  const encoded = await hashPassword(password);
  return atomic(db, () => {
    requireSession(db, token);
    if (
      db.prepare(`SELECT password_hash FROM ${table} WHERE id=?`).get(id)
        ?.password_hash !== before
    )
      throw new AppError(
        "Le mot de passe a changé. Reconnectez-vous avant de réessayer.",
        409,
      );
    db.prepare(`UPDATE ${table} SET password_hash=? WHERE id=?`).run(
      encoded,
      id,
    );
    db.prepare("DELETE FROM sessions WHERE member_id IS ?").run(memberId);
    const replacement = createSession(db, userAgent, memberId);
    audit(db, "account.password_changed", String(id));
    return replacement;
  });
}
