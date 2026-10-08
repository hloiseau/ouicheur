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
