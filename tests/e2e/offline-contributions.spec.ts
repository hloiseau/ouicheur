import AxeBuilder from "@axe-core/playwright";
import { test, expect, fixtureDatabase } from "./fixtures";

const origin = "http://localhost:3211";
const headers = { origin };

test("sans PayPal : promettre, déclarer puis confirmer sans double comptage", async ({
  page,
  context,
  browser,
}, info) => {
  const db = fixtureDatabase();
  const before = db
    .prepare("SELECT paypal,strict_contributions FROM owner")
    .get()!;
  const admin = await browser.newContext({ baseURL: origin });
  try {
    db.exec("UPDATE owner SET paypal='',strict_contributions=0");
    for (const ctx of [context, admin])
      await ctx.addCookies([
        { name: "ouicheur_locale", value: "fr", url: origin },
      ]);
    expect(
      (
        await admin.request.post("/api/login", {
          headers,
          data: { password: "test-only-password-2026" },
        })
      ).status(),
    ).toBe(200);
    const created = await admin.request.post("/api/admin/gifts", {
      headers,
      data: {
        title: `Promesse ${info.project.name}`,
        url: `https://example.com/pledge-${info.project.name}`,
        target: "100",
      },
    });
    expect(created.status()).toBe(200);
    const { id: gift } = await created.json();
    await page.goto(`/cadeaux/${gift}`);
    const method = page.getByRole("combobox", {
      name: "Comment souhaitez-vous participer ?",
    });
    await expect(method).toHaveValue("pledge");
    await expect(method.locator("option")).toHaveText([
      "J’ai fait un virement",
      "Je participerai plus tard",
    ]);
    await page.getByLabel("Votre contribution (EUR)").fill("25,50");
    await page
      .getByLabel("Votre petit nom (facultatif)")
      .fill(`Donateur promesse ${info.project.name}`);
    await page
      .getByLabel("Un mot qui fait sourire (facultatif)")
      .fill("Message privé test");
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/offline-form-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    await page.getByRole("button", { name: "Enregistrer ma promesse" }).click();
    await expect(page).toHaveURL(/\/contribution\/[a-f0-9]{64}$/);
    const tracking = page.url();
    const id = tracking.split("/").at(-1)!;
    await expect(
      page.getByText("Participation promise", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Aucun argent n’a été envoyé/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Ouvrir PayPal/ })).toHaveCount(
      0,
    );
    expect(context.pages()).toHaveLength(1);
    await page.getByRole("link", { name: "Retour au cadeau" }).click();
    await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
    await expect(page.getByText(/25,50\s€ promis en plus/)).toBeVisible();
    await expect(page.getByText("Message privé test")).toHaveCount(0);
    await page.screenshot({
      path: `test-results/offline-pledge-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    expect(
      (
        await context.request.post("/api/admin/contributions/review", {
          headers,
          data: { id, approved: true },
        })
      ).status(),
    ).toBe(401);
    await page.goto(tracking);
    await page
      .getByRole("button", { name: "J’ai versé ma participation" })
      .click();
    await expect(
      page.getByText("Participation comptabilisée", { exact: true }),
    ).toBeVisible();
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin?tab=payments");
    const row = adminPage
      .locator(".contribution-row")
      .filter({ hasText: `Donateur promesse ${info.project.name}` });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Confirmer la réception" }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole("link", { name: "Retour au cadeau" }).click();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "value",
      "2550",
    );
    await expect(page.getByText(/promis en plus/)).toHaveCount(0);
    expect(
      (await (await context.request.get(`/api/contributions/${id}`)).json())
        .approved,
    ).toBe(1);
  } finally {
    db.prepare("UPDATE owner SET paypal=?,strict_contributions=?").run(
      before.paypal,
      before.strict_contributions,
    );
    db.close();
    await admin.close();
  }
});

test("virement déclaré sans PayPal : plafond, mode strict et validation", async ({
  page,
  context,
  browser,
}, info) => {
  const db = fixtureDatabase();
  const before = db
    .prepare("SELECT paypal,strict_contributions FROM owner")
    .get()!;
  const admin = await browser.newContext({ baseURL: origin });
  try {
    db.exec("UPDATE owner SET paypal='',strict_contributions=1");
    await context.addCookies([
      { name: "ouicheur_locale", value: "fr", url: origin },
    ]);
    await admin.request.post("/api/login", {
      headers,
      data: { password: "test-only-password-2026" },
    });
    const { id: gift } = await (
      await admin.request.post("/api/admin/gifts", {
        headers,
        data: {
          title: `Virement ${info.project.name}`,
          url: `https://example.com/transfer-${info.project.name}`,
          target: "7.95",
        },
      })
    ).json();
    await page.goto(`/cadeaux/${gift}`);
    await page
      .getByRole("combobox", { name: "Comment souhaitez-vous participer ?" })
      .selectOption("bank_transfer");
    const amount = page.getByLabel("Votre contribution (EUR)");
    await amount.fill("8");
    await expect(
      page.getByRole("button", { name: "Déclarer mon virement" }),
    ).toBeDisabled();
    await amount.fill("7,95");
    await page.getByRole("button", { name: "Déclarer mon virement" }).click();
    await expect(
      page.getByText("Votre déclaration attend la validation du propriétaire."),
    ).toBeVisible();
    expect(context.pages()).toHaveLength(1);
    const id = page.url().split("/").at(-1)!;
    const status = await (
      await context.request.get(`/api/contributions/${id}`)
    ).json();
    expect(status).toMatchObject({
      method: "bank_transfer",
      amount: 795,
      state: "declared",
      approved: 0,
      paypal_url: null,
      payment: null,
    });
    await page.getByRole("link", { name: "Retour au cadeau" }).click();
    await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
    expect(
      (
        await admin.request.post("/api/admin/contributions/review", {
          headers,
          data: { id, approved: true },
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.getByRole("progressbar")).toHaveAttribute("value", "795");
    await expect(
      page.getByRole("button", { name: "Déclarer mon virement" }),
    ).toHaveCount(0);
  } finally {
    db.prepare("UPDATE owner SET paypal=?,strict_contributions=?").run(
      before.paypal,
      before.strict_contributions,
    );
    db.close();
    await admin.close();
  }
});

test("promesse annulable et interface anglaise sans redirection de paiement", async ({
  page,
  context,
  browser,
}, info) => {
  const admin = await browser.newContext({ baseURL: origin });
  try {
    await admin.request.post("/api/login", {
      headers,
      data: { password: "test-only-password-2026" },
    });
    const { id: gift } = await (
      await admin.request.post("/api/admin/gifts", {
        headers,
        data: {
          title: `Cancel pledge ${info.project.name}`,
          url: `https://example.com/cancel-pledge-${info.project.name}`,
          target: "100",
        },
      })
    ).json();
    await page.goto(`/cadeaux/${gift}`);
    await page
      .getByRole("combobox", { name: "How would you like to contribute?" })
      .selectOption("pledge");
    await page.getByRole("button", { name: "Save my pledge" }).click();
    await expect(
      page.getByText("Pledged contribution", { exact: true }),
    ).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    expect(
      (
        await context.request.post(`/api/contributions/${id}/cancel`, {
          headers: { origin: "https://attacker.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    await page.getByRole("button", { name: "Cancel my pledge" }).click();
    await expect(
      page.getByText("Pledge cancelled", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "I have sent my contribution" }),
    ).toHaveCount(0);
    expect(
      (
        await context.request.post(`/api/contributions/${id}/declare`, {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(409);
    await page.reload();
    await expect(
      page.getByText("Pledge cancelled", { exact: true }),
    ).toBeVisible();
  } finally {
    await admin.close();
  }
});
