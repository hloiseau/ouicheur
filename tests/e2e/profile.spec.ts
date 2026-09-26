import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import type { Gift } from "../../lib/gifts";

test.use({ actionTimeout: 10000 });

test("profile appearance previews, saves and persists; public collections and favorites work", async ({
  page,
  context,
}, info) => {
  const headers = { origin: "http://localhost:3211" };
  const login = await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  expect(login.status()).toBe(200);
  const initial = await (await context.request.get("/api/admin")).json();
  const original = initial.profile;
  const visibleGifts: Gift[] = initial.gifts.filter(
    (gift: Gift) => gift.visibility === "visible",
  );
  const profileData = { ...original, socials: JSON.parse(original.socials) };
  const png = await sharp({
    create: { width: 1200, height: 500, channels: 3, background: "#27383b" },
  })
    .png()
    .toBuffer();
  try {
    await page.goto("/");
    await page.screenshot({
      path: `test-results/home-default-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    const uploaded = await context.request.post("/api/admin/images", {
      headers,
      data: { base64: png.toString("base64") },
    });
    expect(uploaded.status()).toBe(200);
    const { image } = await uploaded.json();
    const seeded = await context.request.post("/api/admin/profile", {
      headers,
      data: { ...profileData, avatar: image, banner: image },
    });
    expect(seeded.status()).toBe(200);
    await page.goto("/admin");
    await page.getByRole("button", { name: "My profile", exact: true }).click();
    await page
      .getByRole("textbox", { name: "About you", exact: true })
      .fill("A little corner for the things I love.\nMerci d’être là ♡");
    await page.getByRole("button", { name: "Mint", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Gift layout", exact: true })
      .selectOption("comfortable");
    const position = page.getByRole("slider", { name: /^Cover position/ });
    await position.focus();
    await position.press("End");
    await position.press("PageDown");
    await position.press("PageDown");
    const picker = page
      .locator(".image-picker")
      .filter({ has: page.getByText("Background image", { exact: true }) });
    await picker.locator('input[type="file"]').setInputFiles({
      name: "test-background.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(picker.locator(".image-preview img")).toBeVisible();
    await expect(
      page.locator(".profile-live-preview .profile-bio"),
    ).toContainText("A little corner");
    await expect(
      page.locator(".profile-live-preview .profile-banner"),
    ).toHaveCSS("object-position", "50% 80%");
    expect(
      await page
        .locator(".profile-preview-page")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--profile-color").trim(),
        ),
    ).toBe("#45e6cf");
    const editorAudit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(editorAudit.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/profile-editor-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    await page
      .getByRole("button", { name: "Save my profile", exact: true })
      .click();
    await expect(
      page.getByText("Your profile has been saved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "My profile", exact: true }).click();
    await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue(
      "#45e6cf",
    );
    await expect(
      page.getByRole("slider", { name: /^Cover position/ }),
    ).toHaveValue("80");
    await expect(
      page.getByRole("combobox", { name: "Gift layout", exact: true }),
    ).toHaveValue("comfortable");
    await page.goto("/");
    await expect(page.locator(".personal-page")).toHaveAttribute(
      "data-layout",
      "comfortable",
    );
    // A full-page background must leave the language selector clickable.
    await page
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("fr");
    await expect(
      page.getByRole("heading", { name: "La Ouichlist de Camille" }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(page.locator(".profile-banner")).toHaveCSS(
      "object-position",
      "50% 80%",
    );
    await expect(page.locator(".profile-backdrop")).toHaveCSS(
      "background-image",
      new RegExp(image.replaceAll("/", "\\/")),
    );
    await page.locator(".wishlist-navigation button").nth(1).click();
    await expect(page.locator(".gift-card")).toHaveCount(
      visibleGifts.filter((gift) => gift.priority === 2).length,
    );
    await page.locator(".wishlist-navigation button").first().click();
    await page.locator(".collection-card").nth(1).click();
    await expect(page.locator(".gift-card")).toHaveCount(1);
    await page
      .getByLabel("Search wishes", { exact: true })
      .fill("no-such-wish-123");
    await expect(
      page.getByRole("heading", { name: "No wishes found" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reset filters", exact: true })
      .click();
    await expect(page.locator(".gift-card")).toHaveCount(visibleGifts.length);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/home-personalized-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    const invalid = await context.request.post("/api/admin/profile", {
      headers,
      data: {
        ...profileData,
        accent: "url(https://invalid.example)",
        background: "https://invalid.example/image.png",
      },
    });
    expect(invalid.status()).toBe(400);
  } finally {
    const restored = await context.request.post("/api/admin/profile", {
      headers,
      data: profileData,
    });
    expect(restored.status()).toBe(200);
  }
});
