import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("les contributions sont plafonnées au reste à financer", async ({
  page,
  context,
}, info) => {
  // Exercise the fallback when a browser blocks the automatic PayPal tab.
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await context.route("https://paypal.me/**", (route) =>
    route.fulfill({ status: 200, body: "PayPal fictif pour le test" }),
  );
  const headers = { origin: "http://localhost:3211" };
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: headers.origin },
  ]);
  const login = await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  expect(login.status()).toBe(200);
  const created = await context.request.post("/api/admin/gifts", {
    headers,
    data: {
      title: "Doga T02",
      url: `https://example.com/contribution-limit-${info.project.name}`,
      target: "7.95",
    },
  });
  expect(created.status()).toBe(200);
  const { id: giftId } = await created.json();
  await page.goto(`/cadeaux/${giftId}`);
  const amount = page.getByRole("textbox", {
    name: "Votre contribution (EUR)",
  });
  const submit = page.getByRole("button", { name: "Continuer vers PayPal" });
  const options = page.locator(".amount-options button");
  await expect(options).toHaveText([/5,00\s€/, /7,95\s€/]);
  await expect(amount).toHaveValue("7.95");
  await expect(page.getByText(/Maximum : 7,95\s€/)).toBeVisible();
  await page.screenshot({
    path: `test-results/contribution-limit-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });

  await amount.fill("7,96");
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "montant restant à financer",
  );
  await options.first().click();
  await expect(amount).toHaveValue("5");
  await expect(submit).toBeEnabled();
  const fundRemaining = page.getByRole("button", { name: /Financer le reste/ });
  await fundRemaining.click();
  await expect(amount).toHaveValue("7.95");
  await amount.fill("7,95");
  await expect(options.last()).toHaveAttribute("aria-pressed", "true");
  await submit.click();
  await expect(
    page.getByRole("link", { name: /Ouvrir PayPal/ }),
  ).toHaveAttribute("href", "https://paypal.me/FictionalTestOnly/7.95EUR");
  const intentId = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByRole("button", { name: "J’ai envoyé l’argent" }).click();
  await expect(
    page.getByText("Participation comptabilisée", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Retour au cadeau" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "795");
  await expect(
    page.getByText(/Les nouvelles contributions sont fermées/),
  ).toBeVisible();
  await expect(submit).toHaveCount(0);

  const confirmation = {
    contribution_id: intentId,
    transaction_ref: `LIMIT-${info.project.name}`,
    gross: "5",
    fee: "0.50",
    currency: "EUR",
    reason: "Versement fictif pour vérifier le plafond",
    event_id: randomUUID(),
    recipient_checked: true,
    association_checked: true,
    received_checked: true,
  };
  expect(
    (
      await context.request.post("/api/admin/confirm", {
        headers,
        data: confirmation,
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/cadeaux/${giftId}`);
  await expect(options).toHaveText([/3,45\s€/]);
  await expect(fundRemaining).toHaveText(/Financer le reste \(3,45\s€\)/);
  await expect(amount).toHaveValue("3.45");
  await expect(page.getByText(/Maximum : 3,45\s€/)).toBeVisible();
  const excessive = await context.request.post("/api/contributions", {
    headers,
    data: { gift_id: giftId, amount: "3.46" },
  });
  expect(excessive.status()).toBe(400);
  expect((await excessive.json()).error).toContain(
    "montant restant à financer",
  );
  await page.screenshot({
    path: `test-results/contribution-limit-partial-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });

  // The server also checks the current total if funding changed after page load.
  const rest = await context.request.post("/api/contributions", {
    headers,
    data: { gift_id: giftId, amount: "3.45" },
  });
  expect(rest.status()).toBe(201);
  expect(
    (
      await context.request.post("/api/admin/confirm", {
        headers,
        data: {
          ...confirmation,
          contribution_id: (await rest.json()).id,
          transaction_ref: `LIMIT-REST-${info.project.name}`,
          gross: "3.45",
          fee: "0",
          event_id: randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  await submit.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "financement de ce cadeau est terminé",
  );
  await page.reload();
  await expect(
    page.getByText(/Les nouvelles contributions sont fermées/),
  ).toBeVisible();
  await expect(submit).toHaveCount(0);

  const expensiveGift = await context.request.post("/api/admin/gifts", {
    headers,
    data: {
      title: "Un cadeau à financer en totalité",
      url: `https://example.com/full-contribution-${info.project.name}`,
      target: "129.95",
    },
  });
  expect(expensiveGift.status()).toBe(200);
  await page.goto(`/cadeaux/${(await expensiveGift.json()).id}`);
  await expect(options).toHaveText([
    /5,00\s€/,
    /10,00\s€/,
    /25,00\s€/,
    /50,00\s€/,
    /Financer le reste \(129,95\s€\)/,
  ]);
  await fundRemaining.click();
  await expect(amount).toHaveValue("129.95");
  await expect(fundRemaining).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: `test-results/contribution-full-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await submit.click();
  await expect(
    page.getByRole("link", { name: /Ouvrir PayPal/ }),
  ).toHaveAttribute("href", "https://paypal.me/FictionalTestOnly/129.95EUR");
});
