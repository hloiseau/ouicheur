import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

test("catégories illustrées et ajout en popup depuis les envies", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  const headers = { origin: "http://localhost:3211" };
  expect(
    (
      await context.request.post("/api/login", {
        headers,
        data: { password: "test-only-password-2026" },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Mes envies", exact: true }),
  ).toBeVisible();
  const name = `Évasion ${info.project.name}`;
  await page.getByRole("button", { name: /Nouvelle catégorie/ }).click();
  let dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Nom de la catégorie", { exact: true }),
  ).toBeFocused();
  await dialog.getByLabel("Nom de la catégorie", { exact: true }).fill(name);
  const image = await sharp({
    create: { width: 400, height: 240, channels: 3, background: "#406b78" },
  })
    .png()
    .toBuffer();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "evade.png", mimeType: "image/png", buffer: image });
  await expect(dialog.locator(".image-preview img")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const collection = page
    .locator(".collection-item")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(collection.locator(".collection-card")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const imagePath = await collection.locator("img").getAttribute("src");
  expect(imagePath).toMatch(/^\/media\/[a-f0-9]{64}\.webp$/);
  await expect(page.locator(".gift-card")).toHaveCount(0);

  const add = page.getByRole("button", {
    name: "Ajouter une envie",
    exact: true,
  });
  await add.click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Lien du produit", { exact: true }),
  ).toBeFocused();
  await expect(
    dialog.getByLabel("Visibilité", { exact: true }),
  ).not.toBeVisible();
  await expect(
    dialog
      .getByRole("combobox", { name: "Catégorie", exact: true })
      .locator("option:checked"),
  ).toHaveText(name);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  const title = `Mon escapade ${info.project.name}`;
  await dialog
    .getByLabel("Lien du produit", { exact: true })
    .fill(`https://example.com/escape-${info.project.name}`);
  await dialog.getByLabel("Nom de cette envie").fill(title);
  await dialog.getByLabel("Objectif (EUR)", { exact: false }).fill("49,90");
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "gift.png", mimeType: "image/png", buffer: image });
  await expect(dialog.locator(".image-preview img")).toBeVisible();
  const a11y = await new AxeBuilder({ page })
    .include("dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/add-wish-${info.project.name}.png`,
    scale: "css",
  });
  await dialog.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await collection.locator(".collection-card").click();
  await expect(page.locator(".gift-card")).toHaveCount(1);
  await page.screenshot({
    path: `test-results/categories-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);

  await collection
    .getByRole("button", { name: `Modifier la catégorie ${name}` })
    .click();
  const renamed = `${name} ✦`;
  await dialog.getByLabel("Nom de la catégorie", { exact: true }).fill(renamed);
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .locator(".collection-item")
      .filter({ hasText: renamed })
      .locator("img"),
  ).toHaveAttribute("src", imagePath!);
  await page.goto("/?preview=1");
  await expect(
    page.getByRole("button", { name: "Ajouter une envie", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".collection-item")
      .filter({ hasText: renamed })
      .locator("img"),
  ).toHaveAttribute("src", imagePath!);

  // The signed-in public page exposes the same editor without entering settings.
  await page.goto("/");
  const gift = page
    .locator(".gift-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await gift.getByRole("button", { name: "Modifier", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Catégorie", exact: true })
    .selectOption("");
  await dialog.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(gift.locator(".gift-category")).toHaveCount(0);
  await gift.getByRole("button", { name: "Modifier", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Catégorie", exact: true })
    .selectOption({ label: renamed });
  await dialog.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(gift.locator(".gift-category")).toHaveText(renamed);
  await page
    .getByRole("button", { name: `Modifier la catégorie ${renamed}` })
    .click();
  await dialog.getByText("Supprimer cette catégorie", { exact: true }).click();
  await dialog
    .getByRole("button", { name: "Confirmer la suppression" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Modifier la catégorie ${renamed}` }),
  ).toHaveCount(0);
  await expect(gift).toBeVisible();
  await expect(gift.locator(".gift-category")).toHaveCount(0);
});

test("les actions et les archives restent réservées au propriétaire", async ({
  page,
  context,
  playwright,
}, info) => {
  const headers = { origin: "http://localhost:3211" };
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  const secret = `Private archive ${info.project.name}`;
  expect(
    (
      await context.request.post("/api/admin/gifts", {
        headers,
        data: {
          url: `https://example.com/archive-${info.project.name}`,
          title: secret,
          target: "10",
          visibility: "archived",
        },
      })
    ).ok(),
  ).toBe(true);
  const invalid = await context.request.post("/api/admin/categories", {
    headers,
    data: {
      name: "Invalid image",
      image: "https://elsewhere.example/image.png",
    },
  });
  expect(invalid.status()).toBe(400);
  const visitor = await playwright.request.newContext({
    baseURL: "http://localhost:3211",
  });
  try {
    expect(
      (
        await visitor.post("/api/admin/categories", {
          headers,
          data: { name: "Forbidden" },
        })
      ).status(),
    ).toBe(401);
    expect(await (await visitor.get("/")).text()).not.toContain(secret);
    expect(
      await (await context.request.get("/?preview=1")).text(),
    ).not.toContain(secret);
  } finally {
    await visitor.dispose();
  }
  await page.goto("/");
  await page.getByRole("button", { name: /^Archived/ }).click();
  await expect(page.getByRole("heading", { name: secret })).toBeVisible();
});
