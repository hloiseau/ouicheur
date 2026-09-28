import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("a guest filters a shared list by per-item budget, remaining funding and availability", async ({
  page,
  context,
  browser,
}, info) => {
  const headers = { origin: "http://localhost:3211" };
  const post = async (path: string, data: unknown) => {
    const response = await context.request.post(`/api/${path}`, {
      headers,
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  await post("login", { password: "test-only-password-2026" });
  const { id: list } = await post("admin/lists", {
    name: `Budget familial ${info.project.name}`,
    visibility: "unlisted",
  });
  const add = async (key: string, title: string, extra: object = {}) =>
    post("admin/gifts", {
      list_id: list,
      title,
      url: `https://example.com/budget-${info.project.name}-${key}`,
      target: "10",
      ...extra,
    });
  await add("books", "Trio de livres", {
    target: "19.99",
    quantity: 3,
    priority: 2,
  });
  await add("light", "Petite lumière", { target: "5" });
  await add("trip", "Une escapade", { target: "99" });
  await add("bought", "Déjà reçu", { target: "10", purchased: true });
  await add("closed", "Ancienne idée", { target: "11", closed: true });
  const { id: reserved } = await add("reserved", "Puzzle réservé", {
    target: "12",
  });
  await post("reservations", { gift_id: reserved, quantity: 1 });
  const { id: partial } = await add("partial", "Deux tasses", {
    target: "14",
    quantity: 2,
  });
  await post("reservations", { gift_id: partial, quantity: 1 });
  const { id: funded } = await add("funded", "Cadeau collectif", {
    target: "40",
  });
  const { id: contribution } = await post("contributions", {
    gift_id: funded,
    amount: "35",
  });
  await post(`contributions/${contribution}/declare`, {});
  await post("admin/contributions/review", {
    id: contribution,
    approved: true,
  });
  const { token } = await post("admin/lists/share", { id: list });
  const guest = await browser.newContext({
    baseURL: "http://localhost:3211",
    viewport: page.viewportSize(),
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
    deviceScaleFactor: info.project.use.deviceScaleFactor,
    userAgent: info.project.use.userAgent,
  });
  try {
    await guest.addCookies([
      { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
    ]);
    const visitor = await guest.newPage();
    await visitor.goto(`/s/${token}`);
    await expect(visitor.locator(".gift-card")).toHaveCount(8);
    await visitor.getByText("Budget et disponibilité", { exact: true }).click();
    const controls = visitor.locator(".wishlist-filters");
    await controls.getByLabel("Budget maximum", { exact: true }).fill("19,99");
    await expect(controls.getByLabel("Devise du budget")).toHaveValue("EUR");
    await controls.getByLabel("Encore à offrir uniquement").check();
    await expect(visitor.locator(".gift-card")).toHaveCount(3);
    await expect(
      visitor.getByRole("heading", { name: "Trio de livres" }),
    ).toBeVisible();
    await expect(
      visitor.getByRole("heading", { name: "Deux tasses" }),
    ).toBeVisible();
    await expect(
      visitor.getByRole("heading", { name: "Puzzle réservé" }),
    ).toHaveCount(0);
    await controls.getByLabel("Budget minimum", { exact: true }).fill("19.99");
    await expect(visitor.locator(".gift-card")).toHaveCount(1);
    await controls.getByLabel("Comparer le budget avec").selectOption("total");
    await expect(visitor.locator(".gift-card")).toHaveCount(0);
    await controls.getByLabel("Budget maximum", { exact: true }).fill("19.98");
    await expect(controls.getByRole("alert")).toContainText("minimum");
    await controls.getByLabel("Budget maximum", { exact: true }).fill("19.999");
    await expect(controls.getByRole("alert")).toContainText("Budget invalide");
    await controls
      .getByRole("button", { name: "Réinitialiser les filtres" })
      .click();
    await expect(visitor.locator(".gift-card")).toHaveCount(8);

    await controls
      .getByLabel("Comparer le budget avec")
      .selectOption("remaining");
    await controls.getByLabel("Budget maximum", { exact: true }).fill("5");
    await controls.getByLabel("Encore à offrir uniquement").check();
    await expect(visitor.locator(".gift-card")).toHaveCount(2);
    await expect(
      visitor.getByRole("heading", { name: "Cadeau collectif" }),
    ).toBeVisible();
    await visitor.getByLabel("Rechercher une envie").fill("LUMIERE");
    await expect(visitor.locator(".gift-card")).toHaveCount(1);
    await expect(
      visitor.getByRole("heading", { name: "Petite lumière" }),
    ).toBeVisible();
    await visitor.getByLabel("Rechercher une envie").fill("");
    await visitor
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(
      controls.getByLabel("Maximum budget", { exact: true }),
    ).toHaveValue("5");
    await expect(controls.getByLabel("Compare budget with")).toHaveValue(
      "remaining",
    );
    await expect(visitor.locator(".gift-card")).toHaveCount(2);
    await visitor
      .getByLabel("Sort by", { exact: false })
      .selectOption("unit-price");
    await expect(visitor.locator(".gift-card h2")).toHaveText([
      "Petite lumière",
      "Cadeau collectif",
    ]);
    expect(
      (
        await new AxeBuilder({ page: visitor })
          .include(".wishlist-section")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await visitor.screenshot({
      path: `test-results/budget-${info.project.name}.png`,
      fullPage: true,
    });

    await page.goto("/admin");
    await page
      .getByRole("combobox", { name: "Liste", exact: true })
      .selectOption(list);
    await expect(
      page.getByRole("button", { name: /Ma Ouichlist\s*8/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Coups de cœur\s*1/ }),
    ).toBeVisible();
  } finally {
    await guest.close();
  }
});
