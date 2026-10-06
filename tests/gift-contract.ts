import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { giftService } from "../lib/gift-persistence.ts";
import { catalogOwner } from "./catalog-contract.ts";

export const giftInput = {
  title: "Cadeau",
  url: "https://example.org/product?utm_source=test#detail",
  target: "12,34",
  quantity: 3,
  priority: 2,
};
export interface GiftFixture {
  service: ReturnType<typeof giftService>;
  list: string;
  listCreate(surprise?: boolean): Promise<string>;
  setCurrency(currency: string): Promise<void>;
  seedCategory(id: string): Promise<void>;
  seedPriority(id: number): Promise<void>;
  seedReservation(
    id: string,
    quantity: number,
    state: string,
    expired: boolean,
  ): Promise<void>;
  seedContribution(id: string): Promise<void>;
  seedSource(id: string): Promise<void>;
  setPurchased(id: string): Promise<void>;
  failAudit(): Promise<void>;
  auditCount(id: string): Promise<number>;
  close(): Promise<void>;
}
export function giftContract(name: string, create: () => Promise<GiftFixture>) {
  const cases: [string, (f: GiftFixture) => Promise<void>][] = [
    [
      "metadata, variants, offers, exact cents and currency survive updates",
      async (f) => {
        await f.setCurrency("CHF");
        const category = randomUUID();
        await f.seedCategory(category);
        await f.seedPriority(8);
        const offer = randomUUID();
        const input = {
          ...giftInput,
          list_id: f.list,
          category_id: category,
          priority: 8,
          size: "M",
          color: "Bleu",
          model: "Édition 2",
          variant_note: "Avec boîte",
          variant_policy: "flexible",
          time_hint: "Novembre",
          offers: [
            {
              id: offer,
              url: "https://shop.example.org/p?ref=track",
              condition: "used",
              price: 1234,
              shipping: 500,
              currency: "CHF",
              note: "Occasion",
              availability: "available",
              checked_at: "2026-10-01T12:00:00.000Z",
            },
          ],
          suggested_price: 1500,
          suggested_currency: "CHF",
          extracted_at: "2026-10-01T12:00:00.000Z",
        };
        const id = await f.service.saveGift(input, catalogOwner);
        const row = await f.service.getGift(id, catalogOwner);
        assert.equal(row?.target, 3702);
        assert.equal(row?.quantity, 3);
        assert.equal(row?.currency, "CHF");
        assert.equal(row?.priority, 8);
        assert.equal(row?.category_id, category);
        assert.equal(row?.url, "https://example.org/product");
        assert.equal(row?.original_url, giftInput.url);
        assert.equal(row?.model, "Édition 2");
        assert.equal(row?.offers[0].url, "https://shop.example.org/p");
        assert.equal(row?.offers[0].shipping, 500);
        await f.seedSource(id);
        await f.setCurrency("USD");
        await f.setPurchased(id);
        await f.service.saveGift(
          {
            ...input,
            title: "Renommé",
            offers: [],
            suggested_price: null,
            extracted_at: null,
          },
          catalogOwner,
          id,
        );
        const updated = await f.service.getGift(id, catalogOwner);
        assert.equal(updated?.currency, "CHF");
        assert.equal(updated?.purchased, 1);
        assert.equal(updated?.source, "test-import");
        assert.equal(updated?.source_id, "original");
        assert.equal(updated?.suggested_price, 1500);
        assert.equal(updated?.created_at, row?.created_at);
        assert.deepEqual(updated?.offers, []);
        assert.equal(await f.auditCount(id), 2);
      },
    ],
    [
      "duplicates distinguish variants and retain the explicit copy option",
      async (f) => {
        const input = {
          ...giftInput,
          list_id: f.list,
          size: "M",
          color: "BLUE",
        };
        const id = await f.service.saveGift(input, catalogOwner);
        await assert.rejects(
          f.service.saveGift(
            { ...input, size: "m", color: "blue" },
            catalogOwner,
          ),
          /existe déjà/,
        );
        const other = await f.service.saveGift(
          { ...input, size: "L" },
          catalogOwner,
        );
        await assert.rejects(
          f.service.saveGift({ ...input }, catalogOwner, other),
          /existe déjà/,
        );
        await f.service.saveGift(
          { ...input, allow_duplicate: true },
          catalogOwner,
        );
        await f.service.saveGift(
          { ...input, title: "Renamed original" },
          catalogOwner,
          id,
        );
        assert.equal(
          (await f.service.getGift(id, catalogOwner))?.title,
          "Renamed original",
        );
        // SQLite NOCASE is ASCII-only; both adapters must preserve that behavior.
        await f.service.saveGift({ ...input, size: "É" }, catalogOwner);
        await f.service.saveGift({ ...input, size: "é" }, catalogOwner);
      },
    ],
    [
      "budget and quantity guards use contribution history and active reservations",
      async (f) => {
        const input = { ...giftInput, list_id: f.list };
        const id = await f.service.saveGift(input, catalogOwner);
        await f.seedReservation(id, 2, "reserved", false);
        await f.seedReservation(id, 1, "cancelled", false);
        await f.seedReservation(id, 1, "reserved", true);
        await assert.rejects(
          f.service.saveGift({ ...input, quantity: 1 }, catalogOwner, id),
          /réservations actives/,
        );
        await f.service.saveGift({ ...input, quantity: 2 }, catalogOwner, id);
        await f.seedContribution(id);
        await assert.rejects(
          f.service.saveGift(
            { ...input, budget_mode: "unknown", target: "" },
            catalogOwner,
            id,
          ),
          /historique de contributions/,
        );
        for (const budget_mode of ["unknown", "free"]) {
          const gift = await f.service.saveGift(
            {
              title: "Temps ensemble",
              kind: "experience",
              budget_mode,
              list_id: f.list,
            },
            catalogOwner,
          );
          assert.equal(
            (await f.service.getGift(gift, catalogOwner))?.target,
            0,
          );
        }
        await assert.rejects(
          f.service.saveGift(
            { ...input, target: "1000000", quantity: 2, allow_duplicate: true },
            catalogOwner,
          ),
          /hors limites/,
        );
        await assert.rejects(
          f.service.saveGift({ ...input, target: "12.345" }, catalogOwner),
          /décimales/,
        );
      },
    ],
    [
      "references, offer ownership and invalid updates fail without partial writes",
      async (f) => {
        const offer = randomUUID();
        const input = {
          ...giftInput,
          list_id: f.list,
          offers: [{ id: offer, url: "https://shop.example.org/p" }],
        };
        const id = await f.service.saveGift(input, catalogOwner);
        const other = await f.service.saveGift(
          { ...input, url: "https://example.org/other", offers: [] },
          catalogOwner,
        );
        const before = await f.service.getGift(other, catalogOwner);
        await assert.rejects(
          f.service.saveGift(
            { ...input, title: "Overwrite", url: "https://example.org/other" },
            catalogOwner,
            other,
          ),
          /Offre inconnue/,
        );
        assert.deepEqual(await f.service.getGift(other, catalogOwner), before);
        await assert.rejects(
          f.service.saveGift(
            { ...input, offers: [input.offers[0], input.offers[0]] },
            catalogOwner,
            id,
          ),
          /qu’une fois/,
        );
        for (const patch of [
          { list_id: randomUUID() },
          { category_id: randomUUID() },
          { priority: 98765 },
        ])
          await assert.rejects(
            f.service.saveGift({ ...input, ...patch }, catalogOwner, id),
            /introuvable|inconnue/,
          );
        await assert.rejects(
          f.service.saveGift(input, catalogOwner, randomUUID()),
          /Cadeau introuvable/,
        );
        assert.equal(
          await f.service.getGift(randomUUID(), catalogOwner),
          undefined,
        );
      },
    ],
    [
      "owner context and surprise disclosure protect metadata updates and reads",
      async (f) => {
        const list = await f.listCreate(true);
        const input = {
          ...giftInput,
          list_id: list,
          purchased: true,
          closed: true,
        };
        const id = await f.service.saveGift(input, catalogOwner);
        const hidden = await f.service.getGift(id, catalogOwner);
        assert.equal(hidden?.purchased, null);
        assert.equal(hidden?.closed, null);
        assert.equal(hidden?.surprise_hidden, true);
        await assert.rejects(
          f.service.saveGift(
            { ...input, title: "No reveal" },
            catalogOwner,
            id,
          ),
          /Révélez/,
        );
        const revealed = { ...catalogOwner, revealSurprises: true };
        await f.service.saveGift({ ...input, title: "Revealed" }, revealed, id);
        assert.equal((await f.service.getGift(id, revealed))?.purchased, 1);
        assert.equal(
          (
            await f.service.getGift(id, {
              ...catalogOwner,
              recipientLists: ["another-list"],
            })
          )?.purchased,
          1,
        );
        await assert.rejects(
          f.service.getGift(id, { owner: false, lists: [list] }),
          /administrateur/,
        );
        await assert.rejects(
          f.service.saveGift(input, { owner: false, lists: [list] }),
          /administrateur/,
        );
      },
    ],
    [
      "audit failure rolls back the gift and its complete offer replacement",
      async (f) => {
        const input = {
          ...giftInput,
          list_id: f.list,
          offers: [{ url: "https://shop.example.org/first" }],
        };
        const id = await f.service.saveGift(input, catalogOwner);
        const before = await f.service.getGift(id, catalogOwner);
        await f.failAudit();
        await assert.rejects(
          f.service.saveGift(
            {
              ...input,
              title: "Not committed",
              offers: [{ url: "https://shop.example.org/second" }],
            },
            catalogOwner,
            id,
          ),
        );
        assert.deepEqual(await f.service.getGift(id, catalogOwner), before);
      },
    ],
  ];
  for (const [title, run] of cases)
    test(`${name}: ${title}`, async () => {
      const f = await create();
      try {
        await run(f);
      } finally {
        await f.close();
      }
    });
}
