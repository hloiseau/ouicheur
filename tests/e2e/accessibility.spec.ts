import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("accessibilité WCAG A/AA des pages principales", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  for (const path of ["/", "/admin"]) {
    await page.goto(path);
    if (path === "/admin")
      await expect(
        page.getByLabel("Mot de passe", { exact: true }),
      ).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await info.attach(`axe-${path === "/" ? "public" : "login"}`, {
      body: JSON.stringify(result.violations, null, 2),
      contentType: "application/json",
    });
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
  await context.request.post("/api/login", {
    headers: { origin: "http://localhost:3211" },
    data: { password: "test-only-password-2026" },
  });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Mes envies" })).toBeVisible();
  const admin = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    admin.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.keyboard.press("Tab");
  expect(await page.locator(":focus").count()).toBe(1);
});
