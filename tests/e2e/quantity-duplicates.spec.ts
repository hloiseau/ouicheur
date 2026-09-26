import { test, expect } from "./fixtures";

test("quantités et doublons volontaires dans le formulaire, l’import et la page publique", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  const login = await context.request.post("/api/login", {
    headers: { origin: "http://localhost:3211" },
    data: { password: "test-only-password-2026" },
  });
  expect(login.ok()).toBe(true);
  const title = `Quantités ${info.project.name}`;
  const url = `https://example.com/quantity-${info.project.name}`;
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Ajouter une envie", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Lien du produit", { exact: true }).fill(url);
  await dialog.getByLabel("Nom de cette envie").fill(title);
  await dialog.getByLabel("Objectif (EUR)", { exact: false }).fill("19,99");
  await dialog.getByLabel("Quantité", { exact: true }).fill("3");
  await expect(dialog.getByText(/Objectif total/)).toContainText("59,97");
  await dialog.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(dialog).not.toBeVisible();
  const card = page
    .locator(".admin-gift-row")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card.getByText(/Quantité : 3/)).toContainText("19,99");
  await card.getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(
    dialog.getByLabel("Objectif (EUR)", { exact: false }),
  ).toHaveValue("19.99");
  await expect(dialog.getByLabel("Quantité", { exact: true })).toHaveValue("3");
  await dialog.getByLabel("Quantité", { exact: true }).fill("4");
  await dialog.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(dialog).not.toBeVisible();

  await page
    .getByRole("button", { name: "Ajouter une envie", exact: true })
    .click();
  await dialog.getByLabel("Lien du produit", { exact: true }).fill(url);
  await dialog.getByLabel("Nom de cette envie").fill(`${title} copie`);
  await dialog.getByLabel("Objectif (EUR)", { exact: false }).fill("19.99");
  await dialog.getByLabel("Quantité", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(dialog.getByRole("alert")).toContainText("existe déjà");
  await dialog
    .getByRole("checkbox", { name: "Autoriser un doublon", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(dialog).not.toBeVisible();

  await page
    .getByRole("button", { name: "Importer une liste", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("json");
  await page
    .getByLabel("Contenu à importer")
    .fill(
      JSON.stringify([
        { url, title: `${title} import`, price: "19.99", currency: "EUR" },
      ]),
    );
  await page.getByRole("button", { name: "Préparer l’aperçu" }).click();
  const item = page.locator(".import-item");
  await expect(item.getByRole("checkbox").first()).not.toBeChecked();
  await item.getByRole("checkbox", { name: /Doublon détecté/ }).check();
  await item.getByRole("checkbox", { name: /Autoriser un doublon/ }).check();
  await expect(
    item.getByRole("checkbox", { name: /Doublon détecté/ }),
  ).not.toBeChecked();
  await expect(item.getByRole("checkbox").first()).toBeChecked();
  await item.getByLabel("Quantité", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "Enregistrer 1 envie(s) sélectionnée(s)" })
    .click();
  await expect(
    page.getByText(/Import enregistré. Vos envies sont visibles/),
  ).toBeVisible();
  const state = await (await context.request.get("/api/admin")).json();
  const gifts = state.gifts.filter((gift: { url: string }) => gift.url === url);
  expect(gifts).toHaveLength(3);
  expect(
    gifts
      .map((gift: { target: number }) => gift.target)
      .sort((a: number, b: number) => a - b),
  ).toEqual([3998, 7996, 9995]);
  await page.goto("/?preview=1");
  await expect(
    page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", {
          name: `${title} import`,
          exact: true,
        }),
      })
      .getByText(/Quantité : 5/),
  ).toContainText("19,99");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByText(/Quantité : 4/)).toContainText("19,99");
  await expect(page.locator(".funding-goal")).toContainText("79,96");
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.getByText(/Quantity: 4/)).toContainText("19.99");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `test-results/quantities-${info.project.name}.png`,
    fullPage: true,
  });
});
