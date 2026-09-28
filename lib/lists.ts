import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { authorized, hashToken } from "./auth.ts";
import { atomic, audit } from "./db.ts";
import { AppError, dateNow, text } from "./validation.ts";

export type Wishlist = {
  id: string;
  name: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  archived: number;
  event_date: string;
  shared: number;
};
export type Access = { owner: boolean; lists: string[] };
export const publicAccess: Access = { owner: false, lists: [] };
export const shareCookie = (id: string) => `ouicheur_share_${id}`;
export function accessFromCookies(
  db: DatabaseSync,
  cookies: { get(name: string): { value: string } | undefined },
): Access {
  const owner = authorized(db, cookies.get("wishlister_session")?.value);
  const lists = db
    .prepare(
      "SELECT id,share_hash FROM lists WHERE visibility='unlisted' AND archived=0 AND share_hash IS NOT NULL",
    )
    .all()
    .filter((row) => {
      const token = cookies.get(shareCookie(String(row.id)))?.value;
      return (
        token &&
        /^[a-f0-9]{64}$/.test(token) &&
        hashToken(token) === row.share_hash
      );
    })
    .map((row) => String(row.id));
  return { owner, lists };
}
export function listLists(db: DatabaseSync, access: Access = publicAccess) {
  return (
    db
      .prepare(
        "SELECT id,name,description,visibility,archived,event_date,CASE WHEN share_hash IS NULL THEN 0 ELSE 1 END shared FROM lists ORDER BY created_at,id",
      )
      .all() as Wishlist[]
  ).filter(
    (l) =>
      access.owner ||
      (!l.archived &&
        (l.visibility === "public" ||
          (l.visibility === "unlisted" && access.lists.includes(l.id)))),
  );
}
export function canReadList(
  db: DatabaseSync,
  id: string,
  access: Access = publicAccess,
) {
  return listLists(db, access).some((l) => l.id === id);
}
export function assertGiftAccess(
  db: DatabaseSync,
  id: string,
  access: Access = publicAccess,
) {
  const gift = db
    .prepare("SELECT list_id,visibility FROM gifts WHERE id=?")
    .get(id);
  if (
    !gift ||
    (!access.owner && gift.visibility !== "visible") ||
    !canReadList(db, String(gift.list_id), access)
  )
    throw new AppError("Cadeau introuvable.", 404);
}
export function saveList(db: DatabaseSync, input: unknown) {
  const value = z
    .object({
      id: text(64).optional(),
      name: text(80).min(1),
      description: text(1000).default(""),
      visibility: z.enum(["public", "unlisted", "private"]),
      archived: z.boolean().default(false),
      event_date: z.union([z.literal(""), z.iso.date()]).default(""),
    })
    .parse(input);
  return atomic(db, () => {
    const id = value.id || randomUUID();
    if (value.id && !db.prepare("SELECT 1 FROM lists WHERE id=?").get(id))
      throw new AppError("Liste introuvable.", 404);
    db.prepare(
      `INSERT INTO lists(id,name,description,visibility,archived,event_date,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,visibility=excluded.visibility,archived=excluded.archived,event_date=excluded.event_date,share_hash=CASE WHEN lists.visibility<>excluded.visibility OR excluded.archived=1 THEN NULL ELSE lists.share_hash END`,
    ).run(
      id,
      value.name,
      value.description,
      value.visibility,
      Number(value.archived),
      value.event_date,
      dateNow(),
    );
    audit(db, "list.save", id, {
      visibility: value.visibility,
      archived: value.archived,
    });
    return id;
  });
}
export function rotateShare(db: DatabaseSync, id: string, revoke = false) {
  return atomic(db, () => {
    const list = db
      .prepare("SELECT visibility,archived FROM lists WHERE id=?")
      .get(id);
    if (!list || list.visibility !== "unlisted" || list.archived)
      throw new AppError(
        "Le partage exige une liste non répertoriée et active.",
        409,
      );
    const token = revoke ? null : randomBytes(32).toString("hex");
    db.prepare("UPDATE lists SET share_hash=? WHERE id=?").run(
      token ? hashToken(token) : null,
      id,
    );
    audit(db, revoke ? "list.share.revoke" : "list.share.rotate", id);
    return token;
  });
}
export function resolveShare(db: DatabaseSync, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
  return db
    .prepare(
      "SELECT id FROM lists WHERE share_hash=? AND visibility='unlisted' AND archived=0",
    )
    .get(hashToken(token));
}
export function canReadImage(
  db: DatabaseSync,
  path: string,
  access: Access = publicAccess,
) {
  if (access.owner) return true;
  const lists = listLists(db, access).map((l) => l.id);
  if (!lists.length) return false;
  // Profile artwork is shared by all visible lists. Category artwork needs a visible gift.
  if (
    db
      .prepare("SELECT 1 FROM owner WHERE avatar=? OR banner=? OR background=?")
      .get(path, path, path)
  )
    return true;
  return db
    .prepare(
      "SELECT g.list_id FROM gifts g LEFT JOIN categories c ON c.id=g.category_id WHERE g.visibility='visible' AND (g.image=? OR c.image=?)",
    )
    .all(path, path)
    .some((row) => lists.includes(String(row.list_id)));
}
