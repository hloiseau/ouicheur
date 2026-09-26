import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("recherche au Japon sur opt-in, copie et désactivation", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page
    .getByRole("link", {
      name: "Une lumière pour les soirs de lecture",
      exact: true,
    })
    .click();
  await expect(page.locator(".japan-search")).toHaveCount(0);

  const login = await context.request.post("/api/login", {
    headers: { origin: "http://localhost:3211" },
    data: { password: "test-only-password-2026" },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Mes envies", exact: true }).click();
  const unrelated = page.locator(".admin-gift-row").filter({
    has: page.getByRole("heading", {
      name: "Une lumière pour les soirs de lecture",
      exact: true,
    }),
  });
  await expect(unrelated.locator(".japan-search")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ajouter une envie", exact: true })
    .click();
  const option = page.getByRole("checkbox", {
    name: "Activer la recherche au Japon avec ChatGPT et Sendico",
  });
  await page.getByText("Plus d’options", { exact: true }).click();
  await expect(option).not.toBeChecked();
  const title = `Une lampe à chiner ${info.project.name}`;
  const url = `https://example.com/japan-search-${info.project.name}`;
  await page.getByLabel("Lien du produit", { exact: true }).fill(url);
  await page.getByLabel("Nom de cette envie").fill(title);
  await page.getByLabel("Pourquoi ce cadeau ?").fill("Une lampe toute douce.");
  await page.getByLabel("Objectif (EUR)", { exact: false }).fill("89");
  await page
    .getByRole("combobox", { name: "Visibilité", exact: true })
    .selectOption("visible");
  await option.check();
  await page.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: title, exact: true }).click();
  const publicUrl = page.url();
  await page.getByText("Chiner au Japon avec ChatGPT", { exact: true }).click();
  const field = page.getByRole("textbox", {
    name: "Prompt de recherche au Japon",
  });
  const prompt = await field.inputValue();
  for (const text of [
    title,
    url,
    "Une lampe toute douce",
    "89,00",
    "EUR",
    "Yahoo! JAPAN Flea Market",
    "Mercari Japon",
    "https://sendico.com",
    "commission Sendico",
    "pays de livraison est la France",
    "Ton accès éventuel à une page ne prouve pas",
    "catalogues et moteurs intégrés à Sendico",
    "pistes non vérifiées",
    "message en anglais prêt à envoyer au support Sendico",
    "sans ouvrir le site bloqué",
    "N’invente aucun lien",
  ]) {
    expect(prompt).toContain(text);
  }
  expect(prompt).not.toContain("FictionalTestOnly");
  const copy = page.getByRole("button", {
    name: "Copier le prompt et le lien",
  });
  await copy.click();
  await expect(page.getByRole("status")).toHaveText(
    "Prompt et lien copiés ! Collez-les dans ChatGPT.",
  );
  // Windows normalizes clipboard line endings to CRLF.
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(
      /\r\n/g,
      "\n",
    ),
  ).toBe(prompt);
  const chatgpt = page.getByRole("link", { name: "Ouvrir ChatGPT" });
  await expect(chatgpt).toHaveAttribute("href", "https://chatgpt.com/");
  await expect(chatgpt).toHaveAttribute("target", "_blank");

  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  const englishPrompt = await page
    .getByRole("textbox", { name: "Japan search prompt" })
    .inputValue();
  for (const text of [
    "I am in France",
    "browsing support separately from purchasing support",
    "unverified leads",
    "ready-to-send English message",
    "without opening the blocked site",
  ])
    expect(englishPrompt).toContain(text);
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("fr");
  await expect(field).toHaveValue(prompt);

  // Both denied permission and plain HTTP without a clipboard API stay usable.
  for (const unavailable of ["denied", "missing"]) {
    await page.evaluate((mode) => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value:
          mode === "missing"
            ? undefined
            : {
                writeText: () =>
                  Promise.reject(new DOMException("Denied", "NotAllowedError")),
              },
      });
    }, unavailable);
    await copy.click();
    await expect(page.getByRole("status")).toContainText(
      "Copiez le texte sélectionné",
    );
    await expect(field).toBeFocused();
    expect(
      await field.evaluate((element: HTMLTextAreaElement) =>
        element.value.slice(element.selectionStart, element.selectionEnd),
      ),
    ).toBe(prompt);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  const accessibility = await new AxeBuilder({ page })
    .include(".japan-search")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/japan-search-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Mes envies", exact: true }).click();
  const gift = page.locator(".admin-gift-row").filter({
    has: page.getByRole("heading", {
      name: title,
      exact: true,
    }),
  });
  await gift.getByText("Chiner au Japon avec ChatGPT", { exact: true }).click();
  const adminPrompt = await gift
    .getByRole("textbox", { name: "Prompt de recherche au Japon" })
    .inputValue();
  expect(adminPrompt).toBe(prompt);
  expect(adminPrompt).not.toContain("https://example.com/e2e-0");
  await gift
    .getByRole("button", { name: "Copier le prompt et le lien" })
    .click();
  await expect(gift.getByRole("status")).toHaveText(
    "Prompt et lien copiés ! Collez-les dans ChatGPT.",
  );
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(
      /\r\n/g,
      "\n",
    ),
  ).toBe(adminPrompt);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `test-results/japan-search-admin-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await gift.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.getByText("Plus d’options", { exact: true }).click();
  await expect(option).toBeChecked();
  await option.uncheck();
  await page.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(gift).toBeVisible();
  await expect(gift.locator(".japan-search")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Mes envies", exact: true }).click();
  await expect(gift.locator(".japan-search")).toHaveCount(0);
  await gift.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.getByText("Plus d’options", { exact: true }).click();
  await expect(option).not.toBeChecked();
  await page.goto(publicUrl);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".japan-search")).toHaveCount(0);
});
