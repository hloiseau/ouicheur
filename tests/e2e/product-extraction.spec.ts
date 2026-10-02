import { test, expect } from "./fixtures";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";

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
      page.getByRole("button", {
        name: "Enregistrer cette envie",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Enregistrement…", exact: true }),
    ).toHaveCount(0);
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

test("la lecture lente conserve les champs déjà remplis et les saisies pendant la requête", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  await context.request.post("/api/login", {
    headers: { origin: "http://localhost:3211" },
    data: { password: "test-only-password-2026" },
  });
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Ajouter une envie", exact: true })
    .click();
  const url = "https://shop.example/slow-details";
  await page.getByLabel("Lien du produit").fill(url);
  await page.getByLabel("Nom de cette envie").fill("Mon choix personnel");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/extract", async (route) => {
    await pending;
    await route.fulfill({
      json: {
        url,
        title: "Titre de la boutique",
        description: "Description de la boutique",
        price: 2990,
        currency: "EUR",
        image_url: "",
        extracted_at: "2026-10-02T10:00:00Z",
      },
    });
  });
  try {
    const requested = page.waitForRequest("**/api/admin/extract");
    await page
      .getByRole("button", { name: "Récupérer les informations", exact: true })
      .click();
    await requested;
    await expect(
      page.getByRole("button", { name: "Lecture…", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Enregistrer cette envie",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Enregistrement…", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Lien du produit")).toHaveJSProperty(
      "readOnly",
      true,
    );
    await page.getByText("Plus d’options", { exact: true }).click();
    await page
      .getByLabel("Pourquoi ce cadeau ?")
      .fill("Mes précisions personnelles");
    await page.getByLabel("Objectif (EUR)", { exact: false }).fill("35.50");
    release();
    await expect(page.getByText(/Aperçu récupéré le/)).toBeVisible();
    await expect(page.getByLabel("Nom de cette envie")).toHaveValue(
      "Mon choix personnel",
    );
    await expect(page.getByLabel("Pourquoi ce cadeau ?")).toHaveValue(
      "Mes précisions personnelles",
    );
    await expect(
      page.getByLabel("Objectif (EUR)", { exact: false }),
    ).toHaveValue("35.50");
    await expect(page.getByLabel("Lien du produit")).toHaveJSProperty(
      "readOnly",
      false,
    );
  } finally {
    release();
  }
});

test("un refus marchand permet de terminer l’ajout manuellement en français et en anglais", async ({
  page,
  context,
}, info) => {
  const fr = info.project.name === "mobile";
  await context.addCookies([
    {
      name: "ouicheur_locale",
      value: fr ? "fr" : "en",
      url: "http://localhost:3211",
    },
  ]);
  await context.request.post("/api/login", {
    headers: { origin: "http://localhost:3211" },
    data: { password: "test-only-password-2026" },
  });
  await page.goto("/admin");
  await page
    .getByRole("button", {
      name: fr ? "Ajouter une envie" : "Add a wish",
      exact: true,
    })
    .click();
  const url = `https://www.amiami.com/eng/detail/?scode=${fr ? "FIGURE-055581-R235" : "FIGURE-055579-R207"}`;
  const link = page.getByLabel(fr ? "Lien du produit" : "Product link");
  const read = page.getByRole("button", {
    name: fr ? "Récupérer les informations" : "Get product details",
    exact: true,
  });
  let requests = 0;
  await page.route("**/api/admin/extract", (route) => {
    requests++;
    return route.fulfill({ status: 400, json: { error: "HTTP 406" } });
  });
  await link.fill("lien-invalide");
  await read.click();
  expect(requests).toBe(0);
  expect(
    await link.evaluate((el) => (el as HTMLInputElement).validity.valid),
  ).toBe(false);
  await link.fill(url);
  await read.click();
  const manual = page.getByRole("button", {
    name: fr ? "Compléter manuellement" : "Fill in manually",
    exact: true,
  });
  await expect(manual).toBeVisible();
  await expect(link).toHaveValue(url);
  await expect(page.getByText("HTTP 406", { exact: true })).toBeHidden();
  await page
    .getByText(fr ? "Détail de l’erreur" : "Error details", { exact: true })
    .click();
  await expect(page.getByText("HTTP 406", { exact: true })).toBeVisible();
  await manual.click();
  const title = page.getByLabel(fr ? "Nom de cette envie" : "Gift name", {
    exact: true,
  });
  await expect(title).toBeFocused();
  await title.fill(`Figurine manuelle ${info.project.name}`);
  await page
    .getByLabel(fr ? "Objectif (EUR)" : "Goal (EUR)", { exact: false })
    .fill("35.50");
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `test-results/add-wish-recovery-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("button", {
      name: fr ? "Enregistrer cette envie" : "Save this wish",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Figurine manuelle ${info.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
  const data = await (await context.request.get("/api/admin")).json();
  const gift = data.gifts.find((g: { url: string }) => g.url === url);
  expect(gift.target).toBe(3550);
  expect(gift.title).toBe(`Figurine manuelle ${info.project.name}`);
  expect(requests).toBe(1);
});
