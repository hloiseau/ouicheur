import { test, expect, fixtureDatabase } from "./fixtures";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://localhost:3211",
  headers = { origin };

test("server pages search beyond the first page, recover from edits and revoke cached thumbnails", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  expect(
    (
      await context.request.post("/api/login", {
        headers,
        data: { password: "test-only-password-2026" },
      })
    ).ok(),
  ).toBeTruthy();
  const list = await (
    await context.request.post("/api/admin/lists", {
      headers,
      data: { name: `Grande liste ${info.project.name}`, visibility: "public" },
    })
  ).json();
  const png = await sharp({
    create: { width: 1400, height: 800, channels: 3, background: "#5a507b" },
  })
    .png()
    .toBuffer();
  const upload = await (
    await context.request.post("/api/admin/images", {
      headers,
      data: { base64: png.toString("base64") },
    })
  ).json();
  const image = upload.image;
  expect(image).toMatch(/^\/media\//);
  const db = fixtureDatabase();
  const ids: string[] = [];
  try {
    const add = db.prepare(
      "INSERT INTO gifts(id,title,url,target,currency,list_id,image,visibility,created_at,updated_at) VALUES (?,?,?,1500,'EUR',?,?,'visible','2026-01-01','2026-01-01')",
    );
    db.exec("BEGIN");
    for (let i = 0; i < 60; i++) {
      const id = randomUUID();
      ids.push(id);
      add.run(
        id,
        `Édition paginée ${i}`,
        `https://example.org/pagination/${id}`,
        list.id,
        image,
      );
    }
    db.exec("COMMIT");
  } finally {
    db.close();
  }
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
    await expect(view.locator(".gift-card")).toHaveCount(24);
    await expect(view.locator(".results-count")).toHaveText("60 envies");
    await view.route(
      "**/api/wishes?**",
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Service momentanément indisponible.",
          }),
        }),
      { times: 1 },
    );
    await view
      .getByRole("button", { name: "Afficher plus", exact: true })
      .click();
    await expect(
      view.getByText("Service momentanément indisponible."),
    ).toBeVisible();
    await expect(view.locator(".gift-card")).toHaveCount(24);
    await expect(
      view.getByText("Aucune envie trouvée", { exact: true }),
    ).toHaveCount(0);
    await view
      .getByRole("button", { name: "Réessayer le chargement", exact: true })
      .click();
    await expect(view.locator(".gift-card")).toHaveCount(48);
    const titles = await view.locator(".gift-card h2").allTextContents();
    expect(new Set(titles).size).toBe(48);
    await view
      .getByLabel("Rechercher une envie", { exact: true })
      .fill("edition paginee 59");
    await expect(view.locator(".gift-card")).toHaveCount(1);
    await expect(view.locator(".gift-card h2")).toHaveText(
      "Édition paginée 59",
    );
    await view.getByLabel("Rechercher une envie", { exact: true }).fill("");
    await expect(view.locator(".gift-card")).toHaveCount(24);
    await context.request.post(`/api/admin/gifts/${ids[0]}/purchased`, {
      headers,
      data: { purchased: true },
    });
    await view
      .getByRole("button", { name: "Afficher plus", exact: true })
      .click();
    await expect(
      view.getByText(
        "La liste a changé. Actualisez les résultats pour continuer.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(view.locator(".gift-card")).toHaveCount(24);
    expect((await new AxeBuilder({ page: view }).analyze()).violations).toEqual(
      [],
    );
    await view.screenshot({
      path: `test-results/pagination-${info.project.name}.png`,
      fullPage: true,
    });
    const thumbnail = await guest.request.get(`${image}?w=320`);
    expect(thumbnail.status()).toBe(200);
    expect((await sharp(await thumbnail.body()).metadata()).width).toBe(320);
    expect(thumbnail.headers()["cache-control"]).toContain("no-store");
    expect((await guest.request.get(`${image}?w=999999`)).status()).toBe(404);
    await page.goto(`/lists/${list.id}`);
    await page
      .getByRole("button", { name: "Afficher plus", exact: true })
      .click();
    await expect(page.locator(".gift-card")).toHaveCount(48);
    const last = page.locator(".gift-card").last();
    const title = await last.locator("h2").innerText();
    await last.getByRole("button", { name: "Modifier", exact: true }).click();
    await expect(
      page.getByRole("dialog").getByLabel("Nom de cette envie"),
    ).toHaveValue(title);
    await page.keyboard.press("Escape");
    await context.request.post("/api/admin/lists", {
      headers,
      data: {
        id: list.id,
        name: `Grande liste ${info.project.name}`,
        visibility: "private",
      },
    });
    expect(
      (await guest.request.get(`/api/wishes?list=${list.id}`)).status(),
    ).toBe(404);
    expect((await guest.request.get(`${image}?w=320`)).status()).toBe(404);
  } finally {
    await guest.close();
    await context.request.post("/api/admin/lists", {
      headers,
      data: {
        id: list.id,
        name: `Grande liste ${info.project.name}`,
        visibility: "private",
        archived: true,
      },
    });
  }
});
