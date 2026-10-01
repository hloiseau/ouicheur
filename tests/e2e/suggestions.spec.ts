import { test as base, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext } from "@playwright/test";

const headers = { origin: "http://localhost:3211" };
const test = base.extend<{
  suggestionResources: {
    guest: BrowserContext;
    trackList: (id: string, name: string) => void;
  };
}>({
  suggestionResources: [
    async ({ context, browser }, use, info) => {
      const guest = await browser.newContext({
        baseURL: "http://localhost:3211",
        viewport: info.project.use.viewport,
      });
      const lists: { id: string; name: string }[] = [];
      await use({ guest, trackList: (id, name) => lists.push({ id, name }) });
      // Fixture teardown has its own budget, even when a UI action times out.
      // Disable surprise protection first so later scenarios remain independent.
      try {
        for (const list of lists) {
          const response = await context.request.post("/api/admin/lists", {
            headers,
            data: {
              ...list,
              visibility: "private",
              archived: true,
              surprise_mode: false,
              confirm_reveal: true,
              suggestions_enabled: false,
            },
          });
          expect(response.ok(), await response.text()).toBe(true);
        }
        for (const state of ["pending", "accepted", "rejected"]) {
          const response = await context.request.get(
            `/api/admin/suggestions?state=${state}`,
          );
          expect(response.ok(), await response.text()).toBe(true);
          const { items } = await response.json();
          for (const row of items.filter((s: { list_id: string }) =>
            lists.some((list) => list.id === s.list_id),
          )) {
            const deleted = await context.request.post(
              `/api/admin/suggestions/${row.id}/review`,
              { headers, data: { action: "delete", confirm: true } },
            );
            expect(deleted.ok(), await deleted.text()).toBe(true);
          }
        }
      } finally {
        await guest.close();
      }
    },
    { timeout: 15000 },
  ],
});

test("guests privately suggest an idea, owners moderate it once, and personal links rotate and revoke", async ({
  page,
  context,
  suggestionResources,
}, info) => {
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  const post = async (path: string, data: unknown) => {
    const r = await context.request.post(`/api/${path}`, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  await post("login", { password: "test-only-password-2026" });
  const name = `Idées ${info.project.name}`;
  const { id: list } = await post("admin/lists", {
    name,
    visibility: "unlisted",
    surprise_mode: true,
  });
  suggestionResources.trackList(list, name);
  const { token: share } = await post("admin/lists/share", { id: list });
  const { guest } = suggestionResources;
  await guest.addCookies([
    { name: "ouicheur_locale", value: "fr", url: "http://localhost:3211" },
  ]);
  const visitor = await guest.newPage();
  await visitor.goto(`/s/${share}`);
  await expect(
    visitor.getByRole("button", { name: "Proposer une idée", exact: true }),
  ).toHaveCount(0);

  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Listes et partage", exact: true })
    .click();
  await page
    .getByRole("button", { name: `${name} · Non répertoriée`, exact: true })
    .click();
  await page.getByLabel("Autoriser les suggestions des proches").check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await context.request.get("/api/admin/lists")).json()).find(
          (l: { id: string }) => l.id === list,
        ).suggestions_enabled,
    )
    .toBe(1);
  await visitor.reload();
  await visitor
    .getByRole("button", { name: "Proposer une idée", exact: true })
    .click();
  const title = `Un livre ${info.project.name}`;
  const message = `Message privé ${info.project.name} <script>test</script>`;
  await visitor.getByLabel("Votre idée", { exact: true }).fill(title);
  await visitor.getByLabel("Votre pseudo (facultatif)").fill("Alex");
  await visitor
    .getByLabel("Message au propriétaire (facultatif)")
    .fill(message);
  await visitor
    .getByLabel(
      "Je comprends que cette proposition sera visible au propriétaire.",
    )
    .check();
  expect(
    (
      await new AxeBuilder({ page: visitor })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await visitor
    .getByRole("button", { name: "Envoyer ma suggestion", exact: true })
    .click();
  const personal = await visitor
    .getByLabel("Lien personnel de suivi")
    .inputValue();
  const token = new URL(personal).hash.slice(1);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const queue = await (
    await context.request.get("/api/admin/suggestions")
  ).json();
  const suggestion = queue.items.find(
    (s: { title: string }) => s.title === title,
  );
  expect(suggestion.message).toBe(message);
  expect(JSON.stringify(queue)).not.toContain(token);
  expect(JSON.stringify(queue)).not.toContain("token_hash");
  expect((await guest.request.get("/api/admin/suggestions")).status()).toBe(
    401,
  );
  const rsc = await guest.request.get(`/lists/${list}?_rsc=suggestions`, {
    headers: { RSC: "1" },
  });
  expect(await rsc.text()).not.toContain(message);
  expect(
    await (await guest.request.get(`/lists/${list}`)).text(),
  ).not.toContain(title);

  await page.getByRole("button", { name: /^Suggestions/ }).click();
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toContainText(message);
  await card.getByRole("button", { name: "Préparer cette envie" }).click();
  await expect(page.getByLabel("Nom de cette envie")).toHaveValue(title);
  // Text-only ideas are valid submissions; the owner supplies product and price.
  await page
    .getByLabel("Lien du produit", { exact: true })
    .fill(`https://example.com/suggested-${info.project.name}`);
  await page.getByRole("textbox", { name: /^Objectif \(/ }).fill("25");
  await page.getByRole("button", { name: "Accepter et créer l’envie" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const gifts = (
    await (await context.request.get("/api/admin")).json()
  ).gifts.filter((g: { title: string }) => g.title === title);
  expect(gifts).toHaveLength(1);
  expect(gifts[0].description).toBe("");
  const retried = await Promise.all([
    post(`admin/suggestions/${suggestion.id}/accept`, {}),
    post(`admin/suggestions/${suggestion.id}/accept`, {}),
  ]);
  expect(retried.map((r) => r.id)).toEqual([gifts[0].id, gifts[0].id]);
  expect(
    (await (await context.request.get("/api/admin")).json()).gifts.filter(
      (g: { title: string }) => g.title === title,
    ),
  ).toHaveLength(1);

  const requestUrls: string[] = [];
  visitor.on("request", (request) => requestUrls.push(request.url()));
  await visitor.goto(personal);
  await expect(
    visitor.getByText("Suggestion acceptée", { exact: true }),
  ).toBeVisible();
  expect(requestUrls.some((url) => url.includes(token))).toBe(false);
  expect(
    (
      await new AxeBuilder({ page: visitor })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await visitor.screenshot({
    path: `test-results/suggestion-tracking-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  visitor.once("dialog", (d) => d.accept());
  await visitor.getByRole("button", { name: "Renouveler mon lien" }).click();
  await expect(visitor.getByLabel("Lien personnel de suivi")).not.toHaveValue(
    personal,
  );
  expect(
    (
      await guest.request.post("/api/suggestions/manage", {
        headers,
        data: { token, action: "status" },
      })
    ).status(),
  ).toBe(404);
  visitor.once("dialog", (d) => d.accept());
  await visitor
    .getByRole("button", { name: "Supprimer ma proposition" })
    .click();
  await expect(
    visitor.getByText("Votre proposition et son lien ont été supprimés."),
  ).toBeVisible();
  expect(
    (await (await context.request.get("/api/admin")).json()).gifts.some(
      (g: { id: string }) => g.id === gifts[0].id,
    ),
  ).toBe(true);
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Suggestions", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Suggestion status")).toBeVisible();
  await page.screenshot({
    path: `test-results/suggestions-inbox-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
});

test("suggestion APIs enforce origin, current grants, size, frequency and owner-only moderation", async ({
  context,
  suggestionResources,
}, info) => {
  const ownerPost = async (path: string, data: unknown) => {
    const r = await context.request.post(`/api/${path}`, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  await ownerPost("login", { password: "test-only-password-2026" });
  const name = `API suggestions ${info.project.name}`;
  const { id: list } = await ownerPost("admin/lists", {
    name,
    visibility: "unlisted",
    suggestions_enabled: true,
  });
  suggestionResources.trackList(list, name);
  const { token: share } = await ownerPost("admin/lists/share", { id: list });
  const { guest } = suggestionResources;
  const idea = { list_id: list, title: "API idea", recipient_visible: true };
  const post = (data: unknown, origin = headers.origin) =>
    guest.request.post("/api/suggestions", { headers: { origin }, data });
  expect((await post(idea, "https://attacker.example")).status()).toBe(403);
  expect((await post(idea)).status()).toBe(404);
  await guest.request.get(`/s/${share}`);
  expect((await post({ ...idea, message: "x".repeat(17000) })).status()).toBe(
    413,
  );
  const created = await post(idea);
  expect(created.status()).toBe(201);
  const { token } = await created.json();
  expect(
    (
      await guest.request.post("/api/suggestions/manage", {
        headers: { origin: "https://attacker.example" },
        data: { token, action: "delete", confirm: true },
      })
    ).status(),
  ).toBe(403);
  const row = (
    await (await context.request.get("/api/admin/suggestions")).json()
  ).items.find((s: { list_id: string }) => s.list_id === list);
  expect(
    (
      await guest.request.post(`/api/admin/suggestions/${row.id}/review`, {
        headers,
        data: { action: "delete", confirm: true },
      })
    ).status(),
  ).toBe(401);
  await ownerPost("admin/lists/share", { id: list, revoke: true });
  expect((await post(idea)).status()).toBe(404);
  const managed = await guest.request.post("/api/suggestions/manage", {
    headers,
    data: { token, action: "status" },
  });
  expect(managed.status()).toBe(200);
  expect(Object.keys(await managed.json()).sort()).toEqual(
    ["title", "nickname", "message", "url", "state", "created_at"].sort(),
  );
  await ownerPost("admin/lists", {
    id: list,
    name,
    visibility: "public",
    suggestions_enabled: true,
  });
  // Previous rejected attempts consume the same quota, preventing brute-force probes.
  let limited = false;
  for (let i = 0; i < 11; i++) {
    const r = await post(idea);
    if (r.status() === 429) {
      limited = true;
      break;
    }
    expect(r.status()).toBe(201);
  }
  expect(limited).toBe(true);
  await ownerPost(`admin/suggestions/${row.id}/review`, {
    action: "reject",
    confirm: true,
  });
  expect(
    (
      await (
        await guest.request.post("/api/suggestions/manage", {
          headers,
          data: { token, action: "status" },
        })
      ).json()
    ).state,
  ).toBe("rejected");
});
