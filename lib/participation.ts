import { z } from "zod";
import type { Access } from "./lists.ts";
import type { ReservedDetails } from "./reservation-details.ts";
import { requireCatalogOwner } from "./catalog.ts";
import {
  AppError,
  amountSchema,
  currencySchema,
  money,
  paypalLink,
  text,
} from "./validation.ts";

// These decisions run inside either adapter's transaction. Access must come
// from verified server context; a tenant ID or request body grants no rights.
export type ParticipationGift = {
  list_id: string;
  visibility: string;
  list_visibility: string;
  archived: number;
  surprise_mode: number;
  closed: number;
  purchased: number;
  quantity: number;
  budget_mode: string;
  target: number;
  currency: string;
};
export function participationAccess(
  g: ParticipationGift | undefined,
  access: Access,
) {
  if (
    !g ||
    (!access.owner &&
      (g.visibility !== "visible" ||
        !(
          access.managedLists?.includes(g.list_id) ||
          (!g.archived &&
            (g.list_visibility === "public" ||
              (g.list_visibility === "unlisted" &&
                access.lists.includes(g.list_id))))
        )))
  )
    throw new AppError("Cadeau introuvable.", 404);
  participationReveal(g, access);
  return g;
}
export function participationReveal(
  g: Pick<ParticipationGift, "list_id" | "surprise_mode">,
  access: Access,
) {
  if (
    g.surprise_mode &&
    (access.recipient ?? access.owner) &&
    !access.revealSurprises &&
    (access.recipientLists === undefined ||
      access.recipientLists.includes(g.list_id))
  )
    throw new AppError(
      "Révélez les surprises pour cette session avant d’ouvrir ces informations ou de modifier cette envie.",
      409,
    );
}
export const reservationSchema = z.object({
  gift_id: text(64).min(1),
  offer_id: z.uuid().nullable().default(null),
  quantity: z.number().int().min(1).max(999),
});
export const reservationStateSchema = z.object({
  state: z.enum(["purchased", "cancelled"]),
});
export type ReservationCommand = z.infer<typeof reservationSchema>;
export type ReservationState = z.infer<typeof reservationStateSchema>["state"];
export function reservationDecision(
  g: ParticipationGift,
  quantity: number,
  reserved: number,
  hasContributions: boolean,
) {
  if (g.closed || g.purchased || g.visibility !== "visible" || g.archived)
    throw new AppError("Cette envie est fermée.", 409);
  if (hasContributions)
    throw new AppError(
      "Des contributions existent déjà pour cette envie. La réservation est indisponible.",
      409,
    );
  if (reserved + quantity > g.quantity)
    throw new AppError(
      "Cette quantité vient d’être réservée. Rechargez la page.",
      409,
    );
}
export function reservationStateDecision(
  row: { state: string; expires_at: string } | undefined,
  state: ReservationState,
  now: string,
) {
  if (!row) throw new AppError("Réservation introuvable.", 404);
  if (row.state === state) return false;
  if (
    (row.state !== "reserved" &&
      !(row.state === "purchased" && state === "cancelled")) ||
    (row.state === "reserved" && row.expires_at <= now)
  )
    throw new AppError("Cette réservation n’est plus active.", 409);
  return true;
}
export const intentSchema = z.object({
  gift_id: text(64).min(1),
  amount: amountSchema,
  method: z.enum(["paypal", "bank_transfer", "pledge"]).default("paypal"),
  nickname: text(60).default(""),
  message: text(1000).default(""),
  public_name: z.boolean().default(false),
  public_message: z.boolean().default(false),
});
export type IntentCommand = z.infer<typeof intentSchema>;
export function intentDecision(
  g: ParticipationGift,
  v: IntentCommand,
  reserved: number,
  funded: number,
  settings: { currency: string; paypal: string },
) {
  if (reserved > 0)
    throw new AppError("Cette envie est réservée pour un achat direct.", 409);
  if (g.visibility !== "visible" || g.archived)
    throw new AppError("Cadeau introuvable.", 404);
  if (
    g.budget_mode !== "fixed" ||
    g.closed ||
    g.purchased ||
    funded >= g.target
  )
    throw new AppError("Le financement de ce cadeau est terminé.", 409);
  if (v.amount > g.target - funded)
    throw new AppError(
      "La contribution ne peut pas dépasser le montant restant à financer.",
    );
  if (settings.currency !== g.currency)
    throw new AppError(
      "Ce cadeau utilise une ancienne devise. Les nouvelles contributions sont fermées.",
      409,
    );
  return v.method === "paypal"
    ? paypalLink(settings.paypal, v.amount, g.currency)
    : null;
}
export type ContributionState = {
  state: string;
  method: string;
  approved: number;
};
export function declarationDecision(
  c: Pick<ContributionState, "state" | "method"> | undefined,
  reserved: number,
) {
  if (!c) throw new AppError("Contribution introuvable.", 404);
  if (c.method === "pledge" && c.state === "expired")
    throw new AppError(
      "Cette promesse a été annulée. Créez une nouvelle participation.",
      409,
    );
  const changed = ["intent", "expired"].includes(c.state);
  if (changed && reserved > 0)
    throw new AppError("Cette envie est réservée pour un achat direct.", 409);
  return changed;
}
export function pledgeCancellationDecision(
  c: ContributionState | undefined,
  paid: boolean,
) {
  if (!c) throw new AppError("Contribution introuvable.", 404);
  if (
    c.method !== "pledge" ||
    c.approved ||
    paid ||
    !["intent", "expired"].includes(c.state)
  )
    throw new AppError(
      "Seule une promesse non versée peut être annulée ici.",
      409,
    );
  return c.state !== "expired";
}
export const reviewSchema = z.object({
  id: text(64).regex(/^[a-f0-9]{64}$/),
  approved: z.boolean(),
});
export type ReviewCommand = z.infer<typeof reviewSchema>;
export function reviewDecision(
  c: Pick<ContributionState, "state" | "approved"> | undefined,
  paid: boolean,
  approved: boolean,
) {
  if (!c) throw new AppError("Contribution introuvable.", 404);
  if (paid)
    throw new AppError("Utilisez une correction du versement confirmé.", 409);
  const state = approved ? "declared" : "rejected";
  return {
    state,
    changed: c.approved !== Number(approved) || c.state !== state,
  };
}
export const confirmationSchema = z.object({
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
export type ConfirmationCommand = z.infer<typeof confirmationSchema>;
export type Payment = {
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
export function confirmationDecision(
  v: ConfirmationCommand,
  contribution: { currency: string } | undefined,
  existing: Payment | undefined,
  eventUsed: boolean,
) {
  if (v.fee !== null && v.fee > v.gross)
    throw new AppError("Les frais dépassent le montant reçu.");
  if (!contribution) throw new AppError("Contribution introuvable.", 404);
  if (v.currency !== contribution.currency)
    throw new AppError("La devise doit correspondre à celle de l’intention.");
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
  if (eventUsed)
    throw new AppError("Identifiant d’événement déjà utilisé.", 409);
  return null;
}
export const correctionSchema = z.object({
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
export type CorrectionCommand = z.infer<typeof correctionSchema>;
export function correctionDecision(
  v: CorrectionCommand,
  p: Payment | undefined,
  previousPayload?: string,
) {
  if (previousPayload !== undefined) {
    if (previousPayload === JSON.stringify(v))
      return { changed: false, net: null };
    throw new AppError("Événement déjà utilisé avec d’autres données.", 409);
  }
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
  return { changed: true, net };
}
export type ReservationStatus = {
  id: string;
  quantity: number;
  state: string;
  expires_at: string;
  details: ReservedDetails | null;
  details_changed: boolean;
};
export type ContributionStatus = {
  id: string;
  gift_id: string;
  amount: number;
  currency: string;
  state: string;
  approved: number;
  expires_at: string;
  method: string;
  strict_contributions: number;
  payment: Pick<
    Payment,
    | "gross"
    | "fee"
    | "net"
    | "refunded"
    | "net_reversed"
    | "disputed"
    | "provenance"
  > | null;
  paypal_url: string | null;
};
export type FundingTotals = {
  funded: number;
  declared: number;
  promised: number;
  confirmed: number;
  unknown_gross: number;
  reserved: number;
};
export interface ParticipationStore {
  createReservation(
    value: ReservationCommand,
    access: Access,
  ): Promise<{ token: string }>;
  reservationStatus(token: string): Promise<ReservationStatus>;
  updateReservation(token: string, state: ReservationState): Promise<void>;
  createIntent(
    value: IntentCommand,
    access: Access,
  ): Promise<{ id: string; paypal_url: string | null }>;
  contributionStatus(id: string): Promise<ContributionStatus>;
  declareIntent(id: string): Promise<void>;
  cancelPledge(id: string): Promise<void>;
  reviewContribution(value: ReviewCommand, access: Access): Promise<void>;
  confirmManual(value: ConfirmationCommand, access: Access): Promise<string>;
  correctPayment(value: CorrectionCommand, access: Access): Promise<void>;
  fundingTotals(id: string, access: Access): Promise<FundingTotals>;
}
function bearer(id: string, kind: string) {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new AppError(`${kind} introuvable.`, 404);
  return id;
}
export function participationService(store: ParticipationStore) {
  return {
    async createReservation(input: unknown, access: Access) {
      return store.createReservation(reservationSchema.parse(input), access);
    },
    async reservationStatus(token: string) {
      return store.reservationStatus(bearer(token, "Réservation"));
    },
    async updateReservation(token: string, input: unknown) {
      return store.updateReservation(
        bearer(token, "Réservation"),
        reservationStateSchema.parse(input).state,
      );
    },
    async createIntent(input: unknown, access: Access) {
      return store.createIntent(intentSchema.parse(input), access);
    },
    async contributionStatus(id: string) {
      return store.contributionStatus(bearer(id, "Contribution"));
    },
    async declareIntent(id: string) {
      return store.declareIntent(bearer(id, "Contribution"));
    },
    async cancelPledge(id: string) {
      return store.cancelPledge(bearer(id, "Contribution"));
    },
    async reviewContribution(input: unknown, access: Access) {
      requireCatalogOwner(access);
      return store.reviewContribution(reviewSchema.parse(input), access);
    },
    async confirmManual(input: unknown, access: Access) {
      requireCatalogOwner(access);
      return store.confirmManual(confirmationSchema.parse(input), access);
    },
    async correctPayment(input: unknown, access: Access) {
      requireCatalogOwner(access);
      return store.correctPayment(correctionSchema.parse(input), access);
    },
    async fundingTotals(id: string, access: Access) {
      requireCatalogOwner(access);
      return store.fundingTotals(text(64).min(1).parse(id), access);
    },
  };
}

// SQL aggregate expressions are shared too: a confirmed payment replaces its
// declaration, unknown fees stay separate, promises never count as received.
export function fundingExpressions(
  dialect: "sqlite" | "postgres",
  strict: string,
) {
  const greatest = dialect === "postgres" ? "GREATEST" : "MAX";
  const unknown = `p.gross-${greatest}(p.refunded,p.net_reversed)`;
  return {
    funded: `CASE WHEN p.id IS NOT NULL THEN COALESCE(p.net-p.net_reversed,${unknown}) WHEN c.state='declared' AND (c.approved=1 OR ${strict}=0) THEN c.amount ELSE 0 END`,
    declared:
      "CASE WHEN c.state='declared' AND c.approved=0 AND p.id IS NULL THEN c.amount ELSE 0 END",
    promised:
      "CASE WHEN c.method='pledge' AND c.state='intent' AND c.approved=0 AND p.id IS NULL THEN c.amount ELSE 0 END",
    confirmed:
      "CASE WHEN p.net IS NOT NULL THEN p.net-p.net_reversed ELSE 0 END",
    unknown_gross: `CASE WHEN p.id IS NOT NULL AND p.net IS NULL THEN ${unknown} ELSE 0 END`,
  };
}
