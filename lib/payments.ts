import { participationAudit } from "./participation-audit.ts";
import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { atomic, audit } from "./db";
import { publicAccess, type Access } from "./lists.ts";
import { reservedQuantity } from "./reservations.ts";
import { enqueueNotification } from "./notifications.ts";
import { fundingTotalsSql } from "./gifts";
import { readParticipationGift } from "./participation-sqlite-context.ts";
import {
  intentSchema,
  intentDecision,
  declarationDecision,
  pledgeCancellationDecision,
  reviewSchema,
  reviewDecision,
  confirmationSchema,
  confirmationDecision,
  correctionSchema,
  correctionDecision,
  type Payment,
  type IntentCommand,
  type ReviewCommand,
  type ConfirmationCommand,
  type CorrectionCommand,
} from "./participation.ts";
import { AppError, dateNow, paypalLink } from "./validation";

function recordAudit(
  db: DatabaseSync,
  action: string,
  id: string,
  detail: unknown = {},
) {
  const entry = participationAudit(action, id, detail);
  audit(db, action, entry.id, entry.detail);
}

export function createIntent(
  db: DatabaseSync,
  input: unknown,
  access: Access = publicAccess,
) {
  return createIntentCommand(db, intentSchema.parse(input), access);
}
export function createIntentCommand(
  db: DatabaseSync,
  value: IntentCommand,
  access: Access,
) {
  return atomic(db, () => {
    const gift = readParticipationGift(db, value.gift_id, access);
    const funded = Number(
      db
        .prepare(`SELECT funded FROM (${fundingTotalsSql}) WHERE gift_id=?`)
        .get(value.gift_id)?.funded ?? 0,
    );
    const owner = db
      .prepare("SELECT paypal,currency FROM owner WHERE id=1")
      .get()!;
    const link = intentDecision(
      gift,
      value,
      reservedQuantity(db, value.gift_id),
      funded,
      { currency: String(owner.currency), paypal: String(owner.paypal) },
    );
    const id = randomBytes(32).toString("hex");
    db.prepare(
      "INSERT INTO contributions(id,gift_id,amount,currency,nickname,message,public_name,public_message,state,created_at,expires_at,paypal_recipient,method) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      value.gift_id,
      value.amount,
      gift.currency,
      value.nickname,
      value.message,
      Number(value.public_name),
      Number(value.public_message),
      value.method === "bank_transfer" ? "declared" : "intent",
      dateNow(),
      new Date(Date.now() + 7 * 86400000).toISOString(),
      value.method === "paypal" ? owner.paypal : "",
      value.method,
    );
    if (value.method === "bank_transfer")
      enqueueNotification(db, "declaration", id);
    return { id, paypal_url: link };
  });
}
export function expireIntents(db: DatabaseSync) {
  db.prepare(
    "UPDATE contributions SET state='expired' WHERE state='intent' AND method<>'pledge' AND expires_at<?",
  ).run(dateNow());
}
export function declareIntent(db: DatabaseSync, id: string) {
  return atomic(db, () => {
    const c = db
      .prepare("SELECT gift_id,state,method FROM contributions WHERE id=?")
      .get(id);
    if (
      !declarationDecision(
        c as { method: string; state: string } | undefined,
        c ? reservedQuantity(db, String(c.gift_id)) : 0,
      )
    )
      return;
    const result = db
      .prepare(
        "UPDATE contributions SET state='declared' WHERE id=? AND state IN ('intent','expired')",
      )
      .run(id);
    if (result.changes) enqueueNotification(db, "declaration", id);
  });
}

export function cancelPledge(db: DatabaseSync, id: string) {
  return atomic(db, () => {
    const c = db
      .prepare("SELECT method,state,approved FROM contributions WHERE id=?")
      .get(id);
    if (
      !pledgeCancellationDecision(
        c as { method: string; state: string; approved: number } | undefined,
        !!db.prepare("SELECT 1 FROM payments WHERE contribution_id=?").get(id),
      )
    )
      return;
    db.prepare(
      "UPDATE contributions SET state='expired',expires_at=? WHERE id=?",
    ).run(dateNow(), id);
    recordAudit(db, "contribution.cancel_pledge", id);
  });
}

export function reviewContribution(db: DatabaseSync, input: unknown) {
  const value = reviewSchema.parse(input);
  return atomic(db, () => reviewContributionInTransaction(db, value));
}
// Internal compatibility helpers: the caller owns the synchronous transaction.
export function reviewContributionInTransaction(
  db: DatabaseSync,
  value: ReviewCommand,
) {
  const contribution = db
    .prepare("SELECT state,approved FROM contributions WHERE id=?")
    .get(value.id);
  const { state, changed } = reviewDecision(
    contribution as { state: string; approved: number } | undefined,
    !!db
      .prepare("SELECT 1 FROM payments WHERE contribution_id=?")
      .get(value.id),
    value.approved,
  );
  if (!changed) return;
  db.prepare("UPDATE contributions SET approved=?,state=? WHERE id=?").run(
    Number(value.approved),
    state,
    value.id,
  );
  recordAudit(db, "contribution.review", value.id, {
    before: contribution,
    approved: value.approved,
  });
}
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
  const value = confirmationSchema.parse(input);
  return atomic(db, () =>
    recordConfirmedPaymentInTransaction(db, value, provenance),
  );
}
export function recordConfirmedPaymentInTransaction(
  db: DatabaseSync,
  v: ConfirmationCommand,
  provenance: "manual" | "verified",
) {
  const contribution = db
    .prepare("SELECT * FROM contributions WHERE id=?")
    .get(v.contribution_id);
  const existing = db
    .prepare(
      "SELECT * FROM payments WHERE transaction_ref=? OR contribution_id=?",
    )
    .get(v.transaction_ref, v.contribution_id) as Payment | undefined;
  const existingId = confirmationDecision(
    v,
    contribution as { currency: string } | undefined,
    existing,
    !!db.prepare("SELECT 1 FROM payment_events WHERE id=?").get(v.event_id),
  );
  if (existingId) return existingId;
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
  recordAudit(db, `payment.confirm_${provenance}`, id, v);
  return id;
}
// The ledger is independent of PayPal transport. A future verified adapter must validate
// authenticity, recipient, currency, state and an unambiguous association BEFORE adding a verified entry.
// No public notification endpoint or caller-controlled provenance is exposed in V1.
export function correctPayment(db: DatabaseSync, input: unknown) {
  const value = correctionSchema.parse(input);
  return atomic(db, () => correctPaymentInTransaction(db, value));
}
export function correctPaymentInTransaction(
  db: DatabaseSync,
  v: CorrectionCommand,
) {
  const previousEvent = db
    .prepare("SELECT payload FROM payment_events WHERE id=?")
    .get(v.event_id);
  const p = db
    .prepare("SELECT * FROM payments WHERE id=?")
    .get(v.payment_id) as Payment | undefined;
  const { changed, net } = correctionDecision(
    v,
    p,
    previousEvent ? String(previousEvent.payload) : undefined,
  );
  if (!changed) return;
  db.prepare(
    "UPDATE payments SET gross=?,fee=?,net=?,refunded=?,net_reversed=?,disputed=?,revision=revision+1,provenance='manual' WHERE id=?",
  ).run(
    v.gross,
    v.fee,
    net,
    v.refunded,
    v.net_reversed,
    Number(v.disputed),
    p!.id,
  );
  db.prepare("INSERT INTO payment_events VALUES (?,?,?,?,?)").run(
    v.event_id,
    p!.id,
    "correction_manual",
    JSON.stringify(v),
    dateNow(),
  );
  recordAudit(db, "payment.correct_manual", p!.id, { before: p, after: v });
}
export function contributionStatus(db: DatabaseSync, id: string) {
  expireIntents(db);
  const c = db
    .prepare(
      "SELECT id,gift_id,amount,currency,state,approved,expires_at,method FROM contributions WHERE id=?",
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
    method: String(c.method),
    strict_contributions: Number(
      db.prepare("SELECT strict_contributions FROM owner WHERE id=1").get()!
        .strict_contributions,
    ),
    state: String(c.state),
    approved: Number(c.approved),
    payment: payment || null,
    paypal_url:
      !payment && c.state === "intent" && c.method === "paypal"
        ? paypalLink(
            String(recipient.paypal_recipient),
            Number(c.amount),
            String(c.currency),
          )
        : null,
  };
}
