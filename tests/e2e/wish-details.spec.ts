import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://localhost:3211",
  headers = { origin };
test("free experiences and second-hand variants have clear, accessible screens", async ({
  page,
  context,
  browser,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Ajouter une envie", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Type d’envie", exact: true })
    .selectOption("experience");
  await dialog
    .getByLabel("Nom de cette envie", { exact: true })
    .fill(`Promenade ${info.project.name}`);
  await dialog
    .getByRole("combobox", { name: "Budget", exact: true })
    .selectOption("free");
  await dialog
    .getByLabel("Quand ou comment offrir (facultatif)", { exact: false })
    .fill("Un dimanche au parc");
  await page.screenshot({
    path: `test-results/wish-experience-editor-${info.project.name}.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog
    .getByRole("button", { name: "Enregistrer cette envie", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const data = await (await context.request.get("/api/admin")).json();
  const free = data.gifts.find(
    (g: { title: string }) => g.title === `Promenade ${info.project.name}`,
  );
  expect(free.budget_mode).toBe("free");
  const product = await (
    await context.request.post("/api/admin/gifts", {
      headers,
      data: {
        url: `https://example.com/variant-${info.project.name}`,
        title: `Édition bleue ${info.project.name}`,
        target: "40",
        size: "A5",
        color: "Bleu",
        model: "2026",
        offers: [
          {
            url: "https://example.org/second-hand",
            condition: "used",
            price: 2000,
            shipping: 500,
            currency: "EUR",
            note: "Même édition, couverture usagée",
          },
        ],
      },
    })
  ).json();
  const guest = await browser.newContext({
    baseURL: origin,
    viewport: page.viewportSize(),
  });
  try {
    await guest.addCookies([
      { name: "ouicheur_locale", value: "fr", url: origin },
    ]);
    const view = await guest.newPage();
    await view.goto(`/cadeaux/${free.id}`);
    await expect(
      view.getByText("Sans dépense nécessaire", { exact: true }),
    ).toBeVisible();
    await expect(
      view.getByRole("button", { name: "Réserver ce cadeau", exact: true }),
    ).toBeVisible();
    await view.screenshot({
      path: `test-results/wish-experience-${info.project.name}.png`,
      fullPage: true,
    });
    await view.goto(`/cadeaux/${product.id}`);
    await expect(
      view.getByText("A5 · Bleu · 2026", { exact: true }),
    ).toBeVisible();
    await view
      .getByRole("combobox", { name: "Offre choisie", exact: true })
      .selectOption({ index: 1 });
    await view.screenshot({
      path: `test-results/wish-offers-${info.project.name}.png`,
      fullPage: true,
    });
    expect((await new AxeBuilder({ page: view }).analyze()).violations).toEqual(
      [],
    );
    await view
      .getByRole("button", { name: "Réserver ce cadeau", exact: true })
      .click();
    await expect(
      view.getByText(
        "Caractéristiques conservées au moment de la réservation.",
        { exact: true },
      ),
    ).toBeVisible();
    await guest.addCookies([
      { name: "ouicheur_locale", value: "en", url: origin },
    ]);
    await view.reload();
    await expect(
      view.getByText("Specifications saved at the time of reservation.", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await guest.close();
  }
});
test("a secret suggestion is visible only in its coorganizer workspace and absent from owner exports", async ({
  page,
  context,
  browser,
}, info) => {
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  const list = await (
    await context.request.post("/api/admin/lists", {
      headers,
      data: {
        name: `Secret ideas ${info.project.name}`,
        visibility: "public",
        suggestions_enabled: true,
      },
    })
  ).json();
  const invitation = await (
    await context.request.post("/api/admin/family/invite", {
      headers,
      data: {
        name: "Robin",
        login: `secret-${info.project.name}`,
        lists: [list.id],
        confirm: true,
      },
    })
  ).json();
  const member = await browser.newContext({
    baseURL: origin,
    viewport: page.viewportSize(),
  });
  try {
    const joined = await member.request.post("/api/invitation/accept", {
      headers,
      data: {
        token: invitation.token,
        password: "secret-test-only-password",
        confirmation: "secret-test-only-password",
      },
    });
    expect(joined.ok()).toBeTruthy();
    const configured = await context.request.post(
      "/api/admin/family/coordinator",
      {
        headers,
        data: { list_id: list.id, member_id: invitation.id, confirm: true },
      },
    );
    expect(configured.ok()).toBeTruthy();
    const canary = `SURPRISE_${info.project.name}`;
    const suggestion = await context.request.post("/api/suggestions", {
      headers,
      data: { list_id: list.id, title: canary, recipient_visible: false },
    });
    expect(suggestion.ok()).toBeTruthy();
    expect(
      await (await context.request.get("/api/admin")).text(),
    ).not.toContain(canary);
    await context.request.post("/api/admin/surprises", {
      headers,
      data: { reveal: true, confirm: true },
    });
    const exported = await context.request.get("/api/admin/export");
    expect(exported.ok()).toBeTruthy();
    expect(await exported.text()).not.toContain(canary);
    await member.addCookies([
      { name: "ouicheur_locale", value: "fr", url: origin },
    ]);
    const team = await member.newPage();
    await team.goto("/organiser");
    await team
      .locator("summary")
      .filter({ hasText: "Idées secrètes à préparer" })
      .click();
    await expect(
      team.getByRole("heading", { name: canary, exact: true }),
    ).toBeVisible();
    team.on("dialog", (d) => d.accept());
    await team
      .getByRole("button", { name: "Préparer en secret", exact: true })
      .click();
    await team
      .getByLabel("Mes notes privées", { exact: true })
      .fill("Emballer avec un ruban bleu");
    await team.getByLabel("Le cadeau est prêt", { exact: true }).check();
    await team
      .getByRole("button", { name: "Enregistrer la préparation", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await member.request.get("/api/team/secrets")).json())[0]
            .prepared,
      )
      .toBe(1);
    await team.screenshot({
      path: `test-results/secret-preparation-${info.project.name}.png`,
      fullPage: true,
    });
    expect((await new AxeBuilder({ page: team }).analyze()).violations).toEqual(
      [],
    );
    const revoked = await context.request.post("/api/admin/family/access", {
      headers,
      data: { id: invitation.id, action: "disable", confirm: true },
    });
    expect(revoked.ok()).toBeTruthy();
    expect((await member.request.get("/api/team/secrets")).status()).toBe(401);
  } finally {
    await member.close();
  }
});
