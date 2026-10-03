import { test, expect, fixtureDatabase } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { offerIdentity, recordOfferPrice } from "../../lib/price-history";
const origin = "http://localhost:3211",
  headers = { origin };
test("price history presents comparable observations and saves opt-in alerts without touching the wish", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  const title = `Prix d’une édition ${info.project.name}`;
  const gift = await (
    await context.request.post("/api/admin/gifts", {
      headers,
      data: {
        title,
        url: `https://example.org/price-${info.project.name}`,
        model: "Édition 2",
        target: "35",
      },
    })
  ).json();
  const db = fixtureDatabase();
  try {
    const identity = offerIdentity(db, gift.id);
    recordOfferPrice(
      db,
      identity,
      {
        url: identity.url,
        price: 3000,
        currency: "EUR",
        availability: "out_of_stock",
      },
      "manual",
      new Date(Date.now() - 86400000),
    );
    recordOfferPrice(
      db,
      identity,
      {
        url: identity.url,
        price: 2500,
        currency: "EUR",
        availability: "in_stock",
      },
      "manual",
    );
  } finally {
    db.close();
  }
  await page.goto("/admin");
  await page
    .getByRole("textbox", { name: "Rechercher une envie", exact: true })
    .fill(title);
  const card = page.locator(".admin-gift-row").filter({ hasText: title });
  await card.getByRole("button", { name: "Modifier", exact: true }).click();
  const section = page.locator("details.price-history");
  await section.locator("summary").click();
  await expect(section.getByRole("table")).toBeVisible();
  await expect(
    section.getByRole("cell", { name: "25,00 €", exact: true }),
  ).toBeVisible();
  await expect(
    section.getByRole("checkbox", {
      name: "Actualiser automatiquement cette offre",
      exact: true,
    }),
  ).not.toBeChecked();
  await section
    .getByRole("textbox", { name: /Me prévenir à ce prix ou moins/ })
    .fill("24,50");
  await section
    .getByRole("checkbox", {
      name: "J’ai vérifié que ce lien correspond bien à la variante choisie",
      exact: true,
    })
    .check();
  await section
    .getByRole("button", { name: "Enregistrer ce suivi", exact: true })
    .click();
  await expect(section.getByText(/Suivi enregistré\./)).toBeVisible();
  await page.screenshot({
    path: `test-results/price-history-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const current = await (
    await context.request.get(`/api/admin/price-history?gift_id=${gift.id}`)
  ).json();
  expect(current.watch.threshold).toBe(2450);
  expect(current.watch.automatic).toBe(0);
  expect(
    (await (await context.request.get("/api/admin")).json()).gifts.find(
      (g: { id: string }) => g.id === gift.id,
    ).target,
  ).toBe(3500);
  const guest = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await guest.request.get(`/api/admin/price-history?gift_id=${gift.id}`)
      ).status(),
    ).toBe(401);
  } finally {
    await guest.close();
  }
});
