import { variantKey } from "./wish-details.ts";
import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  createSession,
  hashPassword,
  hashToken,
  sessionAccount,
  verifyPassword,
} from "./auth.ts";
import { atomic, audit } from "./db.ts";
import {
  accessFromCookies,
  canReadImage,
  listLists,
  type Access,
} from "./lists.ts";
import { listGifts, saveGiftInTransaction } from "./gifts.ts";
import { queryWishlist } from "./wishlist-query.ts";
import { listPriorities } from "./priorities.ts";
import { requireSurpriseReveal } from "./surprise.ts";
import { AppError, dateNow, giftSchema, text } from "./validation.ts";

export function familyAdmin(db: DatabaseSync) {
  return {
    profiles: db
      .prepare(
        "SELECT id,name,kind,recipient FROM family_profiles ORDER BY name,id",
      )
      .all(),
    members: db
      .prepare(
        "SELECT m.id,m.login,m.name,m.enabled,i.expires invitation_expires FROM members m LEFT JOIN member_invitations i ON i.member_id=m.id ORDER BY m.created_at,m.id",
      )
      .all()
      .map((m) => ({
        id: String(m.id),
        login: String(m.login),
        name: String(m.name),
        enabled: Number(m.enabled),
        invitation_expires:
          m.invitation_expires === null ? null : Number(m.invitation_expires),
        lists: db
          .prepare(
            "SELECT list_id FROM member_lists WHERE member_id=? ORDER BY list_id",
          )
          .all(m.id)
          .map((x) => String(x.list_id)),
      })),
    lists: db
      .prepare(
        "SELECT l.id,l.name,l.profile_id,c.member_id suggestion_coordinator FROM lists l LEFT JOIN suggestion_coordinators c ON c.list_id=l.id ORDER BY l.created_at,l.id",
      )
      .all(),
  };
}
export function familyExport(db: DatabaseSync) {
  const { profiles, members, lists } = familyAdmin(db);
  return {
    profiles,
    members: members.map(
      ({ invitation_expires: _expiry, ...member }) => member,
    ),
    lists,
  };
}
function validLists(db: DatabaseSync, ids: string[]) {
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !db.prepare("SELECT 1 FROM lists WHERE id=?").get(id))
  )
    throw new AppError("Sélection de listes invalide.");
}
function writeGrants(db: DatabaseSync, memberId: string, lists: string[]) {
  validLists(db, lists);
  db.prepare("DELETE FROM member_lists WHERE member_id=?").run(memberId);
  for (const id of lists)
    db.prepare("INSERT INTO member_lists VALUES (?,?)").run(memberId, id);
}
export function inviteMember(db: DatabaseSync, input: unknown) {
  const v = z
    .object({
      id: z.uuid().optional(),
      name: text(80).min(1),
      login: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9][a-z0-9._-]{2,39}$/),
      lists: z.array(text(64).min(1)).max(100),
      confirm: z.literal(true),
    })
    .parse(input);
  if (["owner", "admin"].includes(v.login))
    throw new AppError("Choisissez un autre identifiant de connexion.");
  return atomic(db, () => {
    validLists(db, v.lists);
    const existing = v.id
      ? db.prepare("SELECT id FROM members WHERE id=?").get(v.id)
      : null;
    if (v.id && !existing) throw new AppError("Compte introuvable.", 404);
    if (
      !existing &&
      Number(db.prepare("SELECT COUNT(*) n FROM members").get()!.n) >= 50
    )
      throw new AppError("Cette instance est limitée à 50 coorganisateurs.");
    if (
      db
        .prepare("SELECT 1 FROM members WHERE login=? AND id<>?")
        .get(v.login, v.id || "")
    )
      throw new AppError("Cet identifiant de connexion est déjà utilisé.", 409);
    const id = v.id || randomUUID();
    db.prepare(
      "INSERT INTO members(id,name,login,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,login=excluded.login,password_hash='',enabled=0",
    ).run(id, v.name, v.login, dateNow());
    writeGrants(db, id, v.lists);
    db.prepare("DELETE FROM sessions WHERE member_id=?").run(id);
    const token = randomBytes(32).toString("hex");
    const expires = Date.now() + 7 * 86400000;
    db.prepare(
      "INSERT INTO member_invitations(member_id,token_hash,expires) VALUES (?,?,?) ON CONFLICT(member_id) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires",
    ).run(id, hashToken(token), expires);
    audit(db, existing ? "member.reinvite" : "member.invite", id, {
      lists: v.lists,
    });
    return { id, token, expires };
  });
}
function invitation(db: DatabaseSync, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError("Invitation expirée ou révoquée.", 404);
  const row = db
    .prepare(
      "SELECT m.id,m.name,m.login,i.expires FROM member_invitations i JOIN members m ON m.id=i.member_id WHERE i.token_hash=? AND i.expires>?",
    )
    .get(hashToken(token), Date.now());
  if (!row) throw new AppError("Invitation expirée ou révoquée.", 404);
  return row;
}
export function inspectInvitation(db: DatabaseSync, token: string) {
  const row = invitation(db, token);
  return {
    name: String(row.name),
    login: String(row.login),
    expires: Number(row.expires),
  };
}
export async function acceptInvitation(
  db: DatabaseSync,
  input: unknown,
  userAgent = "",
) {
  const v = z
    .object({
      token: z.string().max(64),
      password: z.string().min(12).max(256),
      confirmation: z.string().max(256),
    })
    .parse(input);
  if (v.password !== v.confirmation)
    throw new AppError("Les mots de passe ne correspondent pas.");
  const first = invitation(db, v.token);
  const encoded = await hashPassword(v.password);
  return atomic(db, () => {
    const current = invitation(db, v.token);
    if (current.id !== first.id)
      throw new AppError("Invitation expirée ou révoquée.", 404);
    db.prepare("UPDATE members SET password_hash=?,enabled=1 WHERE id=?").run(
      encoded,
      current.id,
    );
    db.prepare("DELETE FROM member_invitations WHERE member_id=?").run(
      current.id,
    );
    db.prepare("DELETE FROM sessions WHERE member_id=?").run(current.id);
    audit(db, "member.accept", String(current.id));
    return createSession(db, userAgent, String(current.id));
  });
}
export async function loginMember(
  db: DatabaseSync,
  login: string,
  password: string,
  userAgent = "",
) {
  const member = db
    .prepare("SELECT id,password_hash,enabled FROM members WHERE login=?")
    .get(login.trim().toLowerCase());
  const encoded =
    member?.password_hash ||
    db.prepare("SELECT password_hash FROM owner WHERE id=1").get()
      ?.password_hash;
  const valid = encoded && (await verifyPassword(password, String(encoded)));
  if (!member?.enabled || !valid)
    throw new AppError("Connexion impossible. Vérifiez vos identifiants.", 401);
  return atomic(db, () => {
    const current = db
      .prepare("SELECT password_hash,enabled FROM members WHERE id=?")
      .get(member.id);
    if (!current?.enabled || current.password_hash !== member.password_hash)
      throw new AppError(
        "Connexion impossible. Vérifiez vos identifiants.",
        401,
      );
    audit(db, "member.login", String(member.id));
    return createSession(db, userAgent, String(member.id));
  });
}
export function updateMemberAccess(db: DatabaseSync, input: unknown) {
  const v = z
    .object({
      id: z.uuid(),
      action: z.enum(["grants", "disable"]),
      lists: z.array(text(64).min(1)).max(100).default([]),
      confirm: z.literal(true),
    })
    .parse(input);
  atomic(db, () => {
    if (!db.prepare("SELECT 1 FROM members WHERE id=?").get(v.id))
      throw new AppError("Compte introuvable.", 404);
    if (v.action === "disable") {
      db.prepare("UPDATE members SET enabled=0 WHERE id=?").run(v.id);
      db.prepare("DELETE FROM member_invitations WHERE member_id=?").run(v.id);
      db.prepare("DELETE FROM member_lists WHERE member_id=?").run(v.id);
    } else writeGrants(db, v.id, v.lists);
    db.prepare("DELETE FROM sessions WHERE member_id=?").run(v.id);
    audit(db, `member.${v.action}`, v.id, {
      lists: v.action === "grants" ? v.lists : [],
    });
  });
}
export function saveFamilyProfile(db: DatabaseSync, input: unknown) {
  const v = z
    .object({
      id: z.uuid().optional(),
      name: text(80).min(1),
      kind: z.enum(["adult", "child"]),
      recipient: z.string().max(64).default(""),
    })
    .parse(input);
  if (v.kind === "child" && v.recipient)
    throw new AppError("Un profil enfant n’a pas de compte de connexion.");
  return atomic(db, () => {
    if (
      v.recipient &&
      v.recipient !== "owner" &&
      !db.prepare("SELECT 1 FROM members WHERE id=?").get(v.recipient)
    )
      throw new AppError("Compte introuvable.", 404);
    if (
      v.id &&
      !db.prepare("SELECT 1 FROM family_profiles WHERE id=?").get(v.id)
    )
      throw new AppError("Profil introuvable.", 404);
    if (
      !v.id &&
      Number(db.prepare("SELECT COUNT(*) n FROM family_profiles").get()!.n) >=
        100
    )
      throw new AppError("Cette instance est limitée à 100 profils familiaux.");
    const id = v.id || randomUUID();
    db.prepare(
      "INSERT INTO family_profiles(id,name,kind,recipient) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,recipient=excluded.recipient",
    ).run(id, v.name, v.kind, v.recipient);
    db.exec("UPDATE sessions SET surprises_revealed=0");
    audit(db, "family.profile.save", id);
    return id;
  });
}
export function assignFamilyProfile(db: DatabaseSync, input: unknown) {
  const v = z
    .object({
      list_id: text(64).min(1),
      profile_id: z.uuid().nullable(),
      confirm: z.literal(true),
    })
    .parse(input);
  atomic(db, () => {
    if (!db.prepare("SELECT 1 FROM lists WHERE id=?").get(v.list_id))
      throw new AppError("Liste introuvable.", 404);
    if (
      v.profile_id &&
      !db.prepare("SELECT 1 FROM family_profiles WHERE id=?").get(v.profile_id)
    )
      throw new AppError("Profil introuvable.", 404);
    db.prepare("UPDATE lists SET profile_id=? WHERE id=?").run(
      v.profile_id,
      v.list_id,
    );
    db.exec("UPDATE sessions SET surprises_revealed=0");
    audit(db, "family.list.assign", v.list_id, { profile_id: v.profile_id });
  });
}
export function requireMember(db: DatabaseSync, token: string) {
  const account = sessionAccount(db, token);
  if (!account || account.role !== "member")
    throw new AppError("Connexion coorganisateur requise.", 401);
  return account;
}
export function memberAccess(db: DatabaseSync, token: string) {
  requireMember(db, token);
  return accessFromCookies(db, {
    get: (name) =>
      name === "wishlister_session" ? { value: token } : undefined,
  });
}
function requireListEdit(
  db: DatabaseSync,
  token: string,
  id: string,
  editingExisting = true,
) {
  const account = requireMember(db, token);
  if (
    !db
      .prepare("SELECT 1 FROM member_lists WHERE member_id=? AND list_id=?")
      .get(account.memberId, id)
  )
    throw new AppError("Liste introuvable.", 404);
  if (db.prepare("SELECT archived FROM lists WHERE id=?").get(id)?.archived)
    throw new AppError("Cette liste est archivée.", 409);
  const access = memberAccess(db, token);
  if (editingExisting) requireSurpriseReveal(db, access, id);
  return access;
}
export function memberSummary(
  db: DatabaseSync,
  token: string,
  page?: { list: string; locale: "fr" | "en" },
) {
  const account = requireMember(db, token);
  const access = memberAccess(db, token);
  const lists = listLists(db, access).filter((l) =>
    access.managedLists?.includes(l.id),
  );
  const wishlist = page
    ? queryWishlist(
        db,
        {
          mode: "team",
          list: lists.some((l) => l.id === page.list)
            ? page.list
            : lists[0]?.id || "",
          locale: page.locale,
        },
        access,
      )
    : undefined;
  const gifts = wishlist?.items || listGifts(db, true, access);
  const categories = db
    .prepare("SELECT id,name FROM categories ORDER BY name")
    .all()
    .filter((c) =>
      wishlist
        ? wishlist.categories.some((g) => g.id === c.id)
        : gifts.some((g) => g.category_id === c.id),
    );
  return {
    account: { name: account.name, login: account.login },
    lists,
    gifts,
    wishlist,
    categories,
    priorities: listPriorities(db),
    currency: String(
      db.prepare("SELECT currency FROM owner WHERE id=1").get()!.currency,
    ),
    surprises_revealed: account.revealed,
    surprises_enabled: lists.some(
      (l) => l.surprise_mode && access.recipientLists?.includes(l.id),
    ),
  };
}
export function saveMemberGift(
  db: DatabaseSync,
  token: string,
  input: unknown,
  id?: string,
) {
  const gift = giftSchema.parse(input);
  return atomic(db, () => {
    const account = requireMember(db, token);
    const existing = id
      ? db
          .prepare(
            "SELECT g.list_id FROM gifts g JOIN member_lists ml ON ml.list_id=g.list_id WHERE g.id=? AND ml.member_id=?",
          )
          .get(id, account.memberId)
      : null;
    if (id && !existing) throw new AppError("Envie introuvable.", 404);
    if (existing) requireListEdit(db, token, String(existing.list_id));
    const listId = gift.list_id || String(existing?.list_id || "");
    const access = requireListEdit(db, token, listId, !!id);
    if (gift.image && !canReadImage(db, gift.image, access))
      throw new AppError("Image inaccessible.", 404);
    if (
      gift.category_id &&
      !db
        .prepare(
          "SELECT 1 FROM gifts g JOIN member_lists ml ON ml.list_id=g.list_id WHERE ml.member_id=? AND g.category_id=?",
        )
        .get(access.memberId!, gift.category_id)
    )
      throw new AppError("Catégorie inconnue.");
    const duplicate = db
      .prepare(
        "SELECT g.id FROM gifts g JOIN member_lists ml ON ml.list_id=g.list_id WHERE ml.member_id=? AND g.url<>'' AND g.url=? AND g.size=? COLLATE NOCASE AND g.color=? COLLATE NOCASE AND g.model=? COLLATE NOCASE AND g.id<>?",
      )
      .get(
        access.memberId!,
        gift.url,
        gift.size,
        gift.color,
        gift.model,
        id || "",
      );
    const previousVariant = id
      ? db.prepare("SELECT url,size,color,model FROM gifts WHERE id=?").get(id)
      : null;
    if (
      duplicate &&
      (!previousVariant ||
        variantKey({
          url: String(previousVariant.url),
          size: String(previousVariant.size),
          color: String(previousVariant.color),
          model: String(previousVariant.model),
        }) !== variantKey(gift)) &&
      !gift.allow_duplicate
    )
      throw new AppError(
        "Ce lien produit existe déjà dans votre Ouichlist. Cochez « Autoriser un doublon » pour créer une autre envie.",
        409,
      );
    // A duplicate in an inaccessible list must not be disclosed by validation.
    const result = saveGiftInTransaction(
      db,
      { ...gift, list_id: listId, allow_duplicate: true },
      id,
    );
    audit(db, "member.gift.save", result, { actor: access.memberId });
    return result;
  });
}
export function setMemberGiftPurchased(
  db: DatabaseSync,
  token: string,
  id: string,
  input: unknown,
) {
  const v = z.object({ purchased: z.boolean() }).strict().parse(input);
  atomic(db, () => {
    const account = requireMember(db, token);
    const gift = db
      .prepare(
        "SELECT g.list_id FROM gifts g JOIN member_lists ml ON ml.list_id=g.list_id WHERE g.id=? AND ml.member_id=?",
      )
      .get(id, account.memberId);
    if (!gift) throw new AppError("Envie introuvable.", 404);
    const access = requireListEdit(db, token, String(gift.list_id));
    db.prepare("UPDATE gifts SET purchased=?,updated_at=? WHERE id=?").run(
      Number(v.purchased),
      dateNow(),
      id,
    );
    audit(db, "member.gift.purchase", id, {
      actor: access.memberId,
      purchased: v.purchased,
    });
  });
}
