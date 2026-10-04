import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { buildInfo } from "../../lib/build-info";
const origin = "http://localhost:3211",
  headers = { origin };

test("technical report is previewed, copied explicitly and does not transmit private instance data", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  const external: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).origin !== origin) external.push(r.url());
  });
  await page.goto("/admin?tab=operations#support");
  const preview = page.getByRole("textbox", {
    name: "Aperçu des informations techniques",
    exact: true,
  });
  await expect(preview).toHaveValue(
    new RegExp(`^Ouicheur: ${buildInfo.version.replaceAll(".", "\\.")}\n`),
  );
  const value = await preview.inputValue();
  expect(value).toMatch(/Commit: (?:local|[a-f0-9]{40})/);
  expect(value).not.toMatch(/Camille|password|token|paypal|https?:\/\//i);
  const link = page.getByRole("link", {
    name: "Préparer un signalement sur GitHub",
    exact: true,
  });
  const target = new URL((await link.getAttribute("href"))!);
  expect(target.searchParams.get("technical")).toBe(value);
  await page
    .getByRole("button", {
      name: "Copier les informations techniques",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Informations copiées.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  expect(external).toEqual([]);
  expect(
    (await new AxeBuilder({ page }).include("#support").analyze()).violations,
  ).toEqual([]);
  await page
    .locator("#support")
    .screenshot({ path: `test-results/support-${info.project.name}.png` });
  const guest = await browser.newContext({ baseURL: origin });
  try {
    expect((await guest.request.get("/api/admin/support")).status()).toBe(401);
  } finally {
    await guest.close();
  }
});
