import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://localhost:3211";
const headers = { origin };
const password = "test-only-password-2026";
test("manage sessions and rotate passwords without losing the current device", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  const other = await browser.newContext({
    baseURL: origin,
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Firefox/142.0",
  });
  const visitor = await browser.newContext({ baseURL: origin });
  let changed = false;
  try {
    expect((await visitor.request.get("/api/admin/sessions")).status()).toBe(
      401,
    );
    await context.request.post("/api/login", { headers, data: { password } });
    await other.request.post("/api/login", { headers, data: { password } });
    const initial = await (
      await context.request.get("/api/admin/sessions")
    ).json();
    expect(initial[0].current).toBe(true);
    expect(initial[0]).not.toHaveProperty("hash");
    expect(initial[0]).not.toHaveProperty("token");
    expect(
      (
        await context.request.post("/api/admin/sessions/revoke", {
          headers: { origin: "https://attacker.example" },
          data: { id: "others", confirm: true },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post("/api/admin/sessions/revoke", {
          headers,
          data: { id: "others" },
        })
      ).status(),
    ).toBe(400);
    await page.goto("/admin?tab=security");
    await expect(
      page.getByRole("heading", { name: "Accès et sécurité", exact: true }),
    ).toBeVisible();
    const otherCard = page.locator(".session-card").filter({
      has: page.getByRole("heading", {
        name: "Firefox · Windows",
        exact: true,
      }),
    });
    await expect(otherCard).toBeVisible();
    await page.screenshot({
      path: `test-results/sessions-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await otherCard
      .getByRole("button", { name: "Déconnecter cet appareil", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Annuler", exact: true })
      .click();
    expect((await other.request.get("/api/admin")).status()).toBe(200);
    await otherCard
      .getByRole("button", { name: "Déconnecter cet appareil", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmer la déconnexion", exact: true })
      .click();
    await expect(otherCard).toHaveCount(0);
    expect((await other.request.get("/api/admin")).status()).toBe(401);
    expect((await context.request.get("/api/admin")).status()).toBe(200);
    await other.request.post("/api/login", { headers, data: { password } });
    const previous = (await context.cookies()).find(
      (c) => c.name === "wishlister_session",
    )!.value;
    await page
      .getByLabel("Mot de passe actuel", { exact: true })
      .fill(password);
    await page
      .getByLabel("Nouveau mot de passe (12 caractères minimum)", {
        exact: true,
      })
      .fill("new-test-only-password");
    await page
      .getByLabel("Confirmer le nouveau mot de passe", { exact: true })
      .fill("another-test-only-password");
    await page
      .getByRole("button", { name: "Changer mon mot de passe", exact: true })
      .click();
    await expect(
      page.getByText("Les mots de passe ne correspondent pas.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Confirmer le nouveau mot de passe", { exact: true })
      .fill("new-test-only-password");
    await page
      .getByRole("button", { name: "Changer mon mot de passe", exact: true })
      .click();
    await expect(
      page.getByText(
        "Mot de passe modifié. Les autres appareils sont déconnectés ; cette session reste ouverte.",
        { exact: true },
      ),
    ).toBeVisible();
    changed = true;
    expect(
      (await context.cookies()).find((c) => c.name === "wishlister_session")!
        .value,
    ).not.toBe(previous);
    expect((await other.request.get("/api/admin")).status()).toBe(401);
    await expect(page.locator(".session-card")).toHaveCount(1);
    await context.request.post("/api/admin/password", {
      headers,
      data: { current: "new-test-only-password", password },
    });
    changed = false;
    await other.request.post("/api/login", { headers, data: { password } });
    await page.reload();
    await page
      .getByRole("button", {
        name: "Déconnecter les autres appareils",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmer la déconnexion", exact: true })
      .click();
    await expect(page.locator(".session-card")).toHaveCount(1);
    expect((await other.request.get("/api/admin")).status()).toBe(401);
    await page
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(page).toHaveTitle("Ouicheur · Little wishes");
    await expect(
      page.getByRole("heading", { name: "Connected devices", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/sessions-en-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Sign out of this session", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm sign-out", exact: true })
      .click();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    expect((await context.request.get("/api/admin/sessions")).status()).toBe(
      401,
    );
  } finally {
    if (changed)
      await context.request.post("/api/admin/password", {
        headers,
        data: { current: "new-test-only-password", password },
      });
    await other.close();
    await visitor.close();
  }
});
