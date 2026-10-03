import { offerIdentity, recordOfferPrice } from "./price-history.ts";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { atomic, audit } from "./db.ts";
import { extractMetadata } from "./metadata.ts";
import { AppError, dateNow } from "./validation.ts";

export async function refreshProduct(
  db: DatabaseSync,
  id: string,
  extract = extractMetadata,
) {
  const gift = db
    .prepare("SELECT url,target,quantity FROM gifts WHERE id=?")
    .get(id);
  if (!gift) throw new AppError("Cadeau introuvable.", 404);
  const identity = offerIdentity(db, id);
  const check = randomUUID();
  try {
    const m = await extract(String(gift.url));
    recordOfferPrice(db, identity, m, "manual");
    db.prepare(
      "INSERT INTO product_checks(id,gift_id,url,price,currency,availability,previous_target,quantity,checked_at,fingerprint,state) VALUES (?,?,?,?,?,?,?,?,?,?,'ok')",
    ).run(
      check,
      id,
      gift.url,
      m.price,
      m.currency,
      m.availability,
      gift.target,
      gift.quantity,
      dateNow(),
      identity.fingerprint,
    );
  } catch {
    recordOfferPrice(db, identity, null, "manual");
    db.prepare(
      "INSERT INTO product_checks(id,gift_id,url,previous_target,quantity,checked_at,state) VALUES (?,?,?,?,?,?,'failed')",
    ).run(check, id, gift.url, gift.target, gift.quantity, dateNow());
  }
  return db.prepare("SELECT * FROM product_checks WHERE id=?").get(check)!;
}
export function applyProductPrice(db: DatabaseSync, id: string) {
  return atomic(db, () => {
    const check = db.prepare("SELECT * FROM product_checks WHERE id=?").get(id);
    if (!check || check.state !== "ok" || !check.price || check.applied)
      throw new AppError("Ce prix ne peut pas être appliqué.", 409);
    const gift = db
      .prepare("SELECT * FROM gifts WHERE id=?")
      .get(check.gift_id)!;
    if (
      gift.budget_mode !== "fixed" ||
      offerIdentity(db, String(gift.id)).fingerprint !== check.fingerprint ||
      gift.url !== check.url ||
      gift.target !== check.previous_target ||
      gift.quantity !== check.quantity ||
      gift.currency !== check.currency ||
      Date.parse(String(check.checked_at)) < Date.now() - 86400000
    )
      throw new AppError(
        "L’envie ou le prix a changé. Actualisez avant de confirmer.",
        409,
      );
    const target = Number(check.price) * Number(gift.quantity);
    if (!Number.isSafeInteger(target) || target > 100000000)
      throw new AppError("Montant hors limites (maximum 1 000 000).");
    db.prepare(
      "UPDATE gifts SET target=?,suggested_price=?,suggested_currency=?,extracted_at=?,updated_at=? WHERE id=?",
    ).run(
      target,
      check.price,
      check.currency,
      check.checked_at,
      dateNow(),
      gift.id,
    );
    db.prepare("UPDATE product_checks SET applied=1 WHERE id=?").run(id);
    audit(db, "gift.price.apply", String(gift.id), {
      before: gift.target,
      after: target,
      check: id,
    });
  });
}
