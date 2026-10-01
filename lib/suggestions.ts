import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import ipaddr from "ipaddr.js";
import { z } from "zod";
import { hashToken } from "./auth.ts";
import { atomic, audit } from "./db.ts";
import { publicAddress } from "./fetch-safe.ts";
import { saveGiftInTransaction } from "./gifts.ts";
import { canReadList, publicAccess, type Access } from "./lists.ts";
import { enqueueNotification } from "./notifications.ts";
import {
  AppError,
  canonicalUrl,
  dateNow,
  giftSchema,
  text,
} from "./validation.ts";

export type Suggestion = {
  id: string;
  list_id: string;
  list_name: string;
  title: string;
  nickname: string;
  message: string;
  url: string;
  state: "pending" | "accepted" | "rejected";
  gift_id: string | null;
  created_at: string;
  reviewed_at: string | null;
};
export type SuggestionStatus = Pick<
  Suggestion,
  "title" | "nickname" | "message" | "url" | "state" | "created_at"
>;
const fields =
  "s.id,s.list_id,s.title,s.nickname,s.message,s.url,s.state,s.gift_id,s.created_at,s.reviewed_at";

// Syntax/address validation only. Guests never trigger DNS, extraction or images.
function proposalUrl(value: string) {
  if (!value) return "";
  const clean = canonicalUrl(value);
  const url = new URL(clean);
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    (url.port && !["80", "443"].includes(url.port)) ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (!host.includes(".") && !host.includes(":")) ||
    (ipaddr.isValid(host) && !publicAddress(host))
  )
    throw new AppError("Cette destination réseau est interdite.");
  return clean;
}

export function createSuggestion(
  db: DatabaseSync,
  input: unknown,
  access: Access = publicAccess,
) {
  const v = z
    .object({
      list_id: text(64).min(1),
      title: text(160).min(1),
      nickname: text(80).default(""),
      message: text(2000).default(""),
      url: text(2048).default("").transform(proposalUrl),
      recipient_visible: z.literal(true),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    const list = db
      .prepare(
        "SELECT archived,suggestions_enabled,visibility FROM lists WHERE id=?",
      )
      .get(v.list_id);
    if (
      !list ||
      !canReadList(db, v.list_id, access) ||
      list.archived ||
      list.visibility === "private" ||
      !list.suggestions_enabled
    )
      throw new AppError(
        "Les suggestions sont indisponibles pour cette liste.",
        404,
      );
    // Bound persistent storage even across changing client addresses and quotas.
    if (
      Number(
        db
          .prepare("SELECT COUNT(*) n FROM suggestions WHERE list_id=?")
          .get(v.list_id)!.n,
      ) >= 100 ||
      Number(db.prepare("SELECT COUNT(*) n FROM suggestions").get()!.n) >= 1000
    )
      throw new AppError(
        "La boîte de suggestions est pleine. Réessayez plus tard.",
        429,
      );
    const token = randomBytes(32).toString("hex");
    const id = randomUUID();
    db.prepare(
      "INSERT INTO suggestions(id,list_id,token_hash,title,nickname,message,url,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(
      id,
      v.list_id,
      hashToken(token),
      v.title,
      v.nickname,
      v.message,
      v.url,
      dateNow(),
    );
    audit(db, "suggestion.create", id);
    enqueueNotification(db, "suggestion", id);
    return { token };
  });
}

function fromToken(db: DatabaseSync, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError("Suggestion introuvable.", 404);
  const row = db
    .prepare(`SELECT ${fields} FROM suggestions s WHERE token_hash=?`)
    .get(hashToken(token));
  if (!row) throw new AppError("Suggestion introuvable.", 404);
  return row;
}

export function manageSuggestion(db: DatabaseSync, input: unknown) {
  const v = z
    .object({
      token: z.string().max(64),
      action: z.enum(["status", "rotate", "delete"]),
      confirm: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    const row = fromToken(db, v.token);
    if (v.action === "status") {
      const { title, nickname, message, url, state, created_at } = row;
      // No list name, gift ID, owner notes or other people's suggestions.
      return {
        title,
        nickname,
        message,
        url,
        state,
        created_at,
      } as SuggestionStatus;
    }
    if (!v.confirm)
      throw new AppError("Confirmez cette action sur la suggestion.", 409);
    if (v.action === "delete") {
      eraseSuggestion(db, String(row.id));
      return { ok: true };
    }
    const token = randomBytes(32).toString("hex");
    db.prepare("UPDATE suggestions SET token_hash=? WHERE id=?").run(
      hashToken(token),
      row.id,
    );
    audit(db, "suggestion.link.rotate", String(row.id));
    return { token };
  });
}

// The caller owns the transaction. Accepted gifts are independent and retained.
function eraseSuggestion(db: DatabaseSync, id: string) {
  db.prepare("DELETE FROM notification_jobs WHERE event_key=?").run(
    `suggestion:${id}`,
  );
  db.prepare("DELETE FROM suggestions WHERE id=?").run(id);
  audit(db, "suggestion.delete", id);
}

export function listSuggestions(
  db: DatabaseSync,
  input: { state?: string | null; page?: string | null },
) {
  const state = z
    .enum(["pending", "accepted", "rejected"])
    .parse(input.state || "pending");
  const page = z.coerce
    .number()
    .int()
    .min(0)
    .max(1000)
    .parse(input.page || "0");
  return {
    items: db
      .prepare(
        `SELECT ${fields},l.name list_name FROM suggestions s JOIN lists l ON l.id=s.list_id WHERE s.state=? ORDER BY s.created_at DESC,s.id DESC LIMIT 20 OFFSET ?`,
      )
      .all(state, page * 20) as Suggestion[],
    total: Number(
      db.prepare("SELECT COUNT(*) n FROM suggestions WHERE state=?").get(state)!
        .n,
    ),
    page,
  };
}

// Only the authenticated owner calls these moderation functions.
export function acceptSuggestion(db: DatabaseSync, id: string, input: unknown) {
  return atomic(db, () => {
    const row = db
      .prepare("SELECT state,list_id,gift_id FROM suggestions WHERE id=?")
      .get(id);
    if (!row) throw new AppError("Suggestion introuvable.", 404);
    if (row.state === "accepted") return String(row.gift_id);
    if (row.state !== "pending")
      throw new AppError("Cette suggestion a déjà été traitée.", 409);
    const list = db
      .prepare("SELECT archived FROM lists WHERE id=?")
      .get(row.list_id)!;
    if (list.archived)
      throw new AppError(
        "Réactivez la liste avant d’accepter une suggestion.",
        409,
      );
    const gift = giftSchema.parse(input);
    if (gift.list_id !== row.list_id)
      throw new AppError("Conservez la liste de la suggestion.", 409);
    // Same transaction as the decision: retries/concurrent requests create one gift.
    const giftId = saveGiftInTransaction(db, gift);
    db.prepare(
      "UPDATE suggestions SET state='accepted',gift_id=?,reviewed_at=? WHERE id=?",
    ).run(giftId, dateNow(), id);
    db.prepare("DELETE FROM notification_jobs WHERE event_key=?").run(
      `suggestion:${id}`,
    );
    audit(db, "suggestion.accept", id, { gift_id: giftId });
    return giftId;
  });
}

export function reviewSuggestion(db: DatabaseSync, id: string, input: unknown) {
  const v = z
    .object({ action: z.enum(["reject", "delete"]), confirm: z.literal(true) })
    .strict()
    .parse(input);
  atomic(db, () => {
    const row = db.prepare("SELECT state FROM suggestions WHERE id=?").get(id);
    if (!row) throw new AppError("Suggestion introuvable.", 404);
    if (v.action === "delete") return eraseSuggestion(db, id);
    if (row.state === "rejected") return;
    if (row.state !== "pending")
      throw new AppError("Cette suggestion a déjà été traitée.", 409);
    db.prepare(
      "UPDATE suggestions SET state='rejected',reviewed_at=? WHERE id=?",
    ).run(dateNow(), id);
    db.prepare("DELETE FROM notification_jobs WHERE event_key=?").run(
      `suggestion:${id}`,
    );
    audit(db, "suggestion.reject", id);
  });
}
