import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

const origin = "http://localhost:3211";
const headers = { origin };
const password = "family-test-only-password";
test("owner invites a coorganizer, assigns a family profile and prepares a private list together", async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(90000);
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  const listName = `À préparer ${info.project.name}`;
  const list = await (
    await context.request.post("/api/admin/lists", {
      headers,
      data: { name: listName, visibility: "private" },
    })
  ).json();
  const forbidden = await (
    await context.request.post("/api/admin/lists", {
      headers,
      data: {
        name: `Secret autre foyer ${info.project.name}`,
        visibility: "private",
      },
    })
  ).json();
  const privateGift = await (
    await context.request.post("/api/admin/gifts", {
      headers,
      data: {
        url: `https://example.com/secret-${info.project.name}`,
        title: "Envie secrète autre foyer",
        target: "50",
        list_id: forbidden.id,
      },
    })
  ).json();
  await page.goto("/admin?tab=family");
  await page
    .getByRole("button", { name: "Inviter un proche", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nom du proche", { exact: true })
    .fill(`Alex ${info.project.name}`);
  const login = `alex-${info.project.name}`;
  await dialog
    .getByLabel("Identifiant de connexion", { exact: true })
    .fill(login);
  await dialog.getByRole("checkbox", { name: listName, exact: true }).check();
  await dialog
    .getByRole("button", { name: "Créer le lien d’invitation", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const link = await page
    .getByLabel("Lien d’invitation", { exact: true })
    .inputValue();
  expect(new URL(link).hash).toMatch(/^#[a-f0-9]{64}$/);
  await page
    .getByRole("button", { name: "Ajouter un profil", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nom ou surnom", { exact: true })
    .fill(`Léa ${info.project.name}`);
  await page
    .getByRole("dialog")
    .getByLabel("Type de profil", { exact: true })
    .selectOption("child");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const family = await (await context.request.get("/api/admin/family")).json();
  const member = family.members.find(
    (m: { login: string }) => m.login === login,
  );
  const profile = family.profiles.find(
    (p: { name: string }) => p.name === `Léa ${info.project.name}`,
  );
  const assignment = page.locator(".family-assignment").filter({
    has: page.getByRole("combobox", { name: listName, exact: true }),
  });
  await assignment.getByRole("combobox").selectOption(profile.id);
  await assignment
    .getByRole("button", { name: "Enregistrer le destinataire", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (await context.request.get("/api/admin/family")).json()
        ).lists.find((l: { id: string }) => l.id === list.id).profile_id,
    )
    .toBe(profile.id);
  await page
    .getByRole("button", { name: "Masquer le lien", exact: true })
    .click();
  await page.screenshot({
    path: `test-results/family-owner-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const joined = await browser.newContext({
    baseURL: origin,
    viewport: page.viewportSize(),
    isMobile: info.project.name === "mobile",
    hasTouch: info.project.name === "mobile",
  });
  try {
    await joined.addCookies([
      { name: "ouicheur_locale", value: "fr", url: origin },
    ]);
    const visitor = await joined.newPage();
    await visitor.goto(link);
    await expect(
      visitor.getByRole("heading", {
        name: "Rejoindre les préparatifs",
        exact: true,
      }),
    ).toBeVisible();
    await expect(visitor.getByText(login, { exact: true })).toBeVisible();
    await visitor.screenshot({
      path: `test-results/family-invitation-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    expect(
      (await new AxeBuilder({ page: visitor }).analyze()).violations,
    ).toEqual([]);
    await visitor
      .getByLabel("Nouveau mot de passe (12 caractères minimum)", {
        exact: true,
      })
      .fill(password);
    await visitor
      .getByLabel("Confirmer le nouveau mot de passe", { exact: true })
      .fill(password);
    await visitor
      .getByRole("button", { name: "Créer mon accès", exact: true })
      .click();
    await expect(visitor).toHaveURL(`${origin}/organiser`);
    await expect(
      visitor.getByRole("heading", {
        name: "Les listes que je prépare",
        exact: true,
      }),
    ).toBeVisible();
    const own = await (await joined.request.get("/api/team")).json();
    expect(own.lists.map((l: { id: string }) => l.id)).toEqual([list.id]);
    expect(JSON.stringify(own)).not.toContain("Secret autre foyer");
    for (const path of [
      "admin",
      "admin/family",
      "admin/export",
      "admin/operations",
      "admin/sessions",
      "admin/history?kind=contributions",
    ])
      expect((await joined.request.get(`/api/${path}`)).status(), path).toBe(
        401,
      );
    expect(
      (
        await joined.request.post("/api/admin/family/invite", {
          headers,
          data: {
            name: "Escalation",
            login: "escalation",
            lists: [forbidden.id],
            confirm: true,
          },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await joined.request.post(
          `/api/team/gifts/${privateGift.id}/purchased`,
          { headers, data: { purchased: true } },
        )
      ).status(),
    ).toBe(404);
    expect((await joined.request.get(`/lists/${forbidden.id}`)).status()).toBe(
      404,
    );
    expect(
      (
        await joined.request.post("/api/team/gifts", {
          headers: { origin: "https://attacker.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    const ownerSession = (
      await (await context.request.get("/api/admin/sessions")).json()
    )[0];
    expect(
      (
        await joined.request.post("/api/account/sessions/revoke", {
          headers,
          data: { id: ownerSession.id, confirm: true },
        })
      ).status(),
    ).toBe(404);
    expect((await context.request.get("/api/admin")).status()).toBe(200);
    await visitor
      .getByRole("button", { name: "Ajouter une envie", exact: true })
      .click();
    await visitor
      .getByLabel("Lien du produit", { exact: true })
      .fill(`https://example.com/collaborative-${info.project.name}`);
    const title = `Envie préparée ensemble ${info.project.name}`;
    await visitor.getByLabel("Nom de cette envie", { exact: true }).fill(title);
    await visitor.getByLabel("Objectif (EUR)", { exact: false }).fill("20");
    const png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#bd5b67" },
    })
      .png()
      .toBuffer();
    await visitor.locator('input[type="file"]').setInputFiles({
      name: "family.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(visitor.locator(".image-preview img")).toBeVisible();
    await expect
      .poll(async () =>
        visitor
          .locator(".image-preview img")
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await visitor
      .getByRole("button", { name: "Enregistrer cette envie", exact: true })
      .click();
    await expect(visitor.getByRole("dialog")).toHaveCount(0);
    const card = visitor.locator(".team-gift").filter({
      has: visitor.getByRole("heading", { name: title, exact: true }),
    });
    await expect(card).toBeVisible();
    await card.getByRole("switch").click();
    await expect(card.getByRole("switch")).toBeChecked();
    const snapshot = await (await context.request.get("/api/admin")).json();
    expect(
      snapshot.gifts.find((g: { title: string }) => g.title === title)
        .purchased,
    ).toBe(1);
    await visitor.screenshot({
      path: `test-results/family-team-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    expect(
      (await new AxeBuilder({ page: visitor }).analyze()).violations,
    ).toEqual([]);
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await visitor
      .getByRole("button", { name: "Déconnexion", exact: true })
      .click();
    await expect(
      visitor.getByRole("checkbox", {
        name: "Je suis coorganisateur",
        exact: true,
      }),
    ).toBeChecked();
    await visitor
      .getByLabel("Identifiant de connexion", { exact: true })
      .fill(login);
    await visitor.getByLabel("Mot de passe", { exact: true }).fill(password);
    await visitor
      .getByRole("button", { name: "Entrer dans mon espace", exact: false })
      .click();
    await expect(visitor).toHaveURL(`${origin}/organiser`);
    await context.request.post("/api/admin/family/access", {
      headers,
      data: { id: member.id, action: "disable", confirm: true },
    });
    expect((await joined.request.get("/api/team")).status()).toBe(401);
    expect((await joined.request.get("/api/account/sessions")).status()).toBe(
      401,
    );
    expect(
      (
        await joined.request.post("/api/invitation/accept", {
          headers,
          data: {
            token: new URL(link).hash.slice(1),
            password,
            confirmation: password,
          },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await joined.close();
  }
});

test("a recipient account preserves its surprises and can manage only its own sessions", async ({
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
        name: `Surprise ${info.project.name}`,
        visibility: "private",
        surprise_mode: true,
      },
    })
  ).json();
  await context.request.post("/api/admin/gifts", {
    headers,
    data: {
      url: `https://example.com/member-surprise-${info.project.name}`,
      title: "Un cadeau surprise",
      target: "30",
      purchased: true,
      list_id: list.id,
    },
  });
  const invite = await (
    await context.request.post("/api/admin/family/invite", {
      headers,
      data: {
        login: `recipient-${info.project.name}`,
        name: "Camille",
        lists: [list.id],
        confirm: true,
      },
    })
  ).json();
  const profile = await (
    await context.request.post("/api/admin/family/profile", {
      headers,
      data: { name: "Camille", kind: "adult", recipient: invite.id },
    })
  ).json();
  await context.request.post("/api/admin/family/assign", {
    headers,
    data: { list_id: list.id, profile_id: profile.id, confirm: true },
  });
  const member = await browser.newContext({
    baseURL: origin,
    viewport: page.viewportSize(),
    isMobile: info.project.name === "mobile",
    hasTouch: info.project.name === "mobile",
  });
  try {
    await member.addCookies([
      { name: "ouicheur_locale", value: "fr", url: origin },
    ]);
    expect(
      (
        await member.request.post("/api/invitation/accept", {
          headers,
          data: { token: invite.token, password, confirmation: password },
        })
      ).status(),
    ).toBe(200);
    const viewer = await member.newPage();
    await viewer.goto("/organiser");
    await expect(
      viewer.getByText("Surprise préservée", { exact: true }),
    ).toBeVisible();
    await expect(viewer.getByRole("switch")).toHaveCount(0);
    const summary = await (await member.request.get("/api/team")).json();
    expect(summary.gifts[0].purchased).toBeNull();
    expect(summary.gifts[0].reserved).toBeNull();
    expect(
      (
        await member.request.post(
          `/api/team/gifts/${summary.gifts[0].id}/purchased`,
          { headers, data: { purchased: false } },
        )
      ).status(),
    ).toBe(409);
    viewer.once("dialog", (d) => void d.accept());
    await viewer
      .getByRole("button", { name: "Révéler mes surprises", exact: true })
      .click();
    await expect(viewer.getByRole("switch")).toBeChecked();
    await viewer
      .getByRole("button", { name: "Masquer mes surprises", exact: true })
      .click();
    await expect(viewer.getByRole("switch")).toHaveCount(0);
    await viewer
      .getByRole("button", { name: "Accès et sécurité", exact: true })
      .click();
    await expect(viewer.locator(".session-card")).toHaveCount(1);
    await expect(
      viewer.getByText(
        "Si vous perdez votre accès, demandez au propriétaire une nouvelle invitation. Vos envies seront conservées.",
        { exact: true },
      ),
    ).toBeVisible();
    await viewer
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(viewer).toHaveTitle("Ouicheur · Little wishes");
    await expect(
      viewer.getByRole("heading", { name: "Connected devices", exact: true }),
    ).toBeVisible();
    await viewer.screenshot({
      path: `test-results/family-security-en-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    expect(
      (await new AxeBuilder({ page: viewer }).analyze()).violations,
    ).toEqual([]);
    await viewer
      .getByRole("button", { name: "Back to my lists", exact: true })
      .click();
    await expect(
      viewer.getByRole("heading", {
        name: "Lists I help prepare",
        exact: true,
      }),
    ).toBeVisible();
    await viewer.screenshot({
      path: `test-results/family-team-en-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
  } finally {
    await member.close();
  }
});
