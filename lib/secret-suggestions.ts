import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { hashToken } from "./auth.ts";
import { atomic } from "./db.ts";
import { requireMember } from "./family.ts";
import { AppError, dateNow, text } from "./validation.ts";

// Revealing one's ordinary surprise activity never grants access to these ideas.
export function eligibleCoordinator(
  db: DatabaseSync,
  list: string,
  member: string,
) {
  return !!db
    .prepare(
      `SELECT 1 FROM member_lists ml
    JOIN members m ON m.id=ml.member_id JOIN lists l ON l.id=ml.list_id
    LEFT JOIN family_profiles p ON p.id=l.profile_id
    WHERE ml.list_id=? AND ml.member_id=? AND m.enabled=1
    AND COALESCE(p.recipient,'owner')<>m.id`,
    )
    .get(list, member);
}
export function secretCoordinator(db: DatabaseSync, list: string) {
  const member = db
    .prepare("SELECT member_id FROM suggestion_coordinators WHERE list_id=?")
    .get(list)?.member_id;
  return member && eligibleCoordinator(db, list, String(member))
    ? String(member)
    : null;
}
export function setSuggestionCoordinator(db: DatabaseSync, input: unknown) {
  const v = z
    .object({
      list_id: text(64).min(1),
      member_id: z.union([z.literal(""), z.uuid()]),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  atomic(db, () => {
    if (!db.prepare("SELECT 1 FROM lists WHERE id=?").get(v.list_id))
      throw new AppError("Liste introuvable.", 404);
    if (v.member_id && !eligibleCoordinator(db, v.list_id, v.member_id))
      throw new AppError(
        "Choisissez un coorganisateur actif de cette liste, différent du destinataire.",
      );
    db.prepare("DELETE FROM suggestion_coordinators WHERE list_id=?").run(
      v.list_id,
    );
    if (v.member_id)
      db.prepare("INSERT INTO suggestion_coordinators VALUES (?,?)").run(
        v.list_id,
        v.member_id,
      );
    // Old proposals never change audience when the coordinator is replaced.
  });
}
export function createSecretSuggestion(
  db: DatabaseSync,
  v: {
    list_id: string;
    title: string;
    nickname: string;
    message: string;
    url: string;
  },
) {
  const member = secretCoordinator(db, v.list_id);
  if (!member)
    throw new AppError(
      "Aucun coorganisateur n’est disponible pour garder cette idée secrète.",
      409,
    );
  if (
    Number(
      db
        .prepare("SELECT COUNT(*) n FROM secret_suggestions WHERE list_id=?")
        .get(v.list_id)!.n,
    ) >= 100 ||
    Number(db.prepare("SELECT COUNT(*) n FROM secret_suggestions").get()!.n) >=
      1000
  )
    throw new AppError(
      "La boîte de suggestions est pleine. Réessayez plus tard.",
      429,
    );
  const token = randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO secret_suggestions(id,list_id,member_id,token_hash,title,nickname,message,url,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(
    randomUUID(),
    v.list_id,
    member,
    hashToken(token),
    v.title,
    v.nickname,
    v.message,
    v.url,
    dateNow(),
  );
  // No owner-facing audit, count or notification, including neutral ones.
  return { token };
}
export function manageSecretSuggestion(
  db: DatabaseSync,
  v: {
    token: string;
    action: "status" | "rotate" | "delete";
    confirm: boolean;
  },
) {
  const row = db
    .prepare(
      "SELECT id,title,nickname,message,url,state,created_at FROM secret_suggestions WHERE token_hash=?",
    )
    .get(hashToken(v.token));
  if (!row) return null;
  if (v.action === "status") {
    const { id: _id, ...status } = row;
    return { ...status, secret: true };
  }
  if (!v.confirm)
    throw new AppError("Confirmez cette action sur la suggestion.", 409);
  if (v.action === "delete") {
    db.prepare("DELETE FROM secret_suggestions WHERE id=?").run(row.id);
    return { ok: true };
  }
  const token = randomBytes(32).toString("hex");
  db.prepare("UPDATE secret_suggestions SET token_hash=? WHERE id=?").run(
    hashToken(token),
    row.id,
  );
  return { token };
}
const fields =
  "s.id,s.list_id,l.name list_name,s.title,s.nickname,s.message,s.url,s.state,s.plan_title,s.plan_note,s.prepared,s.created_at";
export function secretInbox(db: DatabaseSync, token: string) {
  const account = requireMember(db, token);
  return db
    .prepare(
      `SELECT ${fields} FROM secret_suggestions s JOIN lists l ON l.id=s.list_id WHERE s.member_id=? ORDER BY s.created_at DESC,s.id DESC`,
    )
    .all(account.memberId!)
    .filter((r) =>
      eligibleCoordinator(db, String(r.list_id), account.memberId!),
    );
}
export function reviewSecretSuggestion(
  db: DatabaseSync,
  token: string,
  input: unknown,
) {
  const v = z
    .object({
      id: z.uuid(),
      action: z.enum(["accept", "reject", "delete", "save"]),
      title: text(160).default(""),
      note: text(2000).default(""),
      prepared: z.boolean().default(false),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    const account = requireMember(db, token);
    const row = db
      .prepare("SELECT * FROM secret_suggestions WHERE id=? AND member_id=?")
      .get(v.id, account.memberId!);
    if (
      !row ||
      !eligibleCoordinator(db, String(row.list_id), account.memberId!)
    )
      throw new AppError("Suggestion introuvable.", 404);
    if (v.action === "delete") {
      db.prepare("DELETE FROM secret_suggestions WHERE id=?").run(v.id);
      return;
    }
    if (
      db.prepare("SELECT archived FROM lists WHERE id=?").get(row.list_id)!
        .archived
    )
      throw new AppError("Cette liste est archivée.", 409);
    if (v.action === "save") {
      if (row.state !== "accepted" || !v.title)
        throw new AppError(
          "Acceptez cette idée avant de préparer le cadeau.",
          409,
        );
      db.prepare(
        "UPDATE secret_suggestions SET plan_title=?,plan_note=?,prepared=? WHERE id=?",
      ).run(v.title, v.note, Number(v.prepared), v.id);
    } else {
      const state = v.action === "accept" ? "accepted" : "rejected";
      if (row.state === state) return;
      if (row.state !== "pending")
        throw new AppError("Cette suggestion a déjà été traitée.", 409);
      db.prepare(
        "UPDATE secret_suggestions SET state=?,plan_title=title,reviewed_at=? WHERE id=?",
      ).run(state, dateNow(), v.id);
    }
  });
}
