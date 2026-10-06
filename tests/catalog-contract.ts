import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { catalogService } from "../lib/catalog.ts";

export const catalogOwner = { owner: true, lists: [] as string[] };
export interface CatalogFixture {
  service: ReturnType<typeof catalogService>;
  share(id: string): Promise<string | null>;
  seedShare(id: string): Promise<void>;
  seedReveal(): Promise<void>;
  revealed(): Promise<number>;
  seedGift(list: string, id: string): Promise<void>;
  purchased(id: string): Promise<number>;
  auditCount(action: string, id: string): Promise<number>;
  failAudit(): Promise<void>;
  close(): Promise<void>;
}
export function catalogContract(
  name: string,
  create: () => Promise<CatalogFixture>,
) {
  const cases: [string, (f: CatalogFixture) => Promise<void>][] = [
    [
      "list edits preserve optional settings and require explicit surprise disclosure",
      async (f) => {
        const id = await f.service.saveList(
          {
            name: "Anniversaire",
            visibility: "private",
            surprise_mode: true,
            suggestions_enabled: true,
            event_annual: true,
            event_timezone: "Asia/Tokyo",
            leap_day: "skip",
            event_date: "2028-02-29",
          },
          catalogOwner,
        );
        await f.service.saveList(
          {
            id,
            name: "Renommée",
            visibility: "private",
            event_date: "2028-02-29",
          },
          catalogOwner,
        );
        const saved = await f.service.getList(id, catalogOwner);
        assert.equal(saved?.name, "Renommée");
        assert.equal(saved?.surprise_mode, 1);
        assert.equal(saved?.suggestions_enabled, 1);
        assert.equal(saved?.event_annual, 1);
        assert.equal(saved?.event_timezone, "Asia/Tokyo");
        assert.equal(saved?.leap_day, "skip");
        await assert.rejects(
          f.service.saveList(
            { id, name: "Oops", visibility: "public", surprise_mode: false },
            catalogOwner,
          ),
          /Confirmez/,
        );
        assert.deepEqual(await f.service.getList(id, catalogOwner), saved);
        await f.service.saveList(
          {
            id,
            name: "Confirmée",
            visibility: "public",
            surprise_mode: false,
            confirm_reveal: true,
          },
          catalogOwner,
        );
        assert.equal(
          (await f.service.getList(id, catalogOwner))?.surprise_mode,
          0,
        );
        await assert.rejects(
          f.service.saveList(
            { id: randomUUID(), name: "Missing", visibility: "private" },
            catalogOwner,
          ),
          /introuvable/,
        );
      },
    ],
    [
      "share revocation and session reveal reset follow the existing rules",
      async (f) => {
        const id = await f.service.saveList(
          { name: "Partagée", visibility: "unlisted" },
          catalogOwner,
        );
        await f.seedShare(id);
        await f.seedReveal();
        await f.service.saveList(
          { id, name: "Renommée", visibility: "unlisted" },
          catalogOwner,
        );
        assert.equal(await f.share(id), "test-share-hash");
        assert.equal(await f.revealed(), 1);
        await f.service.saveList(
          { id, name: "Surprise", visibility: "unlisted", surprise_mode: true },
          catalogOwner,
        );
        assert.equal(await f.revealed(), 0);
        await f.seedReveal();
        await f.service.saveList(
          { id, name: "Même surprise", visibility: "unlisted" },
          catalogOwner,
        );
        assert.equal(await f.revealed(), 1);
        await f.service.saveList(
          { id, name: "Archivée", visibility: "unlisted", archived: true },
          catalogOwner,
        );
        assert.equal(await f.share(id), null);
        await f.seedShare(id);
        await f.service.saveList(
          { id, name: "Privée", visibility: "private" },
          catalogOwner,
        );
        assert.equal(await f.share(id), null);
      },
    ],
    [
      "authorization and validation precede persistence",
      async (f) => {
        await assert.rejects(
          f.service.saveList(
            { name: "No", visibility: "public" },
            { owner: false, lists: [] },
          ),
          /administrateur/,
        );
        await assert.rejects(
          f.service.getList("default", { owner: false, lists: [] }),
          /administrateur/,
        );
        await assert.rejects(
          f.service.saveList({ name: "", visibility: "public" }, catalogOwner),
        );
        await assert.rejects(
          f.service.saveList(
            {
              name: "Invalid date",
              visibility: "public",
              event_date: "2026-02-30",
            },
            catalogOwner,
          ),
        );
        await assert.rejects(
          f.service.saveList(
            {
              name: "Timezone",
              visibility: "public",
              event_timezone: "Invalid/Zone",
            },
            catalogOwner,
          ),
        );
        assert.equal(
          await f.service.getList(randomUUID(), catalogOwner),
          undefined,
        );
      },
    ],
    [
      "purchase state is reversible, idempotent and protected by surprise permissions",
      async (f) => {
        const list = await f.service.saveList(
          { name: "Surprise", visibility: "private", surprise_mode: true },
          catalogOwner,
        );
        const gift = randomUUID();
        await f.seedGift(list, gift);
        await assert.rejects(
          f.service.setGiftPurchased(gift, { purchased: true }, catalogOwner),
          /Révélez/,
        );
        await assert.rejects(
          f.service.setGiftPurchased(
            gift,
            { purchased: true },
            { owner: false, lists: [] },
          ),
          /administrateur/,
        );
        const revealed = { ...catalogOwner, revealSurprises: true };
        for (const input of [
          { purchased: 1 },
          { purchased: "false" },
          { purchased: true, title: "overwrite" },
          {},
        ])
          await assert.rejects(
            f.service.setGiftPurchased(gift, input, revealed),
          );
        await assert.rejects(
          f.service.setGiftPurchased(
            randomUUID(),
            { purchased: true },
            revealed,
          ),
          /introuvable/,
        );
        await f.service.setGiftPurchased(gift, { purchased: true }, revealed);
        await f.service.setGiftPurchased(gift, { purchased: true }, revealed);
        assert.equal(await f.purchased(gift), 1);
        assert.equal(await f.auditCount("gift.purchase", gift), 1);
        await f.service.setGiftPurchased(gift, { purchased: false }, revealed);
        assert.equal(await f.purchased(gift), 0);
        // Being a recipient of another list must not block this owner operation.
        await f.service.setGiftPurchased(
          gift,
          { purchased: true },
          { ...catalogOwner, recipientLists: ["another-list"] },
        );
        assert.equal(await f.purchased(gift), 1);
      },
    ],
    [
      "audit failure rolls back both list and gift mutations",
      async (f) => {
        const list = await f.service.saveList(
          { name: "Before", visibility: "private" },
          catalogOwner,
        );
        const gift = randomUUID();
        await f.seedGift(list, gift);
        await f.failAudit();
        await assert.rejects(
          f.service.saveList(
            { id: list, name: "After", visibility: "public" },
            catalogOwner,
          ),
        );
        assert.equal(
          (await f.service.getList(list, catalogOwner))?.name,
          "Before",
        );
        await assert.rejects(
          f.service.setGiftPurchased(gift, { purchased: true }, catalogOwner),
        );
        assert.equal(await f.purchased(gift), 0);
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
