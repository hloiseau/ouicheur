import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { listGifts } from "./gifts.ts";
import { listLists, type Access } from "./lists.ts";
import { listPriorities } from "./priorities.ts";
import { filterWishlist } from "./wishlist-filters.ts";
import { hasBudget } from "./wish-details.ts";
import { AppError } from "./validation.ts";
const querySchema = z
  .object({
    mode: z.enum(["public", "owner", "team"]).default("public"),
    list: z.string().max(64).default(""),
    search: z.string().trim().max(300).default(""),
    category: z.string().max(64).default(""),
    priority: z.string().regex(/^\d*$/).max(16).default(""),
    view: z.enum(["all", "favorites", "completed", "archived"]).default("all"),
    currency: z
      .union([z.literal(""), z.string().regex(/^[A-Z]{3}$/)])
      .default(""),
    basis: z.enum(["unit", "total", "remaining"]).default("unit"),
    minimum: z.coerce.number().int().min(0).max(100000000).optional(),
    maximum: z.coerce.number().int().min(0).max(100000000).optional(),
    available: z.enum(["0", "1"]).default("0"),
    sort: z
      .enum([
        "manual",
        "priority",
        "price",
        "price-desc",
        "unit-price",
        "unit-price-desc",
        "remaining",
        "progress",
        "title",
      ])
      .default("priority"),
    locale: z.enum(["fr", "en"]).default("en"),
    cursor: z.string().max(2048).default(""),
    limit: z.coerce.number().int().min(1).max(60).default(24),
  })
  .strict();
export type WishlistQuery = z.input<typeof querySchema>;
function cursorKey(db: DatabaseSync) {
  return String(
    db.prepare("SELECT password_hash FROM owner WHERE id=1").get()
      ?.password_hash || "",
  );
}
function encodeCursor(
  db: DatabaseSync,
  value: { version: string; last: string; issued: number },
) {
  const raw = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${raw}.${createHmac("sha256", cursorKey(db)).update(raw).digest("base64url")}`;
}
function decodeCursor(db: DatabaseSync, input: string) {
  try {
    const [raw, mac, ...extra] = input.split("."),
      expected = createHmac("sha256", cursorKey(db)).update(raw).digest(),
      actual = Buffer.from(mac || "", "base64url");
    if (
      extra.length ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    )
      throw Error();
    const value = z
      .object({
        version: z.string().length(64),
        last: z.uuid(),
        issued: z.number().int(),
      })
      .strict()
      .parse(JSON.parse(Buffer.from(raw, "base64url").toString()));
    if (value.issued > Date.now() + 1000 || value.issued < Date.now() - 3600000)
      throw Error();
    return value;
  } catch {
    throw new AppError(
      "La liste a changé. Actualisez les résultats pour continuer.",
      409,
    );
  }
}
export function queryWishlist(
  db: DatabaseSync,
  input: unknown,
  original: Access,
) {
  const q = querySchema.parse(input),
    admin = q.mode !== "public";
  if (q.mode === "owner" && !original.owner)
    throw new AppError("Connexion administrateur requise.", 401);
  if (q.mode === "team" && !original.memberId)
    throw new AppError("Connexion coorganisateur requise.", 401);
  const access = q.mode === "public" ? { ...original, owner: false } : original;
  db.exec("BEGIN");
  try {
    const lists = listLists(db, access).filter(
      (l) =>
        (!q.list || l.id === q.list) &&
        (!admin || access.owner || access.managedLists?.includes(l.id)),
    );
    if (q.list && !lists.length) throw new AppError("Liste introuvable.", 404);
    // Authorization is applied by SQL before materializing gifts or their offers.
    const all = listGifts(db, admin, access, { listId: q.list || undefined });
    const priorities = listPriorities(db).filter(
      (p) => admin || all.some((g) => g.priority === p.id),
    );
    const featured = priorities.find((p) => p.featured),
      active = all.filter((g) => g.visibility !== "archived"),
      archived = all.filter((g) => g.visibility === "archived");
    const hidden = active.some((g) => g.surprise_hidden),
      view = hidden && q.view === "completed" ? "all" : q.view;
    const completed = (g: (typeof all)[number]) =>
      !!g.purchased || (hasBudget(g) && g.funded >= g.target);
    const scoped = (view === "archived" && admin ? archived : active).filter(
      (g) =>
        view === "favorites"
          ? g.priority === featured?.id
          : view === "completed"
            ? completed(g)
            : true,
    );
    const categoryStats = new Map<
      string,
      { count: number; preview_image: string }
    >();
    for (const gift of scoped) {
      if (!gift.category_id) continue;
      const stats = categoryStats.get(gift.category_id) || {
        count: 0,
        preview_image: "",
      };
      stats.count++;
      if (!stats.preview_image && gift.image) stats.preview_image = gift.image;
      categoryStats.set(gift.category_id, stats);
    }
    const categories = db
      .prepare("SELECT id,name,image FROM categories ORDER BY name,id")
      .all()
      .filter((c) => categoryStats.has(String(c.id)))
      .map((c) => ({
        id: String(c.id),
        name: String(c.name),
        image: String(c.image),
        ...categoryStats.get(String(c.id))!,
      }));
    const available = q.available === "1" && !hidden;
    // Stable initial order supplies the tie-break for every comparator.
    const ordered = scoped;
    const filtered = filterWishlist(
      ordered.filter(
        (g) =>
          (!q.category || g.category_id === q.category) &&
          (!q.priority || g.priority === Number(q.priority)) &&
          (!available || !lists.find((l) => l.id === g.list_id)?.archived),
      ),
      {
        search: q.search,
        currency: q.currency,
        basis: q.basis,
        minimum: q.minimum ?? null,
        maximum: q.maximum ?? null,
        availableOnly: available,
        sort: q.sort,
        locale: q.locale,
        priorityOrder: Object.fromEntries(
          priorities.map((p) => [p.id, p.position]),
        ),
      },
    );
    const { cursor: _cursor, ...filters } = q;
    // A digest, never a counter or data from an inaccessible list. Any relevant
    // change invalidates continuation rather than duplicating or skipping cards.
    const version = createHash("sha256")
      .update(JSON.stringify([filters, lists, all, priorities, categories]))
      .digest("hex");
    const cursor = q.cursor ? decodeCursor(db, q.cursor) : null;
    if (cursor && cursor.version !== version)
      throw new AppError(
        "La liste a changé. Actualisez les résultats pour continuer.",
        409,
      );
    const previous = cursor
      ? filtered.findIndex((g) => g.id === cursor.last)
      : -1;
    if (cursor && previous < 0)
      throw new AppError(
        "La liste a changé. Actualisez les résultats pour continuer.",
        409,
      );
    const items = filtered.slice(previous + 1, previous + 1 + q.limit),
      last = items.at(-1);
    const result = {
      items,
      total: filtered.length,
      version,
      next:
        last && previous + 1 + items.length < filtered.length
          ? encodeCursor(db, {
              version,
              last: last.id,
              issued: cursor?.issued || Date.now(),
            })
          : null,
      counts: {
        all: active.length,
        favorites: active.filter((g) => g.priority === featured?.id).length,
        completed: hidden ? null : active.filter(completed).length,
        archived: admin ? archived.length : 0,
      },
      categories,
      category_total: scoped.length,
      priorities,
      currencies: [...new Set(all.map((g) => g.currency))].sort(),
      hidden,
      all_total: all.length,
      mode: q.mode,
    };
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export type WishlistPage = ReturnType<typeof queryWishlist>;
