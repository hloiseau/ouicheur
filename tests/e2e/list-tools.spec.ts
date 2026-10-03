import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://localhost:3211",
  headers = { origin };

test("list preferences, bulk organization and portable print views respect privacy", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  const list = await (
    await context.request.post("/api/admin/lists", {
      headers,
      data: { name: `Fête ${info.project.name}`, visibility: "public" },
    })
  ).json();
  for (let i = 0; i < 2; i++) {
    expect(
      (
        await context.request.post("/api/admin/gifts", {
          headers,
          data: {
            list_id: list.id,
            title: `Livre ${i}`,
            url: `https://example.org/tools-${info.project.name}-${i}`,
            target: "20",
          },
        })
      ).ok(),
    ).toBeTruthy();
  }
  await page.goto(`/lists/${list.id}`);
  await page
    .locator("summary")
    .filter({ hasText: "Mes préférences cadeaux" })
    .click();
  await page
    .getByLabel("Préférence : Centres d’intérêt", { exact: true })
    .fill("Jardinage");
  await page
    .getByRole("combobox", {
      name: "Visibilité : Centres d’intérêt",
      exact: true,
    })
    .selectOption("shared");
  await page
    .getByLabel("Préférence : Tailles (facultatif)", { exact: true })
    .fill("PRIVATE_SIZE_CANARY");
  const prefs = page.locator("details").filter({
    has: page.locator("summary").filter({ hasText: "Mes préférences cadeaux" }),
  });
  await prefs.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Préférences enregistrées.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/list-preferences-${info.project.name}.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await prefs.locator("summary").click();
  const bulk = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "Organiser plusieurs envies" }),
  });
  await bulk.locator("summary").click();
  await bulk
    .getByRole("button", { name: "Monter Livre 1", exact: true })
    .click();
  await expect(
    page.getByText(
      "Ordre enregistré. Choisissez le tri manuel pour le retrouver sur la liste.",
      { exact: true },
    ),
  ).toBeVisible();
  await bulk
    .getByRole("button", { name: "Tout sélectionner", exact: true })
    .click();
  await expect(
    bulk.getByText("2 envies sélectionnées", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/list-organizer-${info.project.name}.png`,
    fullPage: true,
  });
  const guest = await browser.newContext({
    baseURL: origin,
    viewport: page.viewportSize(),
  });
  try {
    await guest.addCookies([
      { name: "ouicheur_locale", value: "fr", url: origin },
    ]);
    const view = await guest.newPage();
    await view.goto(`/lists/${list.id}`);
    await expect(view.getByText("Jardinage", { exact: true })).toBeVisible();
    expect(await view.content()).not.toContain("PRIVATE_SIZE_CANARY");
    const exported = await guest.request.get(
      `/api/lists/${list.id}/export?format=json`,
    );
    expect(exported.ok()).toBeTruthy();
    expect((await exported.json()).gifts).toHaveLength(2);
    await view
      .getByRole("link", { name: "Imprimer cette liste", exact: true })
      .click();
    await expect(
      view.getByRole("heading", { name: "Livre 0", exact: true }),
    ).toBeVisible();
    await view
      .getByRole("button", { name: "Ajouter un QR code", exact: true })
      .click();
    await expect(
      view.getByRole("img", {
        name: "QR code du lien de partage",
        exact: true,
      }),
    ).toBeVisible();
    await view.emulateMedia({ media: "print" });
    await view.screenshot({
      path: `test-results/list-print-${info.project.name}.png`,
      fullPage: true,
    });
    expect((await new AxeBuilder({ page: view }).analyze()).violations).toEqual(
      [],
    );
    expect(await view.content()).not.toContain("PRIVATE_SIZE_CANARY");
  } finally {
    await guest.close();
  }
  page.on("dialog", (d) => d.accept());
  await bulk
    .getByRole("button", { name: "Appliquer à la sélection", exact: true })
    .click();
  await expect(
    page.getByText("2 envies mises à jour.", { exact: true }),
  ).toBeVisible();
});

test("the browser bookmark opens an authenticated preview without saving a wish", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  await page.goto("/help");
  const bookmark = page.getByRole("textbox", {
    name: "Adresse du favori",
    exact: true,
  });
  await expect(bookmark).toHaveValue(/^javascript:/);
  const code = await bookmark.inputValue();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const before = (await (await context.request.get("/api/admin")).json()).gifts
    .length;
  await page.goto(
    "/add?url=https%3A%2F%2Fexample.org%2Fbook&title=Une%20bonne%20id%C3%A9e",
  );
  await expect(
    page.getByRole("dialog").getByLabel("Nom de cette envie", { exact: true }),
  ).toHaveValue("Une bonne idée");
  expect(
    (await (await context.request.get("/api/admin")).json()).gifts.length,
  ).toBe(before);
  await page.screenshot({
    path: `test-results/bookmark-preview-${info.project.name}.png`,
    fullPage: true,
  });
});
