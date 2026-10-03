import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const headers = { origin: "http://localhost:3211" };

test("simple gift options and reversible owner purchase switch", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: headers.origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Ajouter une envie", exact: true })
    .click();
  await page.getByText("Plus d’options", { exact: true }).click();
  await expect(
    page.getByText(/ChatGPT|Sendico|Fermer les nouvelles intentions/),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog").getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /acheté/ })).toHaveCount(0);
  const title = `Un cadeau tout simple ${info.project.name}`;
  await page
    .getByLabel("Lien du produit", { exact: true })
    .fill(`https://example.com/simple-${info.project.name}`);
  await page.getByLabel("Nom de cette envie", { exact: true }).fill(title);
  await page.getByLabel("Objectif (EUR)", { exact: false }).fill("25");
  await page
    .getByRole("checkbox", { name: "Mettre cette envie en pause", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Mettre cette envie en pause", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/gift-options-${info.project.name}.png`,
    fullPage: false,
    scale: "css",
  });
  await page
    .getByRole("button", { name: "Enregistrer cette envie", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const admin = await (await context.request.get("/api/admin")).json();
  const gift = admin.gifts.find((g: { title: string }) => g.title === title);
  expect(gift.closed).toBe(1);
  expect(gift).not.toHaveProperty("japan_search");
  const guest = await browser.newContext({ baseURL: headers.origin });
  try {
    expect(
      (
        await guest.request.post(`/api/admin/gifts/${gift.id}/purchased`, {
          headers,
          data: { purchased: true },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await guest.request.post("/api/reservations", {
          headers,
          data: { gift_id: gift.id, quantity: 1 },
        })
      ).ok(),
    ).toBe(false);
    expect(
      (
        await guest.request.post("/api/contributions", {
          headers,
          data: { gift_id: gift.id, amount: "5" },
        })
      ).ok(),
    ).toBe(false);
    const card = page
      .locator(".gift-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await card.getByRole("button", { name: "Modifier", exact: true }).click();
    await page.getByText("Plus d’options", { exact: true }).click();
    await page
      .getByRole("checkbox", {
        name: "Mettre cette envie en pause",
        exact: true,
      })
      .uncheck();
    await page
      .getByRole("button", { name: "Enregistrer cette envie", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const toggle = card.getByRole("switch", {
      name: `Cadeau acheté : ${title}`,
      exact: true,
    });
    await expect(toggle).not.toBeChecked();
    await toggle.focus();
    await toggle.press("Space");
    await expect(toggle).toBeChecked();
    await expect(card.getByText("Déjà acheté", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Modifier", exact: true }).click();
    await page
      .getByRole("button", { name: "Enregistrer cette envie", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(toggle).toBeChecked();
    await page.goto(`/cadeaux/${gift.id}`);
    const detail = page.getByRole("switch", {
      name: `Cadeau acheté : ${title}`,
      exact: true,
    });
    await expect(detail).toBeChecked();
    await page.screenshot({
      path: `test-results/gift-purchased-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    await page.route(`**/api/admin/gifts/${gift.id}/purchased`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Réessayez plus tard." }),
      }),
    );
    await detail.click();
    await expect(
      page.getByText("Réessayez plus tard.", { exact: true }),
    ).toBeVisible();
    await expect(detail).toBeChecked();
    await page.unroute(`**/api/admin/gifts/${gift.id}/purchased`);
    await detail.click();
    await expect(detail).not.toBeChecked();
    await page.reload();
    await expect(detail).not.toBeChecked();
    await page
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(
      page.getByRole("switch", {
        name: `Gift purchased: ${title}`,
        exact: true,
      }),
    ).not.toBeChecked();
    // Client labels change before Next finishes streaming localized metadata.
    await expect(page).toHaveTitle("Ouicheur · Little wishes");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const visitor = await guest.newPage();
    await visitor.goto(`/cadeaux/${gift.id}`);
    await expect(visitor.getByRole("switch")).toHaveCount(0);
  } finally {
    await guest.close();
  }
});
