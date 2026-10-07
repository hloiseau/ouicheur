import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("le thème suit l’appareil, respecte le choix manuel et reste lisible", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Thème", exact: true });
  await expect(theme).toHaveValue("system");
  const background = () =>
    page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect.poll(background).toBe("rgb(247, 247, 242)");
  const noScript = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: "dark",
  });
  try {
    await noScript.addCookies([
      { name: "ouicheur_theme", value: "light", url: "http://localhost:3211" },
    ]);
    const firstPaint = await noScript.newPage();
    await firstPaint.goto("http://localhost:3211");
    await expect(firstPaint.locator("body")).toHaveCSS(
      "background-color",
      "rgb(247, 247, 242)",
    );
  } finally {
    await noScript.close();
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(background).toBe("rgb(16, 20, 18)");
  await theme.selectOption("light");
  await expect.poll(background).toBe("rgb(247, 247, 242)");
  await page.reload();
  await expect(theme).toHaveValue("light");
  await expect.poll(background).toBe("rgb(247, 247, 242)");
  for (const choice of ["light", "dark"]) {
    await theme.selectOption(choice);
    for (const path of ["/", "/admin"]) {
      await page.goto(path);
      await expect(theme).toHaveValue(choice);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/theme-${choice}-${path === "/" ? "wishlist" : "login"}-${info.project.name}.png`,
        fullPage: true,
      });
    }
  }
  await theme.selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(background).toBe("rgb(247, 247, 242)");
});
