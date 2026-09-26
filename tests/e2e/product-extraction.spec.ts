import { test, expect } from "./fixtures";
import sharp from "sharp";

test("l’extraction importe automatiquement l’image et préserve les modifications en cours", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  await page.goto("/admin");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("test-only-password-2026");
  await page.getByRole("button", { name: "Entrer dans mon espace" }).click();
  await page
    .getByRole("button", { name: "Ajouter une envie", exact: true })
    .click();
  const url = `https://shop.example/automatic-${info.project.name}`;
  await expect(page.locator('option[value="draft"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Importer l’image", exact: true }),
  ).toHaveCount(0);
  const imageUrl = "https://shop.example/product.jpg";
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await page.route("**/api/admin/extract", (route) =>
    route.fulfill({
      json: {
        url,
        title: "Produit extrait",
        description: "Description",
        price: 2990,
        currency: "EUR",
        image_url: imageUrl,
        extracted_at: "2026-09-26T10:00:00Z",
      },
    }),
  );
  let release!: () => void;
  const pendingImage = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/images", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ url: imageUrl });
    await pendingImage;
    // Exercise the real image storage route without depending on a merchant CDN.
    await route.continue({
      postData: JSON.stringify({ base64: png.toString("base64") }),
    });
  });
  try {
    await page.getByLabel("Lien du produit").fill(url);
    const requested = page.waitForRequest("**/api/admin/images");
    await page
      .getByRole("button", { name: "Récupérer les informations", exact: true })
      .click();
    await requested;
    await expect(
      page.getByLabel("Objectif (EUR)", { exact: false }),
    ).toHaveValue("29.90");
    const title = `Mon titre ${info.project.name}`;
    await page.getByLabel("Nom de cette envie").fill(title);
    await page.getByLabel("Objectif (EUR)", { exact: false }).fill("35.50");
    await expect(
      page.getByRole("button", { name: "Enregistrement…", exact: true }),
    ).toBeDisabled();
    release();
    const image = page.locator(".image-preview img");
    await expect(image).toHaveAttribute("src", /^\/media\/[a-f0-9]{64}\.webp$/);
    await expect(image).toBeVisible();
    await expect(page.getByLabel("Nom de cette envie")).toHaveValue(title);
    await expect(
      page.getByLabel("Objectif (EUR)", { exact: false }),
    ).toHaveValue("35.50");
    await page
      .getByRole("button", { name: "Enregistrer cette envie", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const data = await (await context.request.get("/api/admin")).json();
    const gift = data.gifts.find((g: { url: string }) => g.url === url);
    expect(gift.target).toBe(3550);
    expect(gift.visibility).toBe("visible");
    expect(gift.image).toMatch(/^\/media\/[a-f0-9]{64}\.webp$/);
    expect(await (await context.request.get("/")).text()).toContain(
      `/cadeaux/${gift.id}`,
    );

    await page
      .getByRole("button", { name: "Ajouter une envie", exact: true })
      .click();
    await page.unroute("**/api/admin/images");
    await page.route("**/api/admin/images", (route) =>
      route.fulfill({ status: 400, json: { error: "Image indisponible" } }),
    );
    await page.getByLabel("Lien du produit").fill(url);
    await page
      .getByRole("button", { name: "Récupérer les informations", exact: true })
      .click();
    await expect(
      page.getByText(/l’image n’a pas pu être importée/),
    ).toBeVisible();
    await expect(page.getByLabel("Nom de cette envie")).toHaveValue(
      "Produit extrait",
    );
    await expect(
      page.getByLabel("Objectif (EUR)", { exact: false }),
    ).toHaveValue("29.90");
    await expect(
      page.getByRole("button", {
        name: "Enregistrer cette envie",
        exact: true,
      }),
    ).toBeEnabled();
  } finally {
    release();
  }
});
