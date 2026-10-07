import { test, expect } from "./fixtures";

test.use({ locale: "fr-FR" });

test("first visit follows the browser without a cookie and keeps a manual choice", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  expect(await response!.text()).toMatch(/<html\b[^>]*\blang="fr"(?:\s|>)/);
  await expect(page).toHaveTitle("Ouicheur · Les petites envies");
  await expect(
    page.getByRole("heading", { name: "La Ouichlist de Camille" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Langue", exact: true }),
  ).toHaveValue("fr");
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "ouicheur_locale",
    ),
  ).toBe(false);
  await page.screenshot({
    path: `test-results/browser-language-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("link", {
      name: "Une lumière pour les soirs de lecture",
      exact: true,
    })
    .click();
  await page.getByLabel("Votre petit nom (facultatif)").fill("Mamie");
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.getByLabel("Your nickname (optional)")).toHaveValue(
    "Mamie",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Want to chip in?" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("French browser gets French server errors before choosing a language", async ({
  page,
  context,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Mot de passe", { exact: true }).fill("wrong-password");
  await page
    .getByRole("button", { name: "Entrer dans mon espace", exact: true })
    .click();
  await expect(page.locator(".login-card .notice.error")).toHaveText(
    "Connexion impossible. Vérifiez le mot de passe.",
  );
  const response = await context.request.get("/s/missing-share", {
    headers: { "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8" },
  });
  expect(response.status()).toBe(404);
  expect(await response.text()).toBe("Ce lien de partage est indisponible.");
});

test("invalid saved preference follows the browser instead of forcing English", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "invalid", url: "http://localhost:3211" },
  ]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByRole("heading", { name: "La Ouichlist de Camille" }),
  ).toBeVisible();
});
