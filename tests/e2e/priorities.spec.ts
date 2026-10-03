import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import type { GiftPriority } from "../../lib/priority-labels";
const headers = { origin: "http://localhost:3211" };

test("priorities can be renamed, added and reordered without losing the wish draft", async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(90000);
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: headers.origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  const initial = await (await context.request.get("/api/admin")).json();
  const original: GiftPriority[] = initial.priorities;
  const customName = `Pour bientôt ${info.project.name}`;
  const renamed = `Mes favoris ${info.project.name}`;
  const title = `Mon envie prioritaire ${info.project.name}`;
  let giftId = "";
  const guest = await browser.newContext({ baseURL: headers.origin });
  try {
    expect(
      (
        await guest.request.post("/api/admin/priorities", { headers, data: {} })
      ).status(),
    ).toBe(401);
    await page.goto("/admin");
    // A NAS on plain HTTP does not provide crypto.randomUUID in the browser.
    await page.evaluate(() =>
      Object.defineProperty(crypto, "randomUUID", {
        value: undefined,
        configurable: true,
      }),
    );
    await page
      .getByRole("button", { name: "Ajouter une envie", exact: true })
      .click();
    await page
      .getByLabel("Lien du produit", { exact: true })
      .fill(`https://example.com/priorities-${info.project.name}`);
    await page.getByLabel("Nom de cette envie", { exact: true }).fill(title);
    await page.getByLabel("Objectif (EUR)", { exact: false }).fill("29");
    await page.getByText("Plus d’options", { exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Gérer les priorités", exact: true })
      .click();
    const manager = page.getByRole("dialog", {
      name: "Gérer les priorités",
      exact: true,
    });
    await manager
      .getByLabel(
        `Nom de la priorité ${original.findIndex((p) => p.id === 2) + 1}`,
        { exact: true },
      )
      .fill(renamed);
    await manager
      .getByLabel(
        `Nom de la priorité ${original.findIndex((p) => p.id === 0) + 1}`,
        { exact: true },
      )
      .fill(`Un jour ${info.project.name}`);
    await manager
      .getByRole("button", { name: "Ajouter une priorité", exact: true })
      .click();
    await manager
      .getByLabel(`Nom de la priorité ${original.length + 1}`, { exact: true })
      .fill(customName);
    for (let i = 0; i < original.length; i++)
      await manager
        .getByRole("button", { name: `Monter ${customName}`, exact: true })
        .click();
    await expect(
      manager.getByLabel("Nom de la priorité 1", { exact: true }),
    ).toHaveValue(customName);
    await manager
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(
      page.getByLabel("Priority 1 name", { exact: true }),
    ).toHaveValue(customName);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole("dialog", { name: "Manage priorities", exact: true })
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("fr");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await manager.evaluate((el) => el.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/priorities-manager-${info.project.name}.png`,
      fullPage: false,
      scale: "css",
    });
    if (info.project.name === "mobile") {
      await manager.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.screenshot({
        path: "test-results/priorities-manager-mobile-bottom.png",
        fullPage: false,
        scale: "css",
      });
    }
    await manager
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(manager).toHaveCount(0);
    await expect(
      page.getByLabel("Nom de cette envie", { exact: true }),
    ).toHaveValue(title);
    await expect(
      page.getByLabel("Objectif (EUR)", { exact: false }),
    ).toHaveValue("29");
    await page
      .getByRole("combobox", { name: "Priorité", exact: true })
      .selectOption({ label: customName });
    await page
      .getByRole("button", { name: "Enregistrer cette envie", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const data = await (await context.request.get("/api/admin")).json();
    const priority: GiftPriority = data.priorities.find(
      (p: GiftPriority) => p.name === customName,
    );
    giftId = data.gifts.find((g: { title: string }) => g.title === title).id;
    await expect(
      page
        .locator(".gift-card")
        .first()
        .getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(renamed) }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Filtrer par priorité", exact: true })
      .selectOption(String(priority.id));
    await expect(page.locator(".gift-card")).toHaveCount(1);
    await expect(page.locator(".card-badge")).toHaveText(customName);
    await page.reload();
    await expect(
      page
        .locator(".gift-card")
        .first()
        .getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Gérer les priorités", exact: true })
      .click();
    await page.locator(".priority-row").first().getByRole("radio").check();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: new RegExp(customName) }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/priorities-wishlist-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    const visitor = await guest.newPage();
    await visitor.goto("/");
    await expect(
      visitor.getByRole("button", { name: new RegExp(customName) }),
    ).toBeVisible();
    await expect(
      visitor.getByRole("button", {
        name: /Manage priorities|Gérer les priorités/,
      }),
    ).toHaveCount(0);
    await visitor
      .getByRole("combobox", { name: "Filter by priority", exact: true })
      .selectOption(String(priority.id));
    await expect(visitor.locator(".gift-card")).toHaveCount(1);
    const exported = await (
      await context.request.get("/api/admin/export")
    ).json();
    expect(
      exported.priorities.find((p: GiftPriority) => p.id === priority.id).name,
    ).toBe(customName);
    expect(
      exported.gifts.find((g: { id: string }) => g.id === giftId).priority_id,
    ).toBe(priority.id);
    await page.goto(`/cadeaux/${giftId}`);
    await expect(
      page.getByText(`Priorité : ${customName}`, { exact: true }),
    ).toBeVisible();
    // A custom label used only by a private gift must not be sent to guests.
    const privateList = await (
      await context.request.post("/api/admin/lists", {
        headers,
        data: { name: "Privé", visibility: "private" },
      })
    ).json();
    await context.request.post(`/api/admin/gifts/${giftId}`, {
      headers,
      data: {
        url: `https://example.com/priorities-${info.project.name}`,
        title,
        target: "29",
        list_id: privateList.id,
        priority: priority.id,
      },
    });
    await visitor.goto("/");
    expect(await visitor.content()).not.toContain(customName);
  } finally {
    const data = await (await context.request.get("/api/admin")).json();
    const current: GiftPriority[] = data.priorities;
    const restored = [
      ...original,
      ...current.filter((p) => !original.some((o) => o.id === p.id)),
    ];
    expect(
      (
        await context.request.post("/api/admin/priorities", {
          headers,
          data: {
            previous: current,
            priorities: restored.map(({ id, name }) => ({ id, name })),
            featured: restored.findIndex((p) => p.id === 2),
          },
        })
      ).ok(),
    ).toBe(true);
    await guest.close();
  }
});
