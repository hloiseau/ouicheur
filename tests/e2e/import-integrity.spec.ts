import { test, expect } from "./fixtures";
import sharp from "sharp";
import type { Page } from "@playwright/test";

async function login(page: Page) {
  await page
    .context()
    .addCookies([
      { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
    ]);
  await page.goto("/admin");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("test-only-password-2026");
  await page.getByRole("button", { name: "Entrer dans mon espace" }).click();
  await expect(
    page.getByRole("button", { name: "Ajouter une envie", exact: true }),
  ).toBeVisible();
}

test("une image importée ne remplace pas les modifications faites pendant son téléchargement", async ({
  page,
}, info) => {
  await login(page);
  await page
    .getByRole("button", { name: "Ajouter une envie", exact: true })
    .click();
  await page
    .getByLabel("Lien du produit", { exact: true })
    .fill(`https://example.com/image-race-${info.project.name}`);
  await page.getByLabel("Nom de cette envie").fill("Avant téléchargement");
  await page.getByLabel("Objectif (EUR)", { exact: false }).fill("20");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/images", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    const requested = page.waitForRequest("**/api/admin/images");
    await page
      .locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]')
      .setInputFiles({
        name: "test.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: { width: 8, height: 8, channels: 3, background: "red" },
        })
          .png()
          .toBuffer(),
      });
    await requested;
    const title = `Modifié pendant le téléchargement ${info.project.name}`;
    await page.getByLabel("Nom de cette envie").fill(title);
    await page.getByLabel("Objectif (EUR)", { exact: false }).fill("75.50");
    release();
    await expect(page.locator(".image-preview img")).toBeVisible();
    await expect(page.getByLabel("Nom de cette envie")).toHaveValue(title);
    await expect(
      page.getByLabel("Objectif (EUR)", { exact: false }),
    ).toHaveValue("75.50");
    await page
      .getByRole("button", { name: "Enregistrer cette envie", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
});

test("le remplacement d’une envie affiche et conserve sa devise d’origine", async ({
  page,
  context,
}, info) => {
  await login(page);
  const data = await (await context.request.get("/api/admin")).json();
  const profile = {
    ...data.profile,
    socials: JSON.parse(data.profile.socials),
  };
  const post = async (path: string, body: unknown) => {
    const response = await context.request.post(`/api/${path}`, {
      headers: { origin: "http://localhost:3211" },
      data: body,
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const title = `Envie USD ${info.project.name}`;
  const url = `https://example.com/import-currency-${info.project.name}`;
  try {
    await post("admin/profile", { ...profile, currency: "USD" });
    await post("admin/gifts", { title, url, target: "65" });
  } finally {
    await post("admin/profile", profile);
  }
  await page
    .getByRole("button", { name: "Importer une liste", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("json");
  await page
    .getByLabel("Contenu à importer")
    .fill(JSON.stringify([{ title, url, price: "65", currency: "USD" }]));
  await page.getByRole("button", { name: "Préparer l’aperçu" }).click();
  const item = page.locator(".import-item").filter({ hasText: title });
  await item.getByRole("checkbox").first().check();
  await item.getByRole("checkbox", { name: /Doublon détecté/ }).check();
  await expect(item.getByLabel("Objectif (USD)", { exact: false })).toHaveValue(
    "65",
  );
  await item.getByLabel("Objectif (USD)", { exact: false }).fill("67.50");
  await page
    .getByRole("button", { name: "Enregistrer 1 envie(s) sélectionnée(s)" })
    .click();
  await expect(
    page.getByText(/Import enregistré. Vos envies sont visibles/),
  ).toBeVisible();
  const updated = await (await context.request.get("/api/admin")).json();
  const gift = updated.gifts.find((g: { url: string }) => g.url === url);
  expect(gift.currency).toBe("USD");
  expect(gift.target).toBe(6750);
});
