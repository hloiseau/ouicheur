import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

const headers = { origin: "http://localhost:3211" };
test("language and category creation preserve the entire wish draft", async ({
  page,
  context,
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
  await page
    .getByLabel("Lien du produit", { exact: true })
    .fill(`https://example.com/ux-category-${info.project.name}`);
  await page
    .getByLabel("Nom de cette envie", { exact: true })
    .fill("Mon brouillon conservé");
  await page.getByLabel("Objectif (EUR)", { exact: false }).fill("12.50");
  await page.getByLabel("Quantité", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Créer une catégorie", exact: true })
    .click();
  await page
    .getByLabel("Nom de la catégorie", { exact: true })
    .fill(`Mes nouvelles idées ${info.project.name}`);
  await page
    .getByRole("dialog")
    .last()
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.getByLabel("Category name", { exact: true })).toHaveValue(
    `Mes nouvelles idées ${info.project.name}`,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Gift name", { exact: true })).toHaveValue(
    "Mon brouillon conservé",
  );
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Goal (EUR)", { exact: false })).toHaveValue(
    "12.50",
  );
  await expect(
    page
      .getByRole("combobox", { name: "Category", exact: true })
      .locator("option:checked"),
  ).toHaveText(`Mes nouvelles idées ${info.project.name}`);
  await page
    .getByRole("button", { name: "Create a category", exact: true })
    .click();
  await page
    .getByLabel("Category name", { exact: true })
    .fill("A cancelled category");
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("fr");
  await expect(
    page.getByLabel("Nom de cette envie", { exact: true }),
  ).toHaveValue("Mon brouillon conservé");
  await page.screenshot({
    path: `test-results/wish-inline-category-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("button", { name: "Enregistrer cette envie", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const data = await (await context.request.get("/api/admin")).json();
  const gift = data.gifts.find(
    (g: { url: string }) =>
      g.url === `https://example.com/ux-category-${info.project.name}`,
  );
  expect(gift.title).toBe("Mon brouillon conservé");
  expect(gift.target).toBe(2500);
  expect(gift.category_id).toBe(
    data.categories.find(
      (c: { name: string }) =>
        c.name === `Mes nouvelles idées ${info.project.name}`,
    ).id,
  );
  expect(
    data.categories.some(
      (c: { name: string }) => c.name === "A cancelled category",
    ),
  ).toBe(false);
});

test("owner can discover, cancel and revisit a purchased reservation", async ({
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
  const gift = await (
    await context.request.post("/api/admin/gifts", {
      headers,
      data: {
        title: `Une réservation à gérer ${info.project.name}`,
        url: `https://example.com/manage-${info.project.name}`,
        target: "30",
        quantity: 2,
      },
    })
  ).json();
  const guest = await browser.newContext({ baseURL: headers.origin });
  try {
    const reservation = await (
      await guest.request.post("/api/reservations", {
        headers,
        data: { gift_id: gift.id, quantity: 1 },
      })
    ).json();
    await guest.request.post(`/api/reservations/${reservation.token}`, {
      headers,
      data: { state: "purchased" },
    });
    const status = await (
      await guest.request.get(`/api/reservations/${reservation.token}`)
    ).json();
    expect(
      (
        await guest.request.post("/api/admin/reservations/cancel", {
          headers,
          data: { id: status.id, confirm: true },
        })
      ).status(),
    ).toBe(401);
    await page.goto(`/cadeaux/${gift.id}`);
    await page
      .getByRole("link", { name: "Gérer les réservations", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Réservations", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(
      page.getByRole("heading", { name: "Reservations", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Reservations", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("fr");
    page.once("dialog", (d) => d.dismiss());
    await page
      .getByRole("button", { name: "Annuler la réservation", exact: true })
      .click();
    await expect(page.getByText(/Achetée/)).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Annuler la réservation", exact: true })
      .click();
    await expect(page.getByText(/Annulée/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Annuler la réservation", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `test-results/owner-reservation-cancelled-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    await page
      .getByRole("link", { name: "Voir cette envie", exact: true })
      .click();
    await expect(
      page.getByText("2 exemplaires disponibles", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await (
          await guest.request.get(`/api/reservations/${reservation.token}`)
        ).json()
      ).state,
    ).toBe("cancelled");
    await page.goto("/admin?tab=reservations");
    await expect(
      page.getByRole("heading", { name: "Réservations", exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await guest.close();
  }
});

test("an unavailable owner API offers retry without a misleading sign-in form", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: headers.origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  await page.route("**/api/admin", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "Temporarily unavailable",
    }),
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Un petit contretemps." }),
  ).toBeVisible();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `test-results/owner-retry-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page.unroute("**/api/admin");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mes envies", exact: true }),
  ).toBeVisible();
});

test("invalid contribution links return a public not-found state", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: headers.origin },
  ]);
  for (const token of ["missing", "0".repeat(64)]) {
    expect(
      (await context.request.get(`/api/contributions/${token}`)).status(),
    ).toBe(404);
    await page.goto(`/contribution/${token}`);
    await expect(
      page.getByRole("heading", { name: "Le suivi est indisponible." }),
    ).toBeVisible();
    await expect(
      page.getByText("Contribution introuvable.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Connexion administrateur requise.", { exact: true }),
    ).toHaveCount(0);
  }
});
