import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://localhost:3211",
  headers = { origin },
  password = "exchange-browser-test-password";
test("family exchange invitations, one draw and anonymous questions stay scoped to participants", async ({
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
  const users = [];
  for (const letter of ["A", "B", "C"]) {
    const name = `Échange ${letter} ${info.project.name}`,
      invitation = await (
        await context.request.post("/api/admin/family/invite", {
          headers,
          data: {
            name,
            login: `santa-${letter.toLowerCase()}-${info.project.name}`,
            lists: [],
            confirm: true,
          },
        })
      ).json(),
      session = await browser.newContext({ baseURL: origin, locale: "fr-FR" });
    await session.addCookies([
      { name: "ouicheur_locale", value: "fr", url: origin },
    ]);
    expect(
      (
        await session.request.post("/api/invitation/accept", {
          headers,
          data: { token: invitation.token, password, confirmation: password },
        })
      ).status(),
    ).toBe(200);
    users.push({ id: invitation.id, name, session });
  }
  try {
    await page.goto("/exchanges");
    const form = page.locator("details.exchange-create");
    await form.locator("summary").click();
    const name = `Échange familial ${info.project.name}`;
    await form
      .getByRole("textbox", { name: "Nom de l’échange", exact: true })
      .fill(name);
    await form
      .getByLabel("Date de l’échange", { exact: true })
      .fill("2026-12-25");
    await form
      .getByRole("textbox", {
        name: "Budget indicatif par personne",
        exact: true,
      })
      .fill("20");
    for (const u of users)
      await form.getByRole("checkbox", { name: u.name, exact: true }).check();
    await form
      .getByRole("combobox", { name: "Personne qui offre", exact: true })
      .selectOption(users[0].id);
    await form
      .getByRole("combobox", { name: "Personne à exclure", exact: true })
      .selectOption(users[1].id);
    await form
      .getByRole("checkbox", {
        name: "Exclure ce duo dans les deux sens",
        exact: true,
      })
      .uncheck();
    await form
      .getByRole("button", { name: "Ajouter l’exclusion", exact: true })
      .click();
    await form
      .getByRole("checkbox", {
        name: "Proposer les questions anonymes, acceptées séparément par chaque participant",
        exact: true,
      })
      .check();
    await form.screenshot({
      path: `test-results/exchange-create-${info.project.name}.png`,
      scale: "css",
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    page.once("dialog", (d) => d.accept());
    await form
      .getByRole("button", {
        name: "Créer les invitations privées",
        exact: true,
      })
      .click();
    await expect(
      form.getByText(
        "Échange créé. Les invitations sont visibles dans les comptes participants.",
        { exact: true },
      ),
    ).toBeVisible();
    const admin = (
        await (await context.request.get("/api/account/exchanges/admin")).json()
      ).events.find((e: { name: string }) => e.name === name),
      id = admin.id;
    expect(
      (
        await context.request.post("/api/account/exchanges/manage", {
          headers,
          data: { id, action: "draw", confirm: true },
        })
      ).status(),
    ).toBe(409);
    for (const u of users) {
      expect(
        (
          await u.session.request.post("/api/account/exchanges/preferences", {
            headers,
            data: {
              id,
              accepted: true,
              wishes: `Une attention faite main pour ${u.name}`,
              questions_allowed: true,
            },
          })
        ).status(),
      ).toBe(200);
    }
    await page.reload();
    const organizer = page
      .locator("section.exchange-admin")
      .filter({ hasText: name });
    page.once("dialog", (d) => d.accept());
    await organizer
      .getByRole("button", {
        name: "Effectuer le tirage une fois",
        exact: true,
      })
      .click();
    await expect(
      organizer.getByText("Tirage effectué", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await context.request.post("/api/account/exchanges/manage", {
          headers,
          data: { id, action: "draw", confirm: true },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await (await context.request.get("/api/account/exchanges")).json())
        .events,
    ).toHaveLength(0);
    const visitor = await users[0].session.newPage();
    await visitor.goto("/exchanges");
    const own = visitor
      .locator("section.exchange-participant")
      .filter({ hasText: name });
    await own
      .getByRole("button", { name: "Voir mon destinataire", exact: true })
      .click();
    await expect(own.locator(".exchange-recipient")).toHaveText(users[2].name);
    await own.getByText("Questions anonymes", { exact: true }).click();
    await own
      .getByRole("textbox", {
        name: "Question à mon destinataire",
        exact: true,
      })
      .fill("Quelle couleur préfères-tu ?");
    await own
      .getByRole("button", { name: "Poser la question", exact: true })
      .click();
    await expect(
      own
        .getByRole("article")
        .getByText("Quelle couleur préfères-tu ?", { exact: true }),
    ).toBeVisible();
    await own.screenshot({
      path: `test-results/exchange-participant-${info.project.name}.png`,
      scale: "css",
    });
    expect(
      (await new AxeBuilder({ page: visitor }).analyze()).violations,
    ).toEqual([]);
    const recipient = await users[2].session.newPage();
    await recipient.goto("/exchanges");
    const target = recipient
      .locator("section.exchange-participant")
      .filter({ hasText: name });
    await target.getByText("Questions anonymes", { exact: true }).click();
    const incoming = target
      .getByRole("article")
      .filter({ hasText: "Quelle couleur préfères-tu ?" });
    await incoming
      .getByRole("textbox", { name: "Votre réponse anonyme", exact: true })
      .fill("Bleu, merci !");
    await incoming
      .getByRole("button", { name: "Enregistrer la réponse", exact: true })
      .click();
    await expect(incoming.getByText(/Bleu, merci !/)).toBeVisible();
    recipient.once("dialog", (d) => d.accept());
    await incoming
      .getByRole("button", { name: "Signaler et bloquer", exact: true })
      .click();
    await expect(
      target.getByRole("checkbox", {
        name: "Accepter des questions anonymes de la personne qui m’offre un cadeau",
        exact: true,
      }),
    ).not.toBeChecked();
    const calendar = await users[0].session.request.get(
      `/api/account/exchanges/calendar?id=${id}`,
    );
    expect(calendar.status()).toBe(200);
    expect(await calendar.text()).not.toMatch(
      /Échange A|Échange B|Échange C|Une attention/,
    );
    expect(
      (
        await users[1].session.request.get("/api/account/exchanges/admin")
      ).status(),
    ).toBe(401);
    expect(
      (
        await (await context.request.get("/api/account/exchanges/admin")).json()
      ).events.find((e: { id: string }) => e.id === id).reports,
    ).toHaveLength(1);
    await context.request.post("/api/account/exchanges/manage", {
      headers,
      data: { id, action: "cancel", confirm: true },
    });
  } finally {
    for (const u of users) await u.session.close();
  }
});
