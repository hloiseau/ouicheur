import { test, expect } from "./fixtures";

test("Throne : importer une page enregistrée et conserver l’aperçu en cas d’erreur", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(60000);
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: baseURL! },
  ]);
  await page.goto("/admin");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("test-only-password-2026");
  await page.getByRole("button", { name: "Entrer dans mon espace" }).click();
  await page
    .getByRole("button", { name: "Importer une liste", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("throne-html");
  await page
    .getByLabel("Page Throne enregistrée (.html)")
    .setInputFiles("tests/fixtures/throne-next.html");
  await page.getByRole("button", { name: "Préparer l’aperçu" }).click();
  await expect(page.locator(".import-item")).toHaveCount(2);
  const camera = page
    .locator(".import-item")
    .filter({ hasText: "Objectif photo" });
  // The same fixture may already exist in the other browser project.
  await camera.getByRole("checkbox").first().check();
  const replace = camera.getByRole("checkbox", { name: /Doublon détecté/ });
  if (await replace.count()) await replace.check();
  await expect(
    camera.getByLabel("Objectif (EUR)", { exact: false }),
  ).toHaveValue("");
  await page
    .locator(".import-item")
    .filter({ hasText: "Cadeau à compléter" })
    .getByRole("checkbox", { name: "Cadeau à compléter", exact: true })
    .uncheck();
  await camera
    .getByText("Vérifier et modifier les champs", { exact: true })
    .click();
  await camera.getByLabel("Objectif (EUR)", { exact: false }).fill("500");
  await page
    .getByRole("button", { name: "Enregistrer 1 envie(s) sélectionnée(s)" })
    .click();
  await expect(
    page.getByText(/Import enregistré. Vos envies sont visibles/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Préparer l’aperçu" }).click();
  await expect(camera.getByRole("checkbox").first()).not.toBeChecked();
  await expect(camera.getByText(/Doublon détecté/)).toBeVisible();
  await page.getByLabel("Page Throne enregistrée (.html)").setInputFiles({
    name: "challenge.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>Verify you are human</h1>"),
  });
  await page.getByRole("button", { name: "Préparer l’aperçu" }).click();
  await expect(
    page.getByText(/Aucun produit dans cette page Throne/),
  ).toBeVisible();
  await expect(page.locator(".import-item")).toHaveCount(2);
});
