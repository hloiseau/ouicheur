import { test, expect } from "./fixtures";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";

const headers = { origin: "http://localhost:3211" };
test("private sharing, image authorization, revocation and reservation management", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  expect(
    (
      await context.request.post("/api/login", {
        headers,
        data: { password: "test-only-password-2026" },
      })
    ).ok(),
  ).toBe(true);
  const post = async (path: string, data: unknown) => {
    const r = await context.request.post(`/api/${path}`, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const { id: list } = await post("admin/lists", {
    name: `Secret ${info.project.name}`,
    visibility: "unlisted",
  });
  const image = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: info.project.name === "mobile" ? "#918af3" : "#317ab6",
    },
  })
    .png()
    .toBuffer();
  const uploaded = await post("admin/images", {
    base64: image.toString("base64"),
  });
  const { id: gift } = await post("admin/gifts", {
    list_id: list,
    url: `https://example.com/secret-${info.project.name}`,
    title: `Private wish ${info.project.name}`,
    target: "30",
    quantity: 2,
    image: uploaded.image,
  });
  const { token } = await post("admin/lists/share", { id: list });
  const guest = await browser.newContext({ baseURL: "http://localhost:3211" });
  try {
    await guest.addCookies([
      { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
    ]);
    const visitor = await guest.newPage();
    for (const path of [`/lists/${list}`, `/cadeaux/${gift}`]) {
      await visitor.goto(path);
      await expect(
        visitor.getByRole("heading", { name: "Cette envie est introuvable." }),
      ).toBeVisible();
      expect(await visitor.content()).not.toContain(
        `Private wish ${info.project.name}`,
      );
    }
    expect((await guest.request.get(uploaded.image)).status()).toBe(404);
    expect(
      (
        await guest.request.post("/api/contributions", {
          headers,
          data: { gift_id: gift, amount: "1" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await guest.request.post("/api/reservations", {
          headers,
          data: { gift_id: gift, quantity: 1 },
        })
      ).status(),
    ).toBe(404);
    expect(await (await guest.request.get("/")).text()).not.toContain(
      `Private wish ${info.project.name}`,
    );
    await visitor.goto(`/s/${token}`);
    await expect(visitor).toHaveURL(new RegExp(`/lists/${list}$`));
    await expect(
      visitor.getByRole("heading", {
        name: `Private wish ${info.project.name}`,
      }),
    ).toBeVisible();
    expect((await guest.request.get(uploaded.image)).status()).toBe(200);
    const imageReply = await guest.request.get(uploaded.image);
    expect(imageReply.headers()["cache-control"]).toContain("no-store");
    await visitor.goto(`/cadeaux/${gift}`);
    await visitor
      .getByRole("button", { name: "Réserver ce cadeau", exact: true })
      .click();
    await expect(
      visitor.getByRole("heading", { name: "Votre réservation" }),
    ).toBeVisible();
    const management = visitor.url();
    await expect(visitor.getByLabel("Lien personnel")).toHaveValue(management);
    await post("admin/lists/share", { id: list, revoke: true });
    expect((await guest.request.get(uploaded.image)).status()).toBe(404);
    const denied = await guest.newPage();
    await denied.goto(`/cadeaux/${gift}`);
    await expect(
      denied.getByRole("heading", { name: "Cette envie est introuvable." }),
    ).toBeVisible();
    expect(await denied.content()).not.toContain(
      `Private wish ${info.project.name}`,
    );
    await denied.close();
    expect((await guest.request.get(`/s/${token}`)).status()).toBe(404);
    // Revoking a list never prevents a donor from releasing their own reservation.
    await visitor
      .getByRole("button", { name: "Annuler la réservation" })
      .click();
    await expect(visitor.getByText(/Annulée/)).toBeVisible();
  } finally {
    await guest.close();
    await post("admin/lists", {
      id: list,
      name: `Secret ${info.project.name}`,
      visibility: "private",
      archived: true,
    });
  }
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Listes et partage", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mes listes et événements" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `test-results/lists-${info.project.name}.png`,
    fullPage: true,
  });
});

test("owner maintenance, protected backup download and authenticated mobile share target", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Mon instance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Santé de l’instance" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Créer une sauvegarde" }).click();
  await expect(page.getByText("Opération terminée.")).toBeVisible();
  const archive = page
    .getByRole("link", { name: "Télécharger", exact: true })
    .first();
  expect(await archive.getAttribute("href")).toMatch(
    /^\/api\/admin\/backups\//,
  );
  const anon = await browser.newContext({ baseURL: "http://localhost:3211" });
  try {
    expect(
      (await anon.request.get((await archive.getAttribute("href"))!)).status(),
    ).toBe(401);
    expect((await anon.request.get("/api/admin/diagnostics")).status()).toBe(
      401,
    );
    // Next.js can stream the loading shell before sending a client redirect.
    const signedOut = await anon.newPage();
    await signedOut.goto("/add?url=https%3A%2F%2Fexample.com%2Fmobile");
    await expect(signedOut).toHaveURL(/\/admin\?add=/);
    await expect(
      signedOut.getByLabel("Password", { exact: true }),
    ).toBeVisible();
    await expect(signedOut.getByRole("dialog")).toHaveCount(0);
  } finally {
    await anon.close();
  }
  const diagnostics = await (
    await context.request.get("/api/admin/diagnostics")
  ).text();
  expect(diagnostics).not.toMatch(
    /password_hash|FictionalTestOnly|Camille|paypal/,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `test-results/operations-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/add?url=https%3A%2F%2Fexample.com%2Fmobile");
  await expect(
    page.getByRole("dialog").getByLabel("Lien du produit", { exact: true }),
  ).toHaveValue("https://example.com/mobile");
  const manifest = await (
    await context.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.share_target.action).toBe("/add");
});
