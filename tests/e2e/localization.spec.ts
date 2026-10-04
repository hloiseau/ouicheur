import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("English browser, French preference, localized errors and preserved input", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("Ouicheur · Little wishes");
  await expect(
    page.getByRole("heading", { name: "Camille’s Ouichlist" }),
  ).toBeVisible();
  await expect(page.locator(".personal-footer")).toContainText("Ouicheur");
  await expect(
    page.getByRole("link", {
      name: "Une lumière pour les soirs de lecture",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page).toHaveTitle("Ouicheur · Les petites envies");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "La Ouichlist de Camille" }),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: "Une lumière pour les soirs de lecture",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Votre petit nom (facultatif)")
    .fill("Camille & friends");
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(
    page.getByRole("link", { name: "← Camille’s Ouichlist" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your nickname (optional)")).toHaveValue(
    "Camille & friends",
  );
  await expect(
    page.getByRole("heading", { name: "Want to chip in?" }),
  ).toBeVisible();
  await expect(page.locator(".funding-goal")).toContainText("€89.00");
  await page.screenshot({
    path: `test-results/gift-english-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page.goto("/admin");
  await expect(page).toHaveTitle("Owner space · Ouicheur");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".login-card .notice.error")).toHaveText(
    "Unable to sign in. Check your password.",
  );
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-only-password-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My wishes" })).toBeVisible();
  await page.getByRole("button", { name: "Add a wish", exact: true }).click();
  await page
    .getByLabel("Gift name", { exact: true })
    .fill("My untranslated wish");
  // A native modal keeps the rest of the page inert while editing.
  await expect(page.getByRole("dialog")).toContainText("A new wish");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("fr");
  const denied = await context.request.post("/api/admin/extract", {
    headers: { origin: "http://localhost:3211" },
    data: { url: "http://127.0.0.1/private" },
  });
  expect((await denied.json()).error).toBe(
    "Les adresses privées ou réservées sont interdites.",
  );
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await page
    .getByRole("button", { name: "Import a list", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("json");
  await page
    .getByLabel("Content to import")
    .fill(JSON.stringify([{ title: "Keep this title", price: "", url: "" }]));
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import preview" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Missing or invalid product URL: please correct it. Enter a funding goal.",
    ),
  ).toBeVisible();
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
    path: `test-results/admin-english-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page.goto("/a-missing-page");
  await expect(
    page.getByRole("heading", { name: "This wish could not be found." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
