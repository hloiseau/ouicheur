import { test, expect } from "./fixtures";
test("Ouichlist, contribution privée, administration et erreurs", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "La Ouichlist de Camille" }),
  ).toBeVisible();
  expect(await page.locator(".gift-card").count()).toBeGreaterThanOrEqual(3);
  await expect(
    page.getByText("Pour tes petits moments de bonheur !"),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/wishlist-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page.screenshot({
    path: `test-results/wishlist-viewport-${info.project.name}.png`,
    scale: "css",
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page
    .getByRole("searchbox", { name: "Rechercher une envie" })
    .fill("introuvable-test");
  await expect(page.getByText("Aucune envie trouvée")).toBeVisible();
  await page.getByRole("searchbox", { name: "Rechercher une envie" }).fill("");
  await page
    .getByRole("link", {
      name: "Une lumière pour les soirs de lecture",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Une lumière pour les soirs de lecture",
    }),
  ).toBeVisible();
  await expect(page.getByText("0", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `test-results/gift-detail-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("textbox", { name: "Votre contribution (EUR)" })
    .fill("12,50");
  await page
    .getByRole("textbox", { name: "Votre petit nom (facultatif)" })
    .fill(`Visiteur ${info.project.name}`);
  await page
    .getByRole("textbox", { name: "Un mot qui fait sourire (facultatif)" })
    .fill("Message strictement privé");
  const previousFunding = Number(
    await page.getByRole("progressbar").getAttribute("value"),
  );
  // Stub the destination before the automatic opening; no PayPal request or transfer.
  await context.route("https://paypal.me/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>PayPal simulé</h1>",
    }),
  );
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continuer vers PayPal" }).click();
  const paypal = await popupPromise;
  await expect(paypal).toHaveURL(
    "https://paypal.me/FictionalTestOnly/12.50EUR",
  );
  expect(await paypal.evaluate(() => window.opener)).toBeNull();
  await paypal.close();
  await expect(
    page.getByRole("heading", { name: "Une envie se rapproche." }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await expect(
    page.getByRole("link", { name: /Ouvrir PayPal/ }),
  ).toHaveAttribute("href", "https://paypal.me/FictionalTestOnly/12.50EUR");
  await page.getByRole("button", { name: "J’ai envoyé l’argent" }).click();
  await expect(
    page.getByText("Participation comptabilisée", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "J’ai envoyé l’argent" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ouvrir PayPal/ })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: `test-results/contribution-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page.getByRole("link", { name: "Retour au cadeau" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "value",
    String(previousFunding + 1250),
  );
  await expect(page.getByText("Message strictement privé")).toHaveCount(0);
  const unauthorized = await context.request.post(
    "/api/admin/contributions/review",
    {
      headers: { origin: "http://localhost:3211" },
      data: {},
    },
  );
  expect(unauthorized.status()).toBe(401);
  await page.goto("/admin");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("test-only-password-2026");
  await page.getByRole("button", { name: "Entrer dans mon espace" }).click();
  await expect(page.getByRole("heading", { name: "Mes envies" })).toBeVisible();
  await page.screenshot({
    path: `test-results/admin-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  const csrf = await context.request.post("/api/admin/profile", {
    headers: { origin: "https://attacker.example" },
    data: {},
  });
  expect(csrf.status()).toBe(403);
  const ssrf = await context.request.post("/api/admin/extract", {
    headers: { origin: "http://localhost:3211" },
    data: { url: "http://169.254.169.254/latest/meta-data" },
  });
  expect(ssrf.status()).toBe(400);
  await page.getByRole("button", { name: /Contributions/ }).click();
  const row = page
    .locator(".contribution-row")
    .filter({ hasText: `Visiteur ${info.project.name}` });
  await expect(row.getByRole("button")).toHaveText(["Valider", "Refuser"]);
  await expect(row.locator("input, textarea, select")).toHaveCount(0);
  await row.screenshot({
    path: `test-results/approval-${info.project.name}.png`,
    scale: "css",
  });
  const rejectedOrigin = await context.request.post(
    "/api/admin/contributions/review",
    {
      headers: { origin: "https://attacker.example" },
      data: { id, approved: true },
    },
  );
  expect(rejectedOrigin.status()).toBe(403);
  await row.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(row).toHaveCount(0);
  const status = await context.request.get(`/api/contributions/${id}`);
  const statusData = await status.json();
  expect(statusData.approved).toBe(1);
  expect(statusData.payment).toBeNull();
  const funded = async () => {
    const data = await (await context.request.get("/api/admin")).json();
    return data.gifts.find(
      (gift: { id: string }) => gift.id === statusData.gift_id,
    ).funded;
  };
  expect(await funded()).toBe(previousFunding + 1250);
  await page
    .getByRole("combobox", { name: "Afficher", exact: true })
    .selectOption("confirmed");
  await expect(row.getByText("Validée", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Refuser", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(await funded()).toBe(previousFunding);
  expect(
    (await (await context.request.get(`/api/contributions/${id}`)).json())
      .state,
  ).toBe("rejected");
  await page
    .getByRole("combobox", { name: "Afficher", exact: true })
    .selectOption("rejected");
  await row.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(await funded()).toBe(previousFunding + 1250);
  await page.getByRole("button", { name: "Mes envies", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une envie" }).click();
  await page
    .getByRole("textbox", { name: /Lien du produit/ })
    .fill("http://127.0.0.1/private");
  await page
    .getByRole("button", { name: "Récupérer les informations" })
    .click();
  await expect(
    page.getByRole("button", { name: "Compléter manuellement", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Lien du produit", { exact: true })
    .fill(`https://example.com/manual-${info.project.name}`);
  await page
    .getByLabel("Nom de cette envie")
    .fill(`Ajout manuel ${info.project.name}`);
  await page.getByLabel("Objectif (EUR)", { exact: false }).fill("39.90");
  await page.getByText("Plus d’options", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Visibilité", exact: true })
    .selectOption("visible");
  await page.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(
    page.getByRole("heading", { name: `Ajout manuel ${info.project.name}` }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Importer une liste", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("json");
  await page.getByLabel("Contenu à importer").fill(
    JSON.stringify([
      {
        source_id: `e2e-${info.project.name}`,
        url: `https://example.com/import-${info.project.name}`,
        title: `Import ${info.project.name}`,
        price: "22.50",
        currency: "EUR",
      },
    ]),
  );
  await page.getByRole("button", { name: "Préparer l’aperçu" }).click();
  await expect(
    page.getByRole("heading", { name: "Aperçu de l’import" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enregistrer 1 envie(s) sélectionnée(s)" })
    .click();
  await expect(
    page.getByText(/Import enregistré. Vos envies sont visibles/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Préparer l’aperçu" }).click();
  await expect(page.getByText(/Doublon détecté/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Enregistrer 0 envie(s) sélectionnée(s)",
    }),
  ).toBeDisabled();
  await page.goto(`/contribution/${id}`);
  await expect(
    page.getByRole("heading", { name: "Votre versement est confirmé." }),
  ).toBeVisible();
  await expect(
    page.getByText("Confirmé par le propriétaire", { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Message strictement privé")).toHaveCount(0);
  expect(errors).toEqual([]);
});
