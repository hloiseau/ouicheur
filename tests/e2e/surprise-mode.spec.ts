import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { buildInfo } from "../../lib/build-info";

test("surprise mode keeps owner payloads hidden while donors coordinate and the owner can reveal deliberately", async ({
  page,
  context,
  browser,
}, info) => {
  const headers = { origin: "http://localhost:3211" };
  const post = async (path: string, data: unknown) => {
    const r = await context.request.post(`/api/${path}`, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  await post("login", { password: "test-only-password-2026" });
  const name = `Surprise ${info.project.name}`;
  const { id: list } = await post("admin/lists", {
    name,
    visibility: "public",
  });
  const { id: gift } = await post("admin/gifts", {
    list_id: list,
    url: `https://example.com/surprise-${info.project.name}`,
    title: name,
    target: "20",
    quantity: 2,
  });
  const { id: bought } = await post("admin/gifts", {
    list_id: list,
    url: `https://example.com/surprise-bought-${info.project.name}`,
    title: `Secret acheté ${info.project.name}`,
    target: "15",
    purchased: true,
    closed: true,
  });
  const guest = await browser.newContext({ baseURL: "http://localhost:3211" });
  try {
    await guest.addCookies([
      { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
    ]);
    // Enable using the real settings form, not only a test fixture.
    await page.goto("/admin");
    await page
      .getByRole("button", { name: "Listes et partage", exact: true })
      .click();
    await page
      .getByRole("button", { name: `${name} · Publique`, exact: true })
      .click();
    await page.getByLabel("Préserver la surprise sur cette liste").check();
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Révéler pour cette session",
        exact: true,
      }),
    ).toBeVisible();
    const reservation = await guest.request.post("/api/reservations", {
      headers,
      data: { gift_id: gift, quantity: 1 },
    });
    expect(reservation.status()).toBe(201);
    const { token } = await reservation.json();
    expect(
      (
        await guest.request.post(`/api/reservations/${token}`, {
          headers,
          data: { state: "purchased" },
        })
      ).ok(),
    ).toBe(true);

    const data = await (await context.request.get("/api/admin")).json();
    for (const id of [gift, bought]) {
      const row = data.gifts.find((g: { id: string }) => g.id === id);
      expect(row).toMatchObject({
        reserved: null,
        purchased: null,
        closed: null,
        surprise_hidden: true,
      });
    }
    expect(data.audit).toEqual([]);
    await page.goto("/admin?tab=operations#support");
    await expect(
      page.getByRole("textbox", {
        name: "Aperçu des informations techniques",
        exact: true,
      }),
    ).toHaveValue(
      new RegExp(`^Ouicheur: ${buildInfo.version.replaceAll(".", "\\.")}\n`),
    );
    await expect(
      page.getByRole("heading", { name: "Santé de l’instance", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await context.request.post(`/api/admin/gifts/${gift}/purchased`, {
          headers,
          data: { purchased: true },
        })
      ).status(),
    ).toBe(409);
    for (const path of [
      "admin/export",
      "admin/operations",
      "admin/diagnostics",
      "admin/backups/unknown",
      "admin/history?kind=reservations",
      "admin/history?kind=audit",
    ]) {
      const r = await context.request.get(`/api/${path}`);
      expect(r.status(), path).toBe(409);
      expect(await r.json()).toEqual({
        error:
          "Révélez les surprises pour cette session avant d’ouvrir ces informations ou de modifier cette envie.",
      });
    }
    const noConfirm = await context.request.post("/api/admin/surprises", {
      headers,
      data: { reveal: true },
    });
    expect(noConfirm.status()).toBe(400);
    expect(
      (
        await guest.request.post("/api/admin/surprises", {
          headers,
          data: { reveal: true, confirm: true },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await context.request.post(`/api/admin/gifts/${gift}`, {
          headers,
          data: {
            title: "Changed",
            url: "https://example.com/changed",
            target: "20",
          },
        })
      ).status(),
    ).toBe(409);

    await page.goto(`/lists/${list}`);
    await expect(page.locator(".gift-card")).toHaveCount(2);
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(
      page.getByText("1 exemplaire réservé", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Déjà acheté", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Envies réalisées/ }),
    ).toHaveCount(0);
    await page.locator(".wishlist-filters summary").click();
    await expect(page.getByLabel("Encore à offrir uniquement")).toBeDisabled();
    const rsc = await context.request.get(`/lists/${list}?_rsc=surprise`, {
      headers: { RSC: "1" },
    });
    const payload = (await rsc.text()).replaceAll('\\"', '"');
    expect(payload).toContain('"reserved":null');
    expect(payload).toContain('"purchased":null');
    expect(payload).not.toContain('"reserved":1');
    expect(payload).not.toContain('"purchased":1');
    await page.goto("/?preview=1");
    const card = page
      .locator(".gift-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card).toContainText("Surprise préservée");
    await expect(card).not.toContainText(/exemplaires? réservés?/);
    await page.goto(`/cadeaux/${gift}`);
    await expect(
      page.getByRole("button", { name: "Réserver ce cadeau", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Révéler pour cette session",
        exact: true,
      }),
    ).toBeVisible();

    const donor = await guest.newPage();
    await donor.goto(`/lists/${list}`);
    await expect(
      donor.getByText("1 exemplaire réservé", { exact: true }),
    ).toBeVisible();
    await expect(donor.getByText("Déjà acheté", { exact: true })).toBeVisible();
    expect(
      (
        await guest.request.post("/api/reservations", {
          headers,
          data: { gift_id: gift, quantity: 2 },
        })
      ).status(),
    ).toBe(409);
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `test-results/surprise-hidden-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });

    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Révéler pour cette session", exact: true })
      .click();
    expect(
      (await (await context.request.get("/api/admin")).json())
        .surprises_revealed,
    ).toBe(false);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Révéler pour cette session", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Réserver ce cadeau", exact: true }),
    ).toBeVisible();
    const revealed = await (
      await context.request.get("/api/admin/export")
    ).json();
    expect(
      revealed.reservations.find((r: { gift_id: string }) => r.gift_id === gift)
        .quantity,
    ).toBe(1);
    expect(
      revealed.gifts.find((g: { id: string }) => g.id === bought).purchased,
    ).toBe(1);
    await page.goto("/admin");
    await page
      .getByRole("button", { name: "Masquer à nouveau", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Révéler pour cette session",
        exact: true,
      }),
    ).toBeVisible();
    expect((await context.request.get("/api/admin/export")).status()).toBe(409);
    await page
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(
      page.getByRole("button", {
        name: "Reveal for this session",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await post("admin/lists", {
      id: list,
      name,
      visibility: "private",
      archived: true,
      surprise_mode: false,
      confirm_reveal: true,
    });
    await guest.close();
  }
});
