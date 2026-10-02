import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

// Opt-in visual review on the disposable E2E instance, never an operator's NAS.
test("audit visuel de toutes les pages et des principaux états", async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(
    process.env.UI_AUDIT !== "1",
    "Set UI_AUDIT=1 for the visual inventory.",
  );
  test.setTimeout(180000);
  page.setDefaultTimeout(10000);
  const base = "http://localhost:3211";
  const headers = { origin: base };
  const folder = `test-results/ui-audit-${info.project.name}`;
  mkdirSync(folder, { recursive: true });
  const observations: unknown[] = [];
  const failures: string[] = [];
  const watch = (p: Page) => p.on("pageerror", (e) => failures.push(e.message));
  watch(page);
  const capture = async (p: Page, name: string) => {
    await p.locator("h1,h2,[role=status]").first().waitFor();
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({
      path: `${folder}/${name}-full.png`,
      fullPage: true,
      scale: "css",
    });
    const height = await p.evaluate(
      () => document.documentElement.scrollHeight,
    );
    const viewport = p.viewportSize()!;
    const offsets = [
      ...new Set([
        0,
        Math.max(0, (height - viewport.height) / 2),
        Math.max(0, height - viewport.height),
      ]),
    ];
    for (const [i, y] of offsets.entries()) {
      await p.evaluate(
        (y) => window.scrollTo({ top: y, behavior: "instant" }),
        y,
      );
      await p.screenshot({
        path: `${folder}/${name}-${i + 1}.png`,
        scale: "css",
      });
    }
    const dialog = p.getByRole("dialog").last();
    if (await dialog.isVisible()) {
      await dialog.evaluate((d) => {
        d.scrollTop = d.scrollHeight;
      });
      await p.screenshot({
        path: `${folder}/${name}-dialog-bottom.png`,
        scale: "css",
      });
      await dialog.evaluate((d) => {
        d.scrollTop = 0;
      });
    }
    observations.push({
      name,
      url: new URL(p.url()).pathname,
      locale: await p.locator("html").getAttribute("lang"),
      headings: await p.locator("h1,h2").allTextContents(),
      overflow: await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      screenshots: offsets.length,
    });
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  };
  const post = async (
    path: string,
    data: unknown,
    session: BrowserContext = context,
  ) => {
    const r = await session.request.post(`/api/${path}`, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: base },
  ]);
  await page.goto("/admin");
  await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();
  await capture(page, "01-login-fr");
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await capture(page, "02-login-en");
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("fr");
  await post("login", { password: "test-only-password-2026" });
  const { id: gift } = await post("admin/gifts", {
    title: "Une escapade à deux",
    url: `https://example.com/audit-${info.project.name}`,
    target: "120",
    quantity: 2,
    description: "Un week-end et de beaux souvenirs à partager.",
  });
  const { id: list } = await post("admin/lists", {
    name: `Anniversaire ${info.project.name}`,
    visibility: "unlisted",
    suggestions_enabled: true,
  });
  await post("admin/gifts", {
    title: "Un livre pour les vacances",
    url: `https://example.com/audit-private-${info.project.name}`,
    target: "25",
    list_id: list,
  });
  const share = await post("admin/lists/share", { id: list });
  const guest = await browser.newContext({
    baseURL: base,
    viewport: page.viewportSize()!,
    isMobile: info.project.name === "mobile",
    deviceScaleFactor: 1,
  });
  await guest.addCookies([{ name: "ouicheur_locale", value: "fr", url: base }]);
  const visitor = await guest.newPage();
  visitor.setDefaultTimeout(10000);
  watch(visitor);
  try {
    await visitor.goto("/");
    await capture(visitor, "03-public-home");
    await visitor
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(visitor.locator("html")).toHaveAttribute("lang", "en");
    await capture(visitor, "04-public-home-en");
    await visitor
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("fr");
    await visitor.goto(`/cadeaux/${gift}`);
    await capture(visitor, "05-gift-open");
    await visitor
      .getByRole("button", { name: "Réserver ce cadeau", exact: true })
      .click();
    await expect(
      visitor.getByRole("heading", { name: "Votre réservation" }),
    ).toBeVisible();
    await expect(visitor.getByLabel("Lien personnel")).not.toHaveValue("");
    await capture(visitor, "06-reservation-active");
    await visitor
      .getByRole("button", { name: "J’ai acheté le cadeau", exact: true })
      .click();
    await expect(visitor.getByText(/Acheté/)).toBeVisible();
    await capture(visitor, "07-reservation-purchased");
    await visitor.goto(`/cadeaux/${gift}`);
    await capture(visitor, "08-gift-reserved");
    await visitor.goto("/reservation/missing");
    await expect(visitor.getByRole("alert").first()).toBeVisible();
    await capture(visitor, "09-reservation-missing");
    const admin = await (await context.request.get("/api/admin")).json();
    const funded = admin.gifts.find(
      (g: { funded: number; reserved: number }) => g.funded > 0 && !g.reserved,
    );
    const contribution = await post(
      "contributions",
      { gift_id: funded.id, amount: "5", nickname: "Alex" },
      guest,
    );
    await visitor.goto(`/contribution/${contribution.id}`);
    await expect(
      visitor.getByRole("button", {
        name: "J’ai envoyé l’argent",
        exact: true,
      }),
    ).toBeVisible();
    await capture(visitor, "10-contribution-intent");
    await post(`contributions/${contribution.id}/declare`, {}, guest);
    await visitor.reload();
    await capture(visitor, "11-contribution-declared");
    await visitor.goto("/contribution/missing");
    await expect(visitor.getByRole("alert").first()).toBeVisible();
    await expect(
      visitor.getByText("Contribution introuvable.", { exact: true }),
    ).toBeVisible();
    await capture(visitor, "12-contribution-missing");
    await visitor.goto(`/s/${share.token}`);
    await expect(visitor).toHaveURL(new RegExp(`/lists/${list}$`));
    await capture(visitor, "13-shared-list");
    await visitor
      .getByRole("button", { name: "Proposer une idée", exact: true })
      .click();
    await capture(visitor, "14-suggestion-form");
    await visitor.getByRole("button", { name: "Fermer", exact: true }).click();
    const suggestion = await post(
      "suggestions",
      {
        list_id: list,
        title: "Un atelier de poterie",
        nickname: "Alex",
        message: "Pour un samedi créatif ensemble.",
        recipient_visible: true,
      },
      guest,
    );
    await visitor.goto(`/suggestions#${suggestion.token}`);
    await expect(
      visitor.getByRole("heading", { name: "Un atelier de poterie" }),
    ).toBeVisible();
    await capture(visitor, "15-suggestion-tracker");
    await visitor.goto("/suggestions");
    await capture(visitor, "16-suggestion-no-link");
    await visitor.goto("/page-inconnue");
    await capture(visitor, "17-not-found");
    await post("admin/lists/share", { id: list, revoke: true });
    await visitor.goto(`/lists/${list}`);
    await capture(visitor, "18-private-access-denied");
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Mes envies", exact: true }),
    ).toBeVisible();
    await capture(page, "19-owner-home");
    await page
      .getByRole("button", { name: "Ajouter une envie", exact: true })
      .click();
    await capture(page, "20-add-wish");
    await page.locator("summary").filter({ hasText: "Plus d’options" }).click();
    await capture(page, "20b-wish-options");
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await page
      .getByRole("button", { name: "Nouvelle catégorie", exact: false })
      .click();
    await capture(page, "21-category-editor");
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    for (const [name, label] of [
      ["21b-reservations", "Réservations"],
      ["22-payments", "Contributions"],
      ["23-imports", "Importer une liste"],
      ["24-lists", "Listes et partage"],
      ["25-suggestions", "Suggestions"],
      ["26-history", "Historique"],
      ["27-operations", "Mon instance"],
      ["28-profile", "Mon profil"],
    ]) {
      await page
        .locator(".owner-nav button")
        .filter({ hasText: label })
        .click();
      await expect(
        page.getByRole("heading", { name: label, exact: true }),
      ).toBeVisible();
      // Async panels are finished before capture.
      if (label === "Mon instance")
        await expect(
          page.getByRole("heading", { name: "Santé de l’instance" }),
        ).toBeVisible();
      if (label === "Suggestions")
        await expect(
          page.getByRole("heading", { name: "Un atelier de poterie" }).first(),
        ).toBeVisible();
      await capture(page, name);
      if (label === "Importer une liste") {
        await page
          .getByRole("combobox", { name: "Source", exact: true })
          .selectOption("json");
        await page
          .getByLabel("Contenu à importer")
          .fill(
            JSON.stringify([
              {
                title: "Une idée importée",
                url: `https://example.com/import-audit-${info.project.name}`,
                price: "18.00",
                currency: "EUR",
              },
            ]),
          );
        await page
          .getByRole("button", { name: "Préparer l’aperçu", exact: true })
          .click();
        await expect(
          page.getByRole("heading", {
            name: "Aperçu de l’import",
            exact: true,
          }),
        ).toBeVisible();
        await capture(page, "23b-import-preview");
      }
      if (label === "Listes et partage") {
        await page.getByRole("button", { name: /Ma Ouichlist ·/ }).click();
        await page
          .getByRole("button", { name: "QR code", exact: true })
          .click();
        await expect(
          page.getByRole("img", { name: "QR code du lien de partage" }),
        ).toBeVisible();
        await capture(page, "24b-list-sharing");
      }
      if (label === "Historique") {
        await page
          .getByRole("combobox", { name: "Historique", exact: true })
          .selectOption("reservations");
        await expect(
          page
            .getByRole("button", {
              name: "Annuler la réservation",
              exact: true,
            })
            .first(),
        ).toBeVisible();
        await capture(page, "26b-reservation-history");
      }
    }
    await page.getByRole("button", { name: "Journal", exact: true }).click();
    await capture(page, "29-audit-log");
    await page.goto("/add?url=https%3A%2F%2Fexample.com%2Fshared");
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture(page, "30-quick-add");
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.goto(`/lists/${list}`);
    await capture(page, "31-owner-private-list");
    await post("admin/lists", {
      id: list,
      name: `Anniversaire ${info.project.name}`,
      visibility: "unlisted",
      surprise_mode: true,
      suggestions_enabled: true,
    });
    await page.goto("/admin");
    await expect(
      page.getByText("Surprise préservée", { exact: true }).first(),
    ).toBeVisible();
    await capture(page, "32-surprise-hidden");
    await post("admin/lists", {
      id: list,
      name: `Anniversaire ${info.project.name}`,
      visibility: "unlisted",
      surprise_mode: false,
      confirm_reveal: true,
      suggestions_enabled: true,
    });
    const origin = "http://localhost:3213";
    const setupFolder = resolve(".local/e2e-setup", randomUUID());
    mkdirSync(setupFolder, { recursive: true });
    const setup = spawn(process.execPath, ["scripts/start.mjs"], {
      env: {
        ...process.env,
        PORT: "3213",
        APP_ORIGIN: origin,
        DATA_DIR: setupFolder,
      },
      stdio: "ignore",
    });
    try {
      await expect
        .poll(async () => {
          try {
            return (await context.request.get(`${origin}/api/health`)).status();
          } catch {
            return 0;
          }
        })
        .toBe(200);
      await visitor.goto(`${origin}/setup`);
      await expect(
        visitor.getByRole("heading", { name: "Votre Ouichlist commence ici." }),
      ).toBeVisible();
      await capture(visitor, "33-setup");
    } finally {
      const exited = once(setup, "exit");
      setup.kill();
      await exited;
    }
  } finally {
    writeFileSync(
      `${folder}/observations.json`,
      JSON.stringify({ observations, failures }, null, 2),
    );
    await guest.close();
  }
});
