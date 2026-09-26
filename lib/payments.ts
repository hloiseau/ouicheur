import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { atomic, audit } from "./db";
import { fundingTotalsSql } from "./gifts";
import {
  AppError,
  amountSchema,
  currencySchema,
  dateNow,
  money,
  paypalLink,
  text,
} from "./validation";

const intentSchema = z.object({
  gift_id: text(64).min(1),
  amount: amountSchema,
  nickname: text(60).default(""),
  message: text(1000).default(""),
  public_name: z.boolean().default(false),
  public_message: z.boolean().default(false),
});
export function createIntent(db: DatabaseSync, input: unknown) {
  const value = intentSchema.parse(input);
  return atomic(db, () => {
    const gift = db
      .prepare(
        `SELECT g.*,COALESCE(f.funded,0) funded FROM gifts g
        LEFT JOIN (${fundingTotalsSql}) f ON f.gift_id=g.id WHERE g.id=? AND g.visibility='visible'`,
      )
      .get(value.gift_id);
    if (!gift) throw new AppError("Cadeau introuvable.", 404);
    if (
      gift.closed ||
      gift.purchased ||
      Number(gift.funded) >= Number(gift.target)
    )
      throw new AppError("Le financement de ce cadeau est terminé.", 409);
    if (value.amount > Number(gift.target) - Number(gift.funded))
      throw new AppError(
        "La contribution ne peut pas dépasser le montant restant à financer.",
      );
    const owner = db
      .prepare("SELECT paypal,currency FROM owner WHERE id=1")
      .get()!;
    if (owner.currency !== gift.currency)
      throw new AppError(
        "Ce cadeau utilise une ancienne devise. Les nouvelles contributions sont fermées.",
        409,
      );
    const link = paypalLink(
      String(owner.paypal),
      value.amount,
      String(gift.currency),
    );
    const id = randomBytes(32).toString("hex");
    db.prepare(
      "INSERT INTO contributions(id,gift_id,amount,currency,nickname,message,public_name,public_message,state,created_at,expires_at,paypal_recipient) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      value.gift_id,
      value.amount,
      gift.currency,
      value.nickname,
      value.message,
      Number(value.public_name),
      Number(value.public_message),
      "intent",
      dateNow(),
      new Date(Date.now() + 7 * 86400000).toISOString(),
      owner.paypal,
    );
    return { id, paypal_url: link };
  });
}
export function expireIntents(db: DatabaseSync) {
  db.prepare(
    "UPDATE contributions SET state='expired' WHERE state='intent' AND expires_at<?",
  ).run(dateNow());
}
export function declareIntent(db: DatabaseSync, id: string) {
  const result = db
    .prepare(
      "UPDATE contributions SET state='declared' WHERE id=? AND state IN ('intent','expired')",
    )
    .run(id);
  if (
    !result.changes &&
    !db.prepare("SELECT 1 FROM contributions WHERE id=?").get(id)
  )
    throw new AppError("Contribution introuvable.", 404);
}
const reviewSchema = z.object({
  id: text(64).regex(/^[a-f0-9]{64}$/),
  approved: z.boolean(),
});
export function reviewContribution(db: DatabaseSync, input: unknown) {
  const value = reviewSchema.parse(input);
  return atomic(db, () => {
    const contribution = db
      .prepare("SELECT state,approved FROM contributions WHERE id=?")
      .get(value.id);
    if (!contribution) throw new AppError("Contribution introuvable.", 404);
    if (
      db.prepare("SELECT 1 FROM payments WHERE contribution_id=?").get(value.id)
    )
      throw new AppError("Utilisez une correction du versement confirmé.", 409);
    const state = value.approved ? "declared" : "rejected";
    if (
      contribution.approved === Number(value.approved) &&
      contribution.state === state
    )
      return;
    db.prepare("UPDATE contributions SET approved=?,state=? WHERE id=?").run(
      Number(value.approved),
      state,
      value.id,
    );
    audit(db, "contribution.review", value.id, {
      before: contribution,
      approved: value.approved,
    });
  });
}
const confirmationSchema = z.object({
  contribution_id: text(64).min(1),
  transaction_ref: text(100)
    .min(3)
    .transform((v) => v.toUpperCase()),
  gross: amountSchema,
  fee: z.string().transform((v) => (v.trim() === "" ? null : money(v, true))),
  currency: currencySchema,
  reason: text(1000).min(5),
  event_id: z.uuid(),
  recipient_checked: z.literal(true),
  association_checked: z.literal(true),
  received_checked: z.literal(true),
});
type Payment = {
  id: string;
  contribution_id: string;
  transaction_ref: string;
  currency: string;
  gross: number;
  fee: number | null;
  net: number | null;
  refunded: number;
  net_reversed: number;
  disputed: number;
  revision: number;
  provenance: string;
  created_at: string;
};
export function confirmManual(db: DatabaseSync, input: unknown) {
  return recordConfirmedPayment(db, input, "manual");
}

/** Internal adapter boundary. Only trusted server code may select provenance.
 * A future verified adapter must authenticate its source and validate recipient,
 * settled state, currency and unambiguous association before calling this function.
 * There is deliberately no HTTP endpoint for verified confirmations in V1.
 */
export function recordConfirmedPayment(
  db: DatabaseSync,
  input: unknown,
  provenance: "manual" | "verified",
) {
  const v = confirmationSchema.parse(input);
  if (v.fee !== null && v.fee > v.gross)
    throw new AppError("Les frais dépassent le montant reçu.");
  return atomic(db, () => {
    const contribution = db
      .prepare("SELECT * FROM contributions WHERE id=?")
      .get(v.contribution_id);
    if (!contribution) throw new AppError("Contribution introuvable.", 404);
    if (v.currency !== contribution.currency)
      throw new AppError("La devise doit correspondre à celle de l’intention.");
    const existing = db
      .prepare(
        "SELECT * FROM payments WHERE transaction_ref=? OR contribution_id=?",
      )
      .get(v.transaction_ref, v.contribution_id) as Payment | undefined;
    if (existing) {
      if (
        existing.transaction_ref === v.transaction_ref &&
        existing.contribution_id === v.contribution_id &&
        existing.gross === v.gross &&
        existing.fee === v.fee
      )
        return existing.id;
      throw new AppError(
        "Cette transaction ou cette contribution est déjà confirmée. Utilisez une correction explicite.",
        409,
      );
    }
    if (db.prepare("SELECT 1 FROM payment_events WHERE id=?").get(v.event_id))
      throw new AppError("Identifiant d’événement déjà utilisé.", 409);
    const id = randomUUID();
    db.prepare(
      "INSERT INTO payments(id,contribution_id,transaction_ref,currency,gross,fee,net,provenance,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      v.contribution_id,
      v.transaction_ref,
      v.currency,
      v.gross,
      v.fee,
      v.fee === null ? null : v.gross - v.fee,
      provenance,
      dateNow(),
    );
    db.prepare("INSERT INTO payment_events VALUES (?,?,?,?,?)").run(
      v.event_id,
      id,
      `confirmed_${provenance}`,
      JSON.stringify(v),
      dateNow(),
    );
    audit(db, `payment.confirm_${provenance}`, id, v);
    return id;
  });
}
// The ledger is independent of PayPal transport. A future verified adapter must validate
// authenticity, recipient, currency, state and an unambiguous association BEFORE adding a verified entry.
// No public notification endpoint or caller-controlled provenance is exposed in V1.
const correctionSchema = z.object({
  payment_id: z.uuid(),
  event_id: z.uuid(),
  revision: z.number().int().positive(),
  gross: amountSchema,
  fee: z.string().transform((v) => (v.trim() === "" ? null : money(v, true))),
  refunded: z.string().transform((v) => money(v, true)),
  net_reversed: z.string().transform((v) => money(v, true)),
  disputed: z.boolean(),
  reason: text(1000).min(5),
});
export function correctPayment(db: DatabaseSync, input: unknown) {
  const v = correctionSchema.parse(input);
  return atomic(db, () => {
    const previousEvent = db
      .prepare("SELECT payload FROM payment_events WHERE id=?")
      .get(v.event_id);
    if (previousEvent) {
      if (previousEvent.payload === JSON.stringify(v)) return;
      throw new AppError("Événement déjà utilisé avec d’autres données.", 409);
    }
    const p = db
      .prepare("SELECT * FROM payments WHERE id=?")
      .get(v.payment_id) as Payment | undefined;
    if (!p) throw new AppError("Versement introuvable.", 404);
    if (p.revision !== v.revision)
      throw new AppError(
        "Une autre correction a eu lieu. Rechargez les montants avant de continuer.",
        409,
      );
    const net = v.fee === null ? null : v.gross - v.fee;
    if (
      (v.fee !== null && v.fee > v.gross) ||
      v.refunded > v.gross ||
      v.net_reversed > (net ?? v.gross)
    )
      throw new AppError("Les montants cumulés dépassent le versement.");
    if (v.refunded === v.gross && v.net_reversed !== (net ?? v.gross))
      throw new AppError(
        "Un remboursement total doit retirer tout le financement de ce versement.",
      );
    db.prepare(
      "UPDATE payments SET gross=?,fee=?,net=?,refunded=?,net_reversed=?,disputed=?,revision=revision+1,provenance='manual' WHERE id=?",
    ).run(
      v.gross,
      v.fee,
      net,
      v.refunded,
      v.net_reversed,
      Number(v.disputed),
      p.id,
    );
    db.prepare("INSERT INTO payment_events VALUES (?,?,?,?,?)").run(
      v.event_id,
      p.id,
      "correction_manual",
      JSON.stringify(v),
      dateNow(),
    );
    audit(db, "payment.correct_manual", p.id, { before: p, after: v });
  });
}
export function contributionStatus(db: DatabaseSync, id: string) {
  expireIntents(db);
  const c = db
    .prepare(
      "SELECT id,gift_id,amount,currency,state,approved,expires_at FROM contributions WHERE id=?",
    )
    .get(id);
  if (!c) throw new AppError("Contribution introuvable.", 404);
  const payment = db
    .prepare(
      "SELECT gross,fee,net,refunded,net_reversed,disputed,provenance FROM payments WHERE contribution_id=?",
    )
    .get(id);
  const recipient = db
    .prepare("SELECT paypal_recipient FROM contributions WHERE id=?")
    .get(id)!;
  return {
    ...c,
    state: String(c.state),
    approved: Number(c.approved),
    payment: payment || null,
    paypal_url:
      !payment && c.state === "intent"
        ? paypalLink(
            String(recipient.paypal_recipient),
            Number(c.amount),
            String(c.currency),
          )
        : null,
  };
}
