import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

test("premier démarrage web, code privé, session et verrouillage après redémarrage", async ({
  page,
  context,
}, info) => {
  const origin = "http://localhost:3213";
  const folder = resolve(".local/e2e-setup", randomUUID());
  mkdirSync(folder, { recursive: true });
  let child: ChildProcess | undefined;
  let logs = "";
  async function start() {
    logs = "";
    child = spawn(process.execPath, ["scripts/start.mjs"], {
      env: {
        ...process.env,
        PORT: "3213",
        APP_ORIGIN: origin,
        DATA_DIR: folder,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", (chunk) => {
      logs += String(chunk);
    });
    child.stderr!.on("data", (chunk) => {
      logs += String(chunk);
    });
    await expect
      .poll(
        async () => {
          try {
            return (await context.request.get(`${origin}/api/health`)).status();
          } catch {
            return 0;
          }
        },
        { timeout: 20000 },
      )
      .toBe(200);
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
  try {
    await start();
    const code = logs.match(/Setup code: ([\w-]{32})/)?.[1];
    expect(code).toBeTruthy();
    await page.goto(origin);
    await expect(page).toHaveURL(`${origin}/setup`);
    await page.goto(`${origin}/admin`);
    await expect(page).toHaveURL(`${origin}/setup`);
    await expect(
      page.getByRole("heading", { name: "Your Ouichlist starts here." }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("fr");
    await expect(
      page.getByRole("heading", { name: "Votre Ouichlist commence ici." }),
    ).toBeVisible();
    expect(await page.content()).not.toContain(code!);
    expect((await context.request.get(`${origin}/api/setup`)).status()).toBe(
      405,
    );
    expect((await context.request.get(`${origin}/api/admin`)).status()).toBe(
      401,
    );
    const data = {
      code,
      name: "Alex",
      password: "setup-browser-password",
      confirmation: "setup-browser-password",
      currency: "CHF",
      paypal: "",
    };
    expect(
      (
        await context.request.post(`${origin}/api/setup`, {
          headers: { origin: "https://attacker.example" },
          data,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post(`${origin}/api/setup`, {
          headers: { origin },
          data: { ...data, code: "incorrect" },
        })
      ).status(),
    ).toBe(403);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `test-results/setup-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    await page.getByLabel(/^Code d’installation/).fill(code!);
    await page.getByLabel(/^Votre nom ou pseudonyme/).fill(data.name);
    await page.getByLabel(/^Mot de passe/).fill(data.password);
    await page
      .getByLabel("Confirmer le mot de passe", { exact: true })
      .fill("different-password");
    await page
      .getByRole("combobox", { name: "Devise de la Ouichlist" })
      .selectOption("CHF");
    await page.getByRole("button", { name: "Créer ma Ouichlist" }).click();
    await expect(page.locator(".setup-card").getByRole("alert")).toContainText(
      "Les mots de passe ne correspondent pas",
    );
    await page
      .getByLabel("Confirmer le mot de passe", { exact: true })
      .fill(data.password);
    await page.getByRole("button", { name: "Créer ma Ouichlist" }).click();
    await expect(page).toHaveURL(`${origin}/admin`);
    await expect(
      page.getByRole("heading", { name: "Mes envies" }),
    ).toBeVisible();
    const profile = await (
      await context.request.get(`${origin}/api/admin`)
    ).json();
    expect(profile.profile).toMatchObject({
      name: "Alex",
      currency: "CHF",
      paypal: "",
    });
    const cookie = (await context.cookies(origin)).find(
      (c) => c.name === "wishlister_session",
    )!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
    expect(
      (
        await context.request.post(`${origin}/api/setup`, {
          headers: { origin },
          data,
        })
      ).status(),
    ).toBe(409);
    await stop();
    await start();
    expect(logs).not.toContain("Setup code:");
    await page.goto(`${origin}/setup`);
    await expect(page).toHaveURL(`${origin}/admin`);
    await expect(
      page.getByRole("heading", { name: "Mes envies" }),
    ).toBeVisible();
    expect(
      (
        await context.request.post(`${origin}/api/setup`, {
          headers: { origin },
          data,
        })
      ).status(),
    ).toBe(409);
    await context.clearCookies();
    await page.goto(`${origin}/admin`);
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  } finally {
    await stop();
  }
});
