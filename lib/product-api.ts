import { bulkGifts, reorderGift, duplicateList } from "./organization";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  backupHistory,
  createBackup,
  diagnostics,
  downloadBackup,
} from "./operations";
import { cleanup, cleanupPreview } from "./storage";
import { getSettings, saveSettings } from "./settings";
import { enqueueNotification, deliverNotifications } from "./notifications";
import { applyProductPrice, refreshProduct } from "./product-refresh";
import { atomic, audit } from "./db";
import { rateLimit } from "./auth";
import { AppError, text } from "./validation";
import type { Access } from "./lists";
import { requireSurpriseReveal } from "./surprise";

const json = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "private, no-store" } });
// Called only after the owner's session (and POST Origin) have been checked.
export async function productGet(
  db: DatabaseSync,
  path: string,
  url: URL,
  access: Access = { owner: true, lists: [] },
): Promise<Response | undefined> {
  if (
    ["admin/operations", "admin/diagnostics"].includes(path) ||
    path.startsWith("admin/backups/")
  )
    requireSurpriseReveal(db, access);
  if (path === "admin/operations") {
    const { files, before, ...storage } = cleanupPreview(db);
    return json({
      settings: getSettings(db),
      diagnostics: diagnostics(db),
      backups: backupHistory(db),
      cleanup: storage,
    });
  }
  if (path === "admin/diagnostics")
    return new Response(JSON.stringify(diagnostics(db), null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition":
          'attachment; filename="ouicheur-diagnostics.json"',
        "Cache-Control": "no-store",
      },
    });
  if (path.startsWith("admin/backups/"))
    return downloadBackup(db, path.split("/")[2]);
  if (path === "admin/history") {
    const kind = z
      .enum(["contributions", "audit", "imports", "reservations"])
      .parse(url.searchParams.get("kind"));
    const giftId =
      kind === "reservations" && url.searchParams.has("gift_id")
        ? z.uuid().parse(url.searchParams.get("gift_id"))
        : undefined;
    if (giftId) {
      const gift = db
        .prepare("SELECT list_id FROM gifts WHERE id=?")
        .get(giftId);
      if (!gift) throw new AppError("Envie introuvable.", 404);
      requireSurpriseReveal(db, access, String(gift.list_id));
    } else if (kind === "audit" || kind === "reservations")
      requireSurpriseReveal(db, access);
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000000)
      .parse(url.searchParams.get("page") || "0");
    const queries = {
      contributions:
        "SELECT c.*,g.title gift_title,p.id payment_id,p.transaction_ref,p.gross,p.fee,p.net,p.refunded,p.net_reversed,p.disputed,p.revision,p.provenance FROM contributions c JOIN gifts g ON g.id=c.gift_id LEFT JOIN payments p ON p.contribution_id=c.id ORDER BY c.created_at DESC,c.id DESC",
      audit: "SELECT * FROM audit ORDER BY id DESC",
      imports:
        "SELECT id,source,state,attempts,error,created_at FROM imports ORDER BY created_at DESC,id DESC",
      reservations:
        "SELECT r.id,r.quantity,r.state,r.expires_at,r.created_at,g.title FROM reservations r JOIN gifts g ON g.id=r.gift_id ORDER BY r.created_at DESC,r.id DESC",
    };
    db.prepare(
      "UPDATE reservations SET state='expired' WHERE state='reserved' AND expires_at<=?",
    ).run(new Date().toISOString());
    return json({
      items: giftId
        ? db
            .prepare(
              "SELECT r.id,r.quantity,r.state,r.expires_at,r.created_at,g.title FROM reservations r JOIN gifts g ON g.id=r.gift_id WHERE r.gift_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 50 OFFSET ?",
            )
            .all(giftId, page * 50)
        : db.prepare(queries[kind] + " LIMIT 50 OFFSET ?").all(page * 50),
      total: Number(
        giftId
          ? db
              .prepare("SELECT COUNT(*) n FROM reservations WHERE gift_id=?")
              .get(giftId)!.n
          : db.prepare(`SELECT COUNT(*) n FROM ${kind}`).get()!.n,
      ),
      page,
    });
  }
}
export async function productPost(
  db: DatabaseSync,
  path: string,
  data: unknown,
  access: Access = { owner: true, lists: [] },
): Promise<Response | undefined> {
  if (path === "admin/gifts/bulk") return json(bulkGifts(db, data, access));
  if (path === "admin/gifts/order") {
    reorderGift(db, data, access);
    return json({ ok: true });
  }
  if (path === "admin/lists/duplicate")
    return json(duplicateList(db, data, access));
  if (path === "admin/settings") return json(saveSettings(db, data));
  if (path === "admin/backups") {
    rateLimit(db, "backup-create", 5, 3600000);
    return json({ id: await createBackup(db) });
  }
  if (path === "admin/cleanup") {
    const v = z
      .object({
        confirm: z.literal(true),
        token: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(data);
    return json(cleanup(db, undefined, v.token));
  }
  if (path === "admin/notifications/test") {
    rateLimit(db, "notification-test", 5, 60000);
    if (!getSettings(db).notifications || !process.env.NTFY_URL)
      throw new AppError(
        "Activez les notifications et configurez NTFY_URL sur le serveur.",
      );
    enqueueNotification(db, "test", randomUUID());
    await deliverNotifications(db);
    return json({ ok: true });
  }
  if (path === "admin/products/refresh") {
    rateLimit(db, "extract", 20, 60000);
    const v = z.object({ id: z.uuid() }).parse(data);
    return json(await refreshProduct(db, v.id));
  }
  if (path === "admin/products/apply") {
    const v = z.object({ id: z.uuid() }).parse(data);
    applyProductPrice(db, v.id);
    return json({ ok: true });
  }
  if (path === "admin/reservations/cancel") {
    const v = z.object({ id: z.uuid(), confirm: z.literal(true) }).parse(data);
    atomic(db, () => {
      const reservation = db
        .prepare(
          "SELECT r.state,r.expires_at,g.list_id FROM reservations r JOIN gifts g ON g.id=r.gift_id WHERE r.id=?",
        )
        .get(v.id);
      if (!reservation) throw new AppError("Réservation introuvable.", 404);
      requireSurpriseReveal(db, access, String(reservation.list_id));
      if (
        !["reserved", "purchased"].includes(String(reservation.state)) ||
        (reservation.state === "reserved" &&
          String(reservation.expires_at) <= new Date().toISOString())
      )
        throw new AppError("Cette réservation n’est plus active.", 409);
      db.prepare("UPDATE reservations SET state='cancelled' WHERE id=?").run(
        v.id,
      );
      audit(db, "reservation.cancel_owner", v.id);
    });
    return json({ ok: true });
  }
  if (path === "admin/gifts/move") {
    const v = z
      .object({
        ids: z.array(z.uuid()).min(1).max(500),
        list_id: text(64).min(1),
      })
      .parse(data);
    atomic(db, () => {
      if (!db.prepare("SELECT 1 FROM lists WHERE id=?").get(v.list_id))
        throw new AppError("Liste introuvable.", 404);
      for (const id of v.ids)
        db.prepare("UPDATE gifts SET list_id=? WHERE id=?").run(v.list_id, id);
      audit(db, "gifts.move", v.list_id, { count: v.ids.length });
    });
    return json({ ok: true });
  }
}
