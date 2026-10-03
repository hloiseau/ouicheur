import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, audit } from "./db.ts";
import { AppError, dateNow, giftSchema, text } from "./validation.ts";
import { listGifts, saveGiftInTransaction } from "./gifts.ts";
import type { Access } from "./lists.ts";
import { requireSurpriseReveal } from "./surprise.ts";
export function bulkGifts(db: DatabaseSync, input: unknown, access: Access) {
  if (!access.owner)
    throw new AppError("Connexion administrateur requise.", 401);
  const v = z
    .object({
      list_id: text(64).min(1),
      ids: z.array(z.uuid()).min(1).max(500),
      action: z.enum(["category", "list", "archive", "restore", "priority"]),
      value: text(64).default(""),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    requireSurpriseReveal(db, access, v.list_id);
    const ids = [...new Set(v.ids)];
    if (
      ids.some(
        (id) =>
          db.prepare("SELECT list_id FROM gifts WHERE id=?").get(id)
            ?.list_id !== v.list_id,
      )
    )
      throw new AppError(
        "La sélection a changé. Rechargez la liste avant de continuer.",
        409,
      );
    if (v.action === "list") {
      if (
        !db
          .prepare("SELECT 1 FROM lists WHERE id=? AND archived=0")
          .get(v.value)
      )
        throw new AppError("Liste introuvable.", 404);
      requireSurpriseReveal(db, access, v.value);
    }
    if (
      v.action === "category" &&
      v.value &&
      !db.prepare("SELECT 1 FROM categories WHERE id=?").get(v.value)
    )
      throw new AppError("Catégorie inconnue.");
    if (v.action === "priority" && !/^\d+$/.test(v.value))
      throw new AppError("Priorité inconnue.");
    if (
      v.action === "priority" &&
      !db
        .prepare("SELECT 1 FROM gift_priorities WHERE id=?")
        .get(Number(v.value))
    )
      throw new AppError("Priorité inconnue.");
    const sql = {
      category: "UPDATE gifts SET category_id=?,updated_at=? WHERE id=?",
      list: "UPDATE gifts SET list_id=?,updated_at=? WHERE id=?",
      archive: "UPDATE gifts SET visibility=?,updated_at=? WHERE id=?",
      restore: "UPDATE gifts SET visibility=?,updated_at=? WHERE id=?",
      priority: "UPDATE gifts SET priority_id=?,updated_at=? WHERE id=?",
    }[v.action];
    const value =
      v.action === "archive"
        ? "archived"
        : v.action === "restore"
          ? "visible"
          : v.action === "priority"
            ? Number(v.value)
            : v.value || null;
    for (const id of ids) db.prepare(sql).run(value, dateNow(), id);
    audit(db, "gifts.bulk", v.list_id, { action: v.action, count: ids.length });
    return { count: ids.length };
  });
}
export function reorderGift(db: DatabaseSync, input: unknown, access: Access) {
  if (!access.owner)
    throw new AppError("Connexion administrateur requise.", 401);
  const v = z
    .object({ id: z.uuid(), direction: z.enum(["up", "down"]) })
    .strict()
    .parse(input);
  atomic(db, () => {
    const gift = db.prepare("SELECT list_id FROM gifts WHERE id=?").get(v.id);
    if (!gift) throw new AppError("Envie introuvable.", 404);
    requireSurpriseReveal(db, access, String(gift.list_id));
    const rows = db
      .prepare(
        "SELECT id FROM gifts WHERE list_id=? ORDER BY position,created_at DESC,id",
      )
      .all(gift.list_id);
    const index = rows.findIndex((r) => r.id === v.id),
      other = index + (v.direction === "up" ? -1 : 1);
    if (other < 0 || other >= rows.length) return;
    [rows[index], rows[other]] = [rows[other], rows[index]];
    rows.forEach((r, i) =>
      db.prepare("UPDATE gifts SET position=? WHERE id=?").run(i, r.id),
    );
    audit(db, "gift.order", v.id);
  });
}
export function duplicateList(
  db: DatabaseSync,
  input: unknown,
  access: Access,
) {
  if (!access.owner)
    throw new AppError("Connexion administrateur requise.", 401);
  const v = z
    .object({
      id: text(64).min(1),
      name: text(80).min(1),
      event_date: z.union([z.literal(""), z.iso.date()]).default(""),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    const old = db.prepare("SELECT * FROM lists WHERE id=?").get(v.id);
    if (!old) throw new AppError("Liste introuvable.", 404);
    requireSurpriseReveal(db, access, v.id);
    const gifts = listGifts(db, true, access).filter(
      (g) => g.list_id === v.id && g.visibility === "visible",
    );
    const id = randomUUID();
    db.prepare(
      "INSERT INTO lists(id,name,description,visibility,event_date,created_at,surprise_mode,profile_id) VALUES (?,?,?,'private',?,?,?,?)",
    ).run(
      id,
      v.name,
      old.description,
      v.event_date,
      dateNow(),
      old.surprise_mode,
      old.profile_id,
    );
    for (const g of gifts) {
      const copy = saveGiftInTransaction(
        db,
        giftSchema.parse({
          ...g,
          list_id: id,
          target:
            g.budget_mode === "fixed"
              ? (g.target / g.quantity / 100).toFixed(2)
              : "",
          purchased: false,
          closed: false,
          allow_duplicate: true,
          offers: g.offers?.map(({ id: _id, ...o }) => o),
        }),
      );
      db.prepare("UPDATE gifts SET currency=?,position=? WHERE id=?").run(
        g.currency,
        g.position || 0,
        copy,
      );
    }
    db.prepare(
      "INSERT INTO list_preferences SELECT ?,field,value,visibility FROM list_preferences WHERE list_id=?",
    ).run(id, v.id);
    audit(db, "list.duplicate", id, { source: v.id, count: gifts.length });
    return { id, count: gifts.length };
  });
}
