import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { participationService } from "../lib/participation.ts";
import type { giftService } from "../lib/gift-persistence.ts";
import type { catalogService } from "../lib/catalog.ts";
export const participant = { owner: false, lists: [] };
export const participationOwner = {
  owner: true,
  lists: [],
  revealSurprises: true,
};
export const confirmation = (id: string) => ({
  contribution_id: id,
  transaction_ref: randomUUID(),
  gross: "25.00",
  fee: "1.00",
  currency: "EUR",
  reason: "Confirmation de test seulement",
  event_id: randomUUID(),
  recipient_checked: true,
  association_checked: true,
  received_checked: true,
});
export interface ParticipationFixture {
  service: ReturnType<typeof participationService>;
  gifts: ReturnType<typeof giftService>;
  catalog: ReturnType<typeof catalogService>;
  list: string;
  settings(input: {
    paypal?: string;
    strict_contributions?: boolean;
    currency?: string;
  }): Promise<void>;
  expire(kind: "reservations" | "contributions", id: string): Promise<void>;
  failAudit(): Promise<void>;
  auditCount(action: string, id: string): Promise<number>;
  close(): Promise<void>;
}
export async function participationGift(
  f: ParticipationFixture,
  extra: Record<string, unknown> = {},
) {
  const input = {
    list_id: f.list,
    title: randomUUID(),
    url: `https://example.org/${randomUUID()}`,
    target: "100.00",
    quantity: 1,
    ...extra,
  };
  const id = await f.gifts.saveGift(input, participationOwner);
  return { id, input };
}
export function participationContract(
  name: string,
  create: () => Promise<ParticipationFixture>,
) {
  const cases: [string, (f: ParticipationFixture) => Promise<void>][] = [
    [
      "quantity, immutable details and token transitions survive privacy changes",
      async (f) => {
        const offer = randomUUID();
        const { id, input } = await participationGift(f, {
          quantity: 2,
          size: "L",
          offers: [
            {
              id: offer,
              url: "https://example.org/offer",
              condition: "used",
              note: "Avec boîte",
              currency: "EUR",
            },
          ],
        });
        await assert.rejects(
          f.service.createReservation(
            { gift_id: id, quantity: 1, offer_id: randomUUID() },
            participant,
          ),
          /Offre inconnue/,
        );
        const { token } = await f.service.createReservation(
          { gift_id: id, quantity: 2, offer_id: offer },
          participant,
        );
        assert.match(token, /^[a-f0-9]{64}$/);
        const first = await f.service.reservationStatus(token);
        assert.equal(first.details?.url, "https://example.org/offer");
        assert.equal(first.details?.size, "L");
        assert.equal(first.details_changed, false);
        await assert.rejects(
          f.service.createReservation(
            { gift_id: id, quantity: 1 },
            participant,
          ),
          /quantité/,
        );
        await assert.rejects(
          f.service.createIntent(
            { gift_id: id, amount: "1", method: "pledge" },
            participant,
          ),
          /réservée/,
        );
        await f.gifts.saveGift(
          { ...input, title: "Nouveau titre privé", offers: [] },
          participationOwner,
          id,
        );
        await f.catalog.saveList(
          { id: f.list, name: "Privé", visibility: "private" },
          participationOwner,
        );
        const after = await f.service.reservationStatus(token);
        assert.equal(after.details?.title, input.title);
        assert.equal(after.details_changed, true);
        assert.ok(!JSON.stringify(after).includes("Nouveau titre privé"));
        await f.service.updateReservation(token, { state: "purchased" });
        await f.service.updateReservation(token, { state: "purchased" });
        assert.equal(await f.auditCount("reservation.purchased", first.id), 1);
        await f.expire("reservations", first.id);
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).reserved,
          2,
        );
        await f.service.updateReservation(token, { state: "cancelled" });
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).reserved,
          0,
        );
        await assert.rejects(
          f.service.updateReservation(token, { state: "purchased" }),
          /plus active/,
        );
        await assert.rejects(
          f.service.reservationStatus("invalid"),
          /introuvable/,
        );
      },
    ],
    [
      "expired reservations free quantity without reviving an old token",
      async (f) => {
        const { id } = await participationGift(f);
        const r = await f.service.createReservation(
          { gift_id: id, quantity: 1 },
          participant,
        );
        await f.expire(
          "reservations",
          (await f.service.reservationStatus(r.token)).id,
        );
        assert.equal(
          (await f.service.reservationStatus(r.token)).state,
          "expired",
        );
        await assert.rejects(
          f.service.updateReservation(r.token, { state: "purchased" }),
          /plus active/,
        );
        const bank = await f.service.createIntent(
          { gift_id: id, amount: "0,29", method: "bank_transfer" },
          participant,
        );
        assert.equal(bank.paypal_url, null);
        assert.equal((await f.service.contributionStatus(bank.id)).amount, 29);
      },
    ],
    [
      "private, unlisted and recipient surprise access use verified context",
      async (f) => {
        const { id } = await participationGift(f);
        await f.catalog.saveList(
          { id: f.list, name: "Accès", visibility: "private" },
          participationOwner,
        );
        await assert.rejects(
          f.service.createReservation(
            { gift_id: id, quantity: 1 },
            participant,
          ),
          /introuvable/,
        );
        await assert.rejects(
          f.service.createIntent(
            { gift_id: id, amount: "1", method: "pledge" },
            participant,
          ),
          /introuvable/,
        );
        await f.catalog.saveList(
          {
            id: f.list,
            name: "Accès",
            visibility: "unlisted",
            surprise_mode: true,
          },
          participationOwner,
        );
        await assert.rejects(
          f.service.createIntent(
            { gift_id: id, amount: "1", method: "pledge" },
            participant,
          ),
          /introuvable/,
        );
        await assert.rejects(
          f.service.createIntent(
            { gift_id: id, amount: "1", method: "pledge" },
            { owner: true, lists: [] },
          ),
          /Révélez/,
        );
        await assert.rejects(
          f.service.createIntent(
            { gift_id: id, amount: "1", method: "pledge" },
            {
              ...participant,
              lists: [f.list],
              recipient: true,
              recipientLists: [f.list],
            },
          ),
          /Révélez/,
        );
        const c = await f.service.createIntent(
          { gift_id: id, amount: "1", method: "pledge" },
          { ...participant, lists: [f.list] },
        );
        await assert.rejects(
          f.service.reviewContribution(
            { id: c.id, approved: true },
            participant,
          ),
          /Connexion/,
        );
        await assert.rejects(
          f.service.reviewContribution(
            { id: c.id, approved: true },
            { owner: true, lists: [] },
          ),
          /Révélez/,
        );
        await assert.rejects(
          f.service.confirmManual(confirmation(c.id), {
            owner: true,
            lists: [],
          }),
          /Révélez/,
        );
        await assert.rejects(
          f.service.fundingTotals(id, { owner: true, lists: [] }),
          /Révélez/,
        );
        // A recipient of another list is not surprised by this one.
        await f.service.reviewContribution(
          { id: c.id, approved: true },
          { owner: true, lists: [], recipientLists: ["elsewhere"] },
        );
      },
    ],
    [
      "offline declarations and promises keep strict and normal funding distinct",
      async (f) => {
        const { id } = await participationGift(f);
        const bank = await f.service.createIntent(
          {
            gift_id: id,
            amount: "12.50",
            method: "bank_transfer",
            nickname: "SecretDonor",
            message: "PrivateMessage",
          },
          participant,
        );
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).funded,
          1250,
        );
        await f.settings({ strict_contributions: true });
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).funded,
          0,
        );
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).declared,
          1250,
        );
        await f.service.reviewContribution(
          { id: bank.id, approved: true },
          participationOwner,
        );
        await f.service.reviewContribution(
          { id: bank.id, approved: true },
          participationOwner,
        );
        assert.equal(await f.auditCount("contribution.review", bank.id), 1);
        const promise = await f.service.createIntent(
          { gift_id: id, amount: "20", method: "pledge" },
          participant,
        );
        const totals = await f.service.fundingTotals(id, participationOwner);
        assert.equal(totals.funded, 1250);
        assert.equal(totals.promised, 2000);
        assert.equal(totals.confirmed, 0);
        await f.service.declareIntent(promise.id);
        await f.service.declareIntent(promise.id);
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).promised,
          0,
        );
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).funded,
          1250,
        );
        const status = await f.service.contributionStatus(bank.id);
        for (const key of [
          "nickname",
          "message",
          "paypal_recipient",
          "transaction_ref",
          "tenant_id",
        ])
          assert.ok(!Object.hasOwn(status, key));
        assert.ok(!JSON.stringify(status).includes("SecretDonor"));
        await f.service.reviewContribution(
          { id: bank.id, approved: false },
          participationOwner,
        );
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).funded,
          0,
        );
      },
    ],
    [
      "pledges never expire automatically, and cancelled pledges cannot be declared",
      async (f) => {
        const { id } = await participationGift(f);
        const c = await f.service.createIntent(
          { gift_id: id, amount: "40", method: "pledge" },
          participant,
        );
        await f.expire("contributions", c.id);
        assert.equal(
          (await f.service.contributionStatus(c.id)).state,
          "intent",
        );
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).promised,
          4000,
        );
        await assert.rejects(
          f.service.createReservation(
            { gift_id: id, quantity: 1 },
            participant,
          ),
          /contributions/,
        );
        await f.service.cancelPledge(c.id);
        await f.service.cancelPledge(c.id);
        assert.equal(await f.auditCount("contribution.cancel_pledge", c.id), 1);
        await assert.rejects(f.service.declareIntent(c.id), /annulée/);
        const r = await f.service.createReservation(
          { gift_id: id, quantity: 1 },
          participant,
        );
        await f.service.updateReservation(r.token, { state: "cancelled" });
        const bank = await f.service.createIntent(
          { gift_id: id, amount: "1", method: "bank_transfer" },
          participant,
        );
        await assert.rejects(f.service.cancelPledge(bank.id), /non versée/);
      },
    ],
    [
      "amounts, remaining budget, currency and closed gifts remain guarded",
      async (f) => {
        const { id } = await participationGift(f);
        for (const amount of ["0", "-1", "1.001", "1e2", "100.01"])
          await assert.rejects(
            f.service.createIntent(
              { gift_id: id, amount, method: "bank_transfer" },
              participant,
            ),
          );
        await f.service.createIntent(
          { gift_id: id, amount: "99.71", method: "bank_transfer" },
          participant,
        );
        await assert.rejects(
          f.service.createIntent(
            { gift_id: id, amount: "0.30", method: "bank_transfer" },
            participant,
          ),
          /restant/,
        );
        await f.settings({ currency: "USD" });
        await assert.rejects(
          f.service.createIntent(
            { gift_id: id, amount: "0.29", method: "pledge" },
            participant,
          ),
          /ancienne devise/,
        );
        await f.settings({ currency: "EUR" });
        await f.service.createIntent(
          { gift_id: id, amount: "0.29", method: "bank_transfer" },
          participant,
        );
        await assert.rejects(
          f.service.createIntent(
            { gift_id: id, amount: "0.01", method: "pledge" },
            participant,
          ),
          /terminé/,
        );
        for (const extra of [
          { budget_mode: "free" },
          { budget_mode: "unknown" },
          { closed: true },
        ]) {
          const g = await participationGift(f, extra);
          await assert.rejects(
            f.service.createIntent(
              { gift_id: g.id, amount: "1", method: "pledge" },
              participant,
            ),
            /terminé/,
          );
        }
      },
    ],
    [
      "PayPal recipient is captured and late declaration cannot overtake a reservation",
      async (f) => {
        await f.settings({ paypal: "FictionalTestOnly" });
        const { id } = await participationGift(f);
        const c = await f.service.createIntent(
          { gift_id: id, amount: "10" },
          participant,
        );
        await f.settings({ paypal: "ChangedRecipient" });
        assert.match(
          (await f.service.contributionStatus(c.id)).paypal_url!,
          /FictionalTestOnly/,
        );
        await f.expire("contributions", c.id);
        assert.equal(
          (await f.service.contributionStatus(c.id)).state,
          "expired",
        );
        const r = await f.service.createReservation(
          { gift_id: id, quantity: 1 },
          participant,
        );
        await assert.rejects(f.service.declareIntent(c.id), /réservée/);
        await f.service.updateReservation(r.token, { state: "cancelled" });
        await f.service.declareIntent(c.id);
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).funded,
          1000,
        );
      },
    ],
    [
      "received money replaces declarations; corrections are revisioned and idempotent",
      async (f) => {
        const { id } = await participationGift(f);
        const c = await f.service.createIntent(
          { gift_id: id, amount: "25", method: "bank_transfer" },
          participant,
        );
        const input = confirmation(c.id);
        const p = await f.service.confirmManual(
          { ...input, provenance: "verified" },
          participationOwner,
        );
        assert.equal(
          await f.service.confirmManual(input, participationOwner),
          p,
        );
        assert.equal(await f.auditCount("payment.confirm_manual", p), 1);
        let totals = await f.service.fundingTotals(id, participationOwner);
        assert.equal(totals.funded, 2400);
        assert.equal(totals.declared, 0);
        assert.equal(totals.confirmed, 2400);
        assert.equal(
          (await f.service.contributionStatus(c.id)).payment?.provenance,
          "manual",
        );
        await assert.rejects(
          f.service.reviewContribution(
            { id: c.id, approved: false },
            participationOwner,
          ),
          /correction/,
        );
        const correction = {
          payment_id: p,
          event_id: randomUUID(),
          revision: 1,
          gross: "25",
          fee: "1",
          refunded: "25",
          net_reversed: "23",
          disputed: false,
          reason: "Remboursement de test",
        };
        await assert.rejects(
          f.service.correctPayment(correction, participationOwner),
          /remboursement total/,
        );
        correction.net_reversed = "24";
        await f.service.correctPayment(correction, participationOwner);
        await f.service.correctPayment(correction, participationOwner);
        assert.equal(await f.auditCount("payment.correct_manual", p), 1);
        await assert.rejects(
          f.service.correctPayment(
            { ...correction, reason: "Autre raison" },
            participationOwner,
          ),
          /autres données/,
        );
        await assert.rejects(
          f.service.correctPayment(
            { ...correction, event_id: randomUUID() },
            participationOwner,
          ),
          /autre correction/,
        );
        totals = await f.service.fundingTotals(id, participationOwner);
        assert.equal(totals.funded, 0);
        assert.equal(totals.declared, 0);
        await assert.rejects(
          f.service.createReservation(
            { gift_id: id, quantity: 1 },
            participant,
          ),
          /contributions/,
        );
      },
    ],
    [
      "unknown fees and actual late payments stay exact, with scoped ledger conflicts",
      async (f) => {
        const { id } = await participationGift(f);
        const a = await f.service.createIntent(
          { gift_id: id, amount: "1", method: "pledge" },
          participant,
        );
        const b = await f.service.createIntent(
          { gift_id: id, amount: "1", method: "pledge" },
          participant,
        );
        const v = { ...confirmation(a.id), gross: "120", fee: "" };
        await assert.rejects(
          f.service.confirmManual(
            { ...v, currency: "USD" },
            participationOwner,
          ),
          /devise/,
        );
        await assert.rejects(
          f.service.confirmManual({ ...v, fee: "121" }, participationOwner),
          /frais/,
        );
        const p = await f.service.confirmManual(v, participationOwner);
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).unknown_gross,
          12000,
        );
        await assert.rejects(
          f.service.confirmManual(
            { ...v, contribution_id: b.id, event_id: randomUUID() },
            participationOwner,
          ),
          /déjà confirmée/,
        );
        await assert.rejects(
          f.service.confirmManual(
            { ...v, contribution_id: b.id, transaction_ref: randomUUID() },
            participationOwner,
          ),
          /événement/,
        );
        await assert.rejects(f.service.cancelPledge(a.id), /non versée/);
        await f.service.correctPayment(
          {
            payment_id: p,
            event_id: randomUUID(),
            revision: 1,
            gross: "120",
            fee: "",
            refunded: "20",
            net_reversed: "5",
            disputed: true,
            reason: "Montants de test",
          },
          participationOwner,
        );
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).funded,
          10000,
        );
        const s = await f.service.contributionStatus(a.id);
        assert.ok(s.payment);
        assert.ok(!Object.hasOwn(s.payment, "transaction_ref"));
      },
    ],
    [
      "audit failure rolls back reservations and their quantity",
      async (f) => {
        const { id } = await participationGift(f);
        await f.failAudit();
        await assert.rejects(
          f.service.createReservation(
            { gift_id: id, quantity: 1 },
            participant,
          ),
        );
        assert.equal(
          (await f.service.fundingTotals(id, participationOwner)).reserved,
          0,
        );
      },
    ],
  ];
  for (const [label, run] of cases)
    test(`${name}: ${label}`, async () => {
      const f = await create();
      try {
        await run(f);
      } finally {
        await f.close();
      }
    });
}
