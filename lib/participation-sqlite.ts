import type { DatabaseSync } from "node:sqlite";
import type { Access } from "./lists.ts";
import { atomic } from "./db.ts";
import { AppError } from "./validation.ts";
import { requireCatalogOwner } from "./catalog.ts";
import { readParticipationGift } from "./participation-sqlite-context.ts";
import {
  createReservationCommand,
  reservationStatus,
  updateReservation,
  cancelReservationCommand,
  reservedQuantity,
} from "./reservations.ts";
import {
  createIntentCommand,
  contributionStatus,
  declareIntent,
  cancelPledge,
  reviewContributionInTransaction,
  recordConfirmedPaymentInTransaction,
  correctPaymentInTransaction,
} from "./payments.ts";
import {
  fundingExpressions,
  reservationPrivacy,
  reservationStateSql,
  reservationFilterSql,
  type OwnerCancellationCommand,
  type ReservationPageQuery,
  type ReservationPage,
  type ParticipationStore,
  type ReservationCommand,
  type ReservationState,
  type IntentCommand,
  type ContributionStatus,
  type ReviewCommand,
  type ConfirmationCommand,
  type CorrectionCommand,
  type FundingTotals,
} from "./participation.ts";

export class SqliteParticipationStore implements ParticipationStore {
  readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  // No await inside atomic: synchronous compatibility callers keep the same
  // transaction, while server integrations use the shared asynchronous service.
  async createReservation(v: ReservationCommand, access: Access) {
    return createReservationCommand(this.db, v, access);
  }
  async reservationStatus(token: string) {
    return atomic(this.db, () => reservationStatus(this.db, token));
  }
  async updateReservation(token: string, state: ReservationState) {
    updateReservation(this.db, token, { state });
  }
  async cancelReservation(v: OwnerCancellationCommand, access: Access) {
    cancelReservationCommand(this.db, v, access);
  }
  async reservationPage(
    v: ReservationPageQuery,
    access: Access,
  ): Promise<ReservationPage> {
    requireCatalogOwner(access);
    return atomic(this.db, () => {
      const privacy = reservationPrivacy(access);
      const recipients =
        privacy.recipients === null ? null : JSON.stringify(privacy.recipients);
      const hidden =
        "l.surprise_mode=1 AND ? AND (? IS NULL OR l.id IN (SELECT value FROM json_each(?)))";
      const bindings = [Number(privacy.protect), recipients, recipients];
      const rows = this.db
        .prepare(
          `WITH page AS (
        SELECT r.id,r.gift_id,g.list_id,g.title gift_title,l.name list_name,r.quantity,
        ${reservationStateSql("?")} state,r.created_at,r.expires_at
        FROM reservations r JOIN gifts g ON g.id=r.gift_id JOIN lists l ON l.id=g.list_id
        WHERE NOT (${hidden}) AND (? IS NULL OR r.gift_id=?)
        AND (? IS NULL OR (r.created_at,r.id)<(?,?)))
        SELECT * FROM page WHERE ${reservationFilterSql(v.filter)} ORDER BY created_at DESC,id DESC LIMIT 51`,
        )
        .all(
          new Date().toISOString(),
          ...bindings,
          v.gift_id ?? null,
          v.gift_id ?? null,
          v.after?.time ?? null,
          v.after?.time ?? null,
          v.after?.id ?? null,
        ) as ReservationPage["items"];
      const last = rows[49];
      return {
        items: rows.slice(0, 50),
        next: rows.length > 50 ? { time: last.created_at, id: last.id } : null,
        hidden_surprises: !!this.db
          .prepare(`SELECT 1 FROM lists l WHERE ${hidden} LIMIT 1`)
          .get(...bindings),
        revealed: !!access.revealSurprises,
      };
    });
  }
  async createIntent(v: IntentCommand, access: Access) {
    return createIntentCommand(this.db, v, access);
  }
  async contributionStatus(id: string) {
    return atomic(this.db, () =>
      contributionStatus(this.db, id),
    ) as ContributionStatus;
  }
  async declareIntent(id: string) {
    declareIntent(this.db, id);
  }
  async cancelPledge(id: string) {
    cancelPledge(this.db, id);
  }
  private ownerContribution(id: string, access: Access) {
    requireCatalogOwner(access);
    const c = this.db
      .prepare("SELECT gift_id FROM contributions WHERE id=?")
      .get(id);
    if (!c) throw new AppError("Contribution introuvable.", 404);
    readParticipationGift(this.db, String(c.gift_id), access);
  }
  async reviewContribution(v: ReviewCommand, access: Access) {
    atomic(this.db, () => {
      this.ownerContribution(v.id, access);
      reviewContributionInTransaction(this.db, v);
    });
  }
  async confirmManual(v: ConfirmationCommand, access: Access) {
    return atomic(this.db, () => {
      this.ownerContribution(v.contribution_id, access);
      return recordConfirmedPaymentInTransaction(this.db, v, "manual");
    });
  }
  async correctPayment(v: CorrectionCommand, access: Access) {
    atomic(this.db, () => {
      requireCatalogOwner(access);
      const p = this.db
        .prepare("SELECT contribution_id FROM payments WHERE id=?")
        .get(v.payment_id);
      if (!p) throw new AppError("Versement introuvable.", 404);
      this.ownerContribution(String(p.contribution_id), access);
      correctPaymentInTransaction(this.db, v);
    });
  }
  async fundingTotals(id: string, access: Access): Promise<FundingTotals> {
    return atomic(this.db, () => {
      requireCatalogOwner(access);
      readParticipationGift(this.db, id, access);
      const expressions = fundingExpressions(
        "sqlite",
        "(SELECT strict_contributions FROM owner WHERE id=1)",
      );
      const fields = Object.entries(expressions)
        .map(([key, sql]) => `COALESCE(SUM(${sql}),0) ${key}`)
        .join(",");
      const row = this.db
        .prepare(
          `SELECT ${fields} FROM contributions c LEFT JOIN payments p ON p.contribution_id=c.id WHERE c.gift_id=?`,
        )
        .get(id)!;
      return {
        ...row,
        reserved: reservedQuantity(this.db, id),
      } as FundingTotals;
    });
  }
}
