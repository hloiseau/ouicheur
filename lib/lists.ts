import { listCommandSchema } from "./catalog.ts";
import { SqliteCatalogStore } from "./catalog-sqlite.ts";
import { secretCoordinator } from "./secret-suggestions.ts";
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sessionAccount, hashToken } from "./auth.ts";
import { atomic, audit } from "./db.ts";
import { AppError } from "./validation.ts";

export type Wishlist = {
  id: string;
  name: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  archived: number;
  event_date: string;
  event_annual?: number;
  event_timezone?: string;
  leap_day?: string;
  shared: number;
  surprise_mode: number;
  suggestions_enabled: number;
  secret_suggestions_available?: boolean;
};
export type Access = {
  owner: boolean;
  lists: string[];
  recipient?: boolean;
  revealSurprises?: boolean;
  memberId?: string;
  managedLists?: string[];
  recipientLists?: string[];
};
export const publicAccess: Access = { owner: false, lists: [] };
export const shareCookie = (id: string) => `ouicheur_share_${id}`;
export function accessFromCookies(
  db: DatabaseSync,
  cookies: { get(name: string): { value: string } | undefined },
): Access {
  const account = sessionAccount(db, cookies.get("wishlister_session")?.value);
  const owner = account?.role === "owner";
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
  const managedLists = account?.memberId
    ? db
        .prepare("SELECT list_id FROM member_lists WHERE member_id=?")
        .all(account.memberId)
        .map((r) => String(r.list_id))
    : [];
  const recipientLists = account
    ? db
        .prepare(
          "SELECT l.id FROM lists l LEFT JOIN family_profiles p ON p.id=l.profile_id WHERE COALESCE(p.recipient,'owner')=?",
        )
        .all(account.memberId || "owner")
        .map((r) => String(r.id))
    : [];
  return {
    owner,
    lists,
    recipient: recipientLists.length > 0,
    revealSurprises: !!account?.revealed,
    memberId: account?.memberId || undefined,
    managedLists,
    recipientLists,
  };
}
export function listLists(db: DatabaseSync, access: Access = publicAccess) {
  return (
    db
      .prepare(
        "SELECT id,name,description,visibility,archived,event_date,event_annual,event_timezone,leap_day,surprise_mode,suggestions_enabled,CASE WHEN share_hash IS NULL THEN 0 ELSE 1 END shared FROM lists ORDER BY created_at,id",
      )
      .all()
      .map((row) => ({
        ...row,
        secret_suggestions_available: !!secretCoordinator(db, String(row.id)),
      })) as Wishlist[]
  ).filter(
    (l) =>
      access.owner ||
      !!access.managedLists?.includes(l.id) ||
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
  return new SqliteCatalogStore(db).saveListSync(
    listCommandSchema.parse(input),
  );
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
  if (
    access.memberId &&
    db
      .prepare("SELECT 1 FROM member_uploads WHERE member_id=? AND path=?")
      .get(access.memberId, path)
  )
    return true;
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
      "SELECT g.list_id,g.visibility FROM gifts g LEFT JOIN categories c ON c.id=g.category_id WHERE (g.image=? OR c.image=?)",
    )
    .all(path, path)
    .some(
      (row) =>
        lists.includes(String(row.list_id)) &&
        (row.visibility === "visible" ||
          !!access.managedLists?.includes(String(row.list_id))),
    );
}
