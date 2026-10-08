import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import type { Access } from "./lists.ts";
import { requireCatalogOwner } from "./catalog.ts";
import {
  tenantTransaction,
  lockGiftWrites,
  type PgPool,
  type PgConnection,
} from "./catalog-postgres.ts";
import {
  buildReservationDetails,
  type ReservedDetails,
} from "./reservation-details.ts";
import { AppError, paypalLink, paypalName } from "./validation.ts";
import {
  participationAccess,
  reservationDecision,
  reservationStateDecision,
  intentDecision,
  declarationDecision,
  pledgeCancellationDecision,
  reviewDecision,
  confirmationDecision,
  correctionDecision,
  fundingExpressions,
  type ParticipationStore,
  type ParticipationGift,
  type ReservationCommand,
  type ReservationState,
  type ReservationStatus,
  type IntentCommand,
  type ContributionStatus,
  type ContributionState,
  type ReviewCommand,
  type ConfirmationCommand,
  type CorrectionCommand,
  type Payment,
  type FundingTotals,
} from "./participation.ts";

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function exact(value: unknown) {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("Participation total exceeds exact integer range");
  return number;
}
type Contribution = ContributionState & {
  id: string;
  gift_id: string;
  amount: number;
  currency: string;
  expires_at: Date;
  paypal_recipient: string;
};
type Reservation = {
  id: string;
  gift_id: string;
  quantity: number;
  state: string;
  expires_at: Date;
  details_snapshot: string;
};

export class PostgresParticipationStore implements ParticipationStore {
  readonly tenantId: string;
  readonly pool: PgPool;
  constructor(pool: PgPool, tenantId: string) {
    this.pool = pool;
    this.tenantId = z.uuid().parse(tenantId);
  }
  private transaction<T>(work: (client: PgConnection) => Promise<T>) {
    return tenantTransaction(this.pool, this.tenantId, async (client) => {
      // Same lock/order as gift edits and purchases. No process-local mutex;
      // competing replicas see committed quantity, declarations and payments.
      await lockGiftWrites(client, this.tenantId);
      return work(client);
    });
  }
  private async gift(client: PgConnection, id: string, access: Access) {
    const g = (
      await client.query(
        `SELECT g.*,l.visibility list_visibility,l.archived,l.surprise_mode
      FROM ouicheur.gifts g JOIN ouicheur.lists l ON l.tenant_id=g.tenant_id AND l.id=g.list_id
      WHERE g.tenant_id=$1 AND g.id=$2 AND g.details_ready=1 FOR SHARE OF g,l`,
        [this.tenantId, id],
      )
    ).rows[0];
    return participationAccess(g as ParticipationGift | undefined, access);
  }
  private async settings(client: PgConnection) {
    const s = (
      await client.query(
        "SELECT currency,paypal,strict_contributions FROM ouicheur.tenants WHERE id=$1 FOR SHARE",
        [this.tenantId],
      )
    ).rows[0];
    if (!s) throw new AppError("Foyer introuvable.", 404);
    return s as {
      currency: string;
      paypal: string;
      strict_contributions: number;
    };
  }
  private async reserved(client: PgConnection, id: string) {
    return exact(
      (
        await client.query(
          "SELECT COALESCE(SUM(quantity),0) n FROM ouicheur.reservations WHERE tenant_id=$1 AND gift_id=$2 AND (state='purchased' OR (state='reserved' AND expires_at>clock_timestamp()))",
          [this.tenantId, id],
        )
      ).rows[0].n,
    );
  }
  private async totals(
    client: PgConnection,
    id: string,
  ): Promise<FundingTotals> {
    const expressions = fundingExpressions(
      "postgres",
      "s.strict_contributions",
    );
    const fields = Object.entries(expressions)
      .map(([key, sql]) => `COALESCE(SUM(${sql}),0) ${key}`)
      .join(",");
    const row = (
      await client.query(
        `SELECT ${fields} FROM ouicheur.contributions c
      JOIN ouicheur.tenants s ON s.id=c.tenant_id LEFT JOIN ouicheur.payments p ON p.tenant_id=c.tenant_id AND p.contribution_id=c.id
      WHERE c.tenant_id=$1 AND c.gift_id=$2`,
        [this.tenantId, id],
      )
    ).rows[0];
    return {
      funded: exact(row.funded),
      declared: exact(row.declared),
      promised: exact(row.promised),
      confirmed: exact(row.confirmed),
      unknown_gross: exact(row.unknown_gross),
      reserved: await this.reserved(client, id),
    };
  }
  private async audit(
    client: PgConnection,
    action: string,
    id: string,
    detail: unknown = {},
  ) {
    await client.query(
      "INSERT INTO ouicheur.audit(tenant_id,id,action,entity_id,detail,created_at) VALUES ($1,$2,$3,$4,$5::jsonb,clock_timestamp())",
      [this.tenantId, randomUUID(), action, id, JSON.stringify(detail)],
    );
  }
  private async notify(
    client: PgConnection,
    kind: string,
    id: string,
    list: string,
  ) {
    await client.query(
      "INSERT INTO ouicheur.participation_outbox(tenant_id,id,kind,entity_id,list_id,created_at) VALUES ($1,$2,$3,$4,$5,clock_timestamp()) ON CONFLICT(tenant_id,kind,entity_id) DO NOTHING",
      [
        this.tenantId,
        randomUUID(),
        kind,
        kind === "declaration" ? hash(id) : id,
        list,
      ],
    );
  }
  private async capture(
    client: PgConnection,
    id: string,
    offerId: string | null,
  ) {
    const g = (
      await client.query(
        "SELECT title,url,size,color,model,variant_note,variant_policy,kind,time_hint FROM ouicheur.gifts WHERE tenant_id=$1 AND id=$2 AND details_ready=1",
        [this.tenantId, id],
      )
    ).rows[0];
    if (!g) throw new AppError("Cadeau introuvable.", 404);
    const offer = offerId
      ? (
          await client.query(
            "SELECT url,note,condition FROM ouicheur.gift_offers WHERE tenant_id=$1 AND gift_id=$2 AND id=$3",
            [this.tenantId, id, offerId],
          )
        ).rows[0]
      : undefined;
    return buildReservationDetails(
      g as Omit<ReservedDetails, "offer_id" | "offer_note" | "condition">,
      offerId,
      offer as { url: string; note: string; condition: string } | undefined,
    );
  }
  async createReservation(v: ReservationCommand, access: Access) {
    return this.transaction(async (client) => {
      const g = await this.gift(client, v.gift_id, access);
      const contributions = (
        await client.query(
          `SELECT 1 FROM ouicheur.contributions c LEFT JOIN ouicheur.payments p ON p.tenant_id=c.tenant_id AND p.contribution_id=c.id
        WHERE c.tenant_id=$1 AND c.gift_id=$2 AND (p.id IS NOT NULL OR c.state IN ('declared','detected') OR (c.state='intent' AND (c.method='pledge' OR c.expires_at>clock_timestamp()))) LIMIT 1`,
          [this.tenantId, v.gift_id],
        )
      ).rowCount;
      reservationDecision(
        g,
        v.quantity,
        await this.reserved(client, v.gift_id),
        !!contributions,
      );
      const token = randomBytes(32).toString("hex"),
        id = randomUUID();
      const details = await this.capture(client, v.gift_id, v.offer_id);
      await client.query(
        "INSERT INTO ouicheur.reservations(tenant_id,id,token_hash,gift_id,quantity,created_at,expires_at,details_snapshot) VALUES ($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '14 days',$6)",
        [
          this.tenantId,
          id,
          hash(token),
          v.gift_id,
          v.quantity,
          JSON.stringify(details),
        ],
      );
      await this.audit(client, "reservation.create", id, {
        gift_id: v.gift_id,
        quantity: v.quantity,
      });
      await this.notify(client, "reservation", id, g.list_id);
      return { token };
    });
  }
  private async reservation(client: PgConnection, token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new AppError("Réservation introuvable.", 404);
    await client.query(
      "UPDATE ouicheur.reservations SET state='expired' WHERE tenant_id=$1 AND token_hash=$2 AND state='reserved' AND expires_at<=clock_timestamp()",
      [this.tenantId, hash(token)],
    );
    const r = (
      await client.query(
        "SELECT id,gift_id,quantity,state,expires_at,details_snapshot FROM ouicheur.reservations WHERE tenant_id=$1 AND token_hash=$2 FOR UPDATE",
        [this.tenantId, hash(token)],
      )
    ).rows[0] as Reservation | undefined;
    if (!r) throw new AppError("Réservation introuvable.", 404);
    return r;
  }
  async reservationStatus(token: string): Promise<ReservationStatus> {
    return this.transaction(async (client) => {
      const r = await this.reservation(client, token);
      const details = r.details_snapshot
        ? (JSON.parse(r.details_snapshot) as ReservedDetails)
        : null;
      let changed = false;
      if (details) {
        try {
          changed =
            JSON.stringify(
              await this.capture(client, r.gift_id, details.offer_id),
            ) !== r.details_snapshot;
        } catch (error) {
          if (!(error instanceof AppError && error.status === 404)) throw error;
          changed = true;
        }
      }
      return {
        id: r.id,
        quantity: r.quantity,
        state: r.state,
        expires_at: iso(r.expires_at),
        details,
        details_changed: changed,
      };
    });
  }
  async updateReservation(token: string, state: ReservationState) {
    await this.transaction(async (client) => {
      const r = await this.reservation(client, token);
      if (
        !reservationStateDecision(
          { ...r, expires_at: iso(r.expires_at) },
          state,
          new Date().toISOString(),
        )
      )
        return;
      await client.query(
        "UPDATE ouicheur.reservations SET state=$1 WHERE tenant_id=$2 AND id=$3",
        [state, this.tenantId, r.id],
      );
      await this.audit(client, `reservation.${state}`, r.id);
    });
  }
  async createIntent(v: IntentCommand, access: Access) {
    return this.transaction(async (client) => {
      const g = await this.gift(client, v.gift_id, access),
        settings = await this.settings(client);
      const totals = await this.totals(client, v.gift_id);
      const link = intentDecision(
        g,
        v,
        totals.reserved,
        totals.funded,
        settings,
      );
      const id = randomBytes(32).toString("hex");
      await client.query(
        `INSERT INTO ouicheur.contributions(tenant_id,id,gift_id,amount,currency,nickname,message,public_name,public_message,state,created_at,expires_at,paypal_recipient,method)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp(),clock_timestamp()+interval '7 days',$11,$12)`,
        [
          this.tenantId,
          id,
          v.gift_id,
          v.amount,
          g.currency,
          v.nickname,
          v.message,
          Number(v.public_name),
          Number(v.public_message),
          v.method === "bank_transfer" ? "declared" : "intent",
          v.method === "paypal" ? settings.paypal : "",
          v.method,
        ],
      );
      if (v.method === "bank_transfer")
        await this.notify(client, "declaration", id, g.list_id);
      return { id, paypal_url: link };
    });
  }
  private async contribution(client: PgConnection, id: string, expire = false) {
    if (expire)
      await client.query(
        "UPDATE ouicheur.contributions SET state='expired' WHERE tenant_id=$1 AND id=$2 AND state='intent' AND method<>'pledge' AND expires_at<clock_timestamp()",
        [this.tenantId, id],
      );
    const c = (
      await client.query(
        "SELECT * FROM ouicheur.contributions WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [this.tenantId, id],
      )
    ).rows[0] as Contribution | undefined;
    if (!c) throw new AppError("Contribution introuvable.", 404);
    return c;
  }
  private async payment(client: PgConnection, contribution: string) {
    const p = (
      await client.query(
        "SELECT id,contribution_id,transaction_ref,currency,gross,fee,net,refunded,net_reversed,disputed,revision,provenance,created_at FROM ouicheur.payments WHERE tenant_id=$1 AND contribution_id=$2 FOR UPDATE",
        [this.tenantId, contribution],
      )
    ).rows[0];
    return p ? ({ ...p, created_at: iso(p.created_at) } as Payment) : undefined;
  }
  async contributionStatus(id: string): Promise<ContributionStatus> {
    return this.transaction(async (client) => {
      const c = await this.contribution(client, id, true),
        p = await this.payment(client, id),
        s = await this.settings(client);
      return {
        id: c.id,
        gift_id: c.gift_id,
        amount: c.amount,
        currency: c.currency,
        state: c.state,
        approved: c.approved,
        expires_at: iso(c.expires_at),
        method: c.method,
        strict_contributions: s.strict_contributions,
        payment: p
          ? {
              gross: p.gross,
              fee: p.fee,
              net: p.net,
              refunded: p.refunded,
              net_reversed: p.net_reversed,
              disputed: p.disputed,
              provenance: p.provenance,
            }
          : null,
        paypal_url:
          !p && c.state === "intent" && c.method === "paypal"
            ? paypalLink(c.paypal_recipient, c.amount, c.currency)
            : null,
      };
    });
  }
  async declareIntent(id: string) {
    await this.transaction(async (client) => {
      const c = await this.contribution(client, id);
      if (!declarationDecision(c, await this.reserved(client, c.gift_id)))
        return;
      await client.query(
        "UPDATE ouicheur.contributions SET state='declared' WHERE tenant_id=$1 AND id=$2",
        [this.tenantId, id],
      );
      const g = (
        await client.query(
          "SELECT list_id FROM ouicheur.gifts WHERE tenant_id=$1 AND id=$2",
          [this.tenantId, c.gift_id],
        )
      ).rows[0];
      await this.notify(client, "declaration", id, String(g.list_id));
    });
  }
  async cancelPledge(id: string) {
    await this.transaction(async (client) => {
      const c = await this.contribution(client, id);
      if (!pledgeCancellationDecision(c, !!(await this.payment(client, id))))
        return;
      await client.query(
        "UPDATE ouicheur.contributions SET state='expired',expires_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
        [this.tenantId, id],
      );
      await this.audit(client, "contribution.cancel_pledge", id);
    });
  }
  async reviewContribution(v: ReviewCommand, access: Access) {
    requireCatalogOwner(access);
    await this.transaction(async (client) => {
      const c = await this.contribution(client, v.id);
      await this.gift(client, c.gift_id, access);
      const { state, changed } = reviewDecision(
        c,
        !!(await this.payment(client, v.id)),
        v.approved,
      );
      if (!changed) return;
      await client.query(
        "UPDATE ouicheur.contributions SET approved=$1,state=$2 WHERE tenant_id=$3 AND id=$4",
        [Number(v.approved), state, this.tenantId, v.id],
      );
      await this.audit(client, "contribution.review", v.id, {
        before: { state: c.state, approved: c.approved },
        approved: v.approved,
      });
    });
  }
  async confirmManual(v: ConfirmationCommand, access: Access) {
    requireCatalogOwner(access);
    return this.transaction(async (client) => {
      const c = await this.contribution(client, v.contribution_id);
      await this.gift(client, c.gift_id, access);
      const existing = (
        await client.query(
          "SELECT * FROM ouicheur.payments WHERE tenant_id=$1 AND (transaction_ref=$2 OR contribution_id=$3) FOR UPDATE",
          [this.tenantId, v.transaction_ref, v.contribution_id],
        )
      ).rows[0] as Payment | undefined;
      const event = (
        await client.query(
          "SELECT 1 FROM ouicheur.payment_events WHERE tenant_id=$1 AND id=$2",
          [this.tenantId, v.event_id],
        )
      ).rowCount;
      const previous = confirmationDecision(v, c, existing, !!event);
      if (previous) return previous;
      const id = randomUUID();
      await client.query(
        "INSERT INTO ouicheur.payments(tenant_id,id,contribution_id,transaction_ref,currency,gross,fee,net,provenance,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',clock_timestamp())",
        [
          this.tenantId,
          id,
          v.contribution_id,
          v.transaction_ref,
          v.currency,
          v.gross,
          v.fee,
          v.fee === null ? null : v.gross - v.fee,
        ],
      );
      await this.event(client, v.event_id, id, "confirmed_manual", v);
      await this.audit(client, "payment.confirm_manual", id, v);
      return id;
    });
  }
  private async event(
    client: PgConnection,
    id: string,
    payment: string,
    kind: string,
    payload: unknown,
  ) {
    await client.query(
      "INSERT INTO ouicheur.payment_events(tenant_id,id,payment_id,kind,payload,created_at) VALUES ($1,$2,$3,$4,$5,clock_timestamp())",
      [this.tenantId, id, payment, kind, JSON.stringify(payload)],
    );
  }
  async correctPayment(v: CorrectionCommand, access: Access) {
    requireCatalogOwner(access);
    await this.transaction(async (client) => {
      const raw = (
        await client.query(
          "SELECT id,contribution_id,transaction_ref,currency,gross,fee,net,refunded,net_reversed,disputed,revision,provenance,created_at FROM ouicheur.payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [this.tenantId, v.payment_id],
        )
      ).rows[0];
      if (!raw) throw new AppError("Versement introuvable.", 404);
      const p = { ...raw, created_at: iso(raw.created_at) } as Payment;
      const c = await this.contribution(client, p.contribution_id);
      await this.gift(client, c.gift_id, access);
      const event = (
        await client.query(
          "SELECT payload FROM ouicheur.payment_events WHERE tenant_id=$1 AND id=$2",
          [this.tenantId, v.event_id],
        )
      ).rows[0];
      const { changed, net } = correctionDecision(
        v,
        p,
        event ? String(event.payload) : undefined,
      );
      if (!changed) return;
      await client.query(
        "UPDATE ouicheur.payments SET gross=$1,fee=$2,net=$3,refunded=$4,net_reversed=$5,disputed=$6,revision=revision+1,provenance='manual' WHERE tenant_id=$7 AND id=$8",
        [
          v.gross,
          v.fee,
          net,
          v.refunded,
          v.net_reversed,
          Number(v.disputed),
          this.tenantId,
          p.id,
        ],
      );
      await this.event(client, v.event_id, p.id, "correction_manual", v);
      await this.audit(client, "payment.correct_manual", p.id, {
        before: p,
        after: v,
      });
    });
  }
  async fundingTotals(id: string, access: Access) {
    requireCatalogOwner(access);
    return this.transaction(async (client) => {
      await this.gift(client, id, access);
      return this.totals(client, id);
    });
  }
}

// Operator-only provisioning. Settings change under the same lock as finance;
// existing intents retain the PayPal recipient captured when they were created.
export async function configureParticipation(
  pool: PgPool,
  tenantId: string,
  input: unknown,
) {
  z.uuid().parse(tenantId);
  const v = z
    .object({
      paypal: z.string().transform(paypalName).optional(),
      strict_contributions: z.boolean().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0)
    .parse(input);
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query(
      "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'",
    );
    await client.query("SELECT set_config('ouicheur.tenant_id',$1,true)", [
      tenantId,
    ]);
    await lockGiftWrites(client, tenantId);
    const result = await client.query(
      "UPDATE ouicheur.tenants SET paypal=COALESCE($2,paypal),strict_contributions=COALESCE($3,strict_contributions) WHERE id=$1",
      [
        tenantId,
        v.paypal ?? null,
        v.strict_contributions === undefined
          ? null
          : Number(v.strict_contributions),
      ],
    );
    if (!result.rowCount) throw new AppError("Foyer introuvable.", 404);
    await client.query(
      "INSERT INTO ouicheur.audit(tenant_id,id,action,entity_id,detail,created_at) VALUES ($1,$2,'participation.settings',$1::text,$3::jsonb,clock_timestamp())",
      [
        tenantId,
        randomUUID(),
        JSON.stringify({
          paypal_configured: v.paypal === undefined ? undefined : !!v.paypal,
          strict_contributions: v.strict_contributions,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
