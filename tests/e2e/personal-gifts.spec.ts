import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://localhost:3211",
  headers = { origin };
test("personal gift tracking keeps reservations and received journals separate", async ({
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
  const title = `Journal cadeau ${info.project.name}`;
  const list = await (
    await context.request.post("/api/admin/lists", {
      headers,
      data: { name: title, visibility: "public" },
    })
  ).json();
  const gift = await (
    await context.request.post("/api/admin/gifts", {
      headers,
      data: {
        title,
        url: `https://example.org/tracking-${info.project.name}`,
        target: "12",
        list_id: list.id,
      },
    })
  ).json();
  const guest = await browser.newContext({ baseURL: origin });
  try {
    const reservation = await (
      await guest.request.post("/api/reservations", {
        headers,
        data: { gift_id: gift.id, quantity: 1 },
      })
    ).json();
    await page.goto(`/reservation/${reservation.token}`);
    await page
      .locator("details")
      .getByText("Retrouver cette réservation dans mon compte", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Rattacher à mon compte", exact: true })
      .click();
    await expect(
      page.getByText("Réservation rattachée.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Ouvrir mon suivi", exact: true })
      .click();
    const row = page.getByRole("article").filter({ hasText: title });
    await expect(row).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await row
      .getByRole("button", { name: "Acheté ou prêt à offrir", exact: true })
      .click();
    await expect(
      row.getByText(/Acheté ou prêt, déclaré par vous/),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/donor-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await context.request.post("/api/admin/lists", {
      headers,
      data: { id: list.id, name: title, visibility: "private" },
    });
    page.once("dialog", (d) => d.accept());
    await row
      .getByRole("button", { name: "Annuler mon engagement", exact: true })
      .click();
    await expect(
      row.getByRole("button", { name: "Annuler mon engagement", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Reçus et remerciements", exact: true })
      .click();
    await page
      .getByRole("textbox", {
        name: "Rechercher dans mes cadeaux reçus",
        exact: true,
      })
      .fill(title);
    await page.getByRole("button", { name: "Rechercher", exact: true }).click();
    const journal = page.locator("details").filter({ hasText: title });
    await journal.locator("summary").click();
    await journal
      .getByRole("switch", { name: "J’ai reçu ce cadeau", exact: true })
      .check();
    await journal
      .getByLabel("Date de réception, facultative", { exact: true })
      .fill("2026-10-03");
    await journal
      .getByRole("textbox", { name: "Mon journal privé", exact: true })
      .fill("Un souvenir privé de cette journée");
    await journal
      .getByRole("button", { name: "Proposer un texte", exact: true })
      .click();
    await journal
      .getByRole("button", { name: "Enregistrer mon journal", exact: true })
      .click();
    await expect(
      journal.getByText("Journal enregistré.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/received-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect((await guest.request.get("/api/account/donor")).status()).toBe(401);
    expect((await guest.request.get("/api/account/received")).status()).toBe(
      401,
    );
    const admin = await (await context.request.get("/api/admin")).json();
    expect(JSON.stringify(admin)).not.toContain("Un souvenir privé");
    expect(
      admin.gifts.find((g: { id: string }) => g.id === gift.id).purchased,
    ).toBe(0);
  } finally {
    await guest.close();
  }
});
test("occasion templates require an explicit private creation and remain unavailable to guests", async ({
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
  await page.goto("/admin?tab=lists");
  const form = page.locator("details.list-templates");
  await form.locator("summary").click();
  await form
    .getByRole("combobox", { name: "Type d’occasion", exact: true })
    .selectOption("birth");
  const name = `Naissance exemple ${info.project.name}`;
  await form
    .getByRole("textbox", { name: "Nom de la liste", exact: true })
    .fill(name);
  await page.screenshot({
    path: `test-results/template-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await form
    .getByRole("button", { name: "Créer le brouillon privé", exact: true })
    .click();
  await expect(
    form.getByText("Brouillon créé. Retrouvez-le dans vos listes.", {
      exact: true,
    }),
  ).toBeVisible();
  const data = await (await context.request.get("/api/admin")).json(),
    list = data.lists.find((l: { name: string }) => l.name === name);
  expect(list.visibility).toBe("private");
  const examples = data.gifts.filter(
    (g: { list_id: string }) => g.list_id === list.id,
  );
  expect(examples).toHaveLength(3);
  const guest = await browser.newContext({ baseURL: origin });
  try {
    expect((await guest.request.get(`/lists/${list.id}`)).status()).toBe(404);
    expect(
      (await guest.request.get(`/cadeaux/${examples[0].id}`)).status(),
    ).toBe(404);
  } finally {
    await guest.close();
  }
});
