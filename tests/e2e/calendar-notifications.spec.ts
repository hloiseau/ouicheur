import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://localhost:3211",
  headers = { origin };
test("calendar field choices and disabled reminders are clear and accessible", async ({
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
  const list = await (
    await context.request.post("/api/admin/lists", {
      headers,
      data: {
        name: `Anniversaire ${info.project.name}`,
        visibility: "public",
        event_date: "2000-02-29",
        event_annual: true,
        leap_day: "feb28",
        event_timezone: "Europe/Paris",
      },
    })
  ).json();
  await page.goto(`/lists/${list.id}`);
  const calendar = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "Ajouter à mon calendrier" }),
  });
  await calendar.locator("summary").click();
  await expect(calendar.getByText(/Chaque année/)).toBeVisible();
  const url = await calendar
    .getByRole("link", { name: "Télécharger l’événement (.ics)", exact: true })
    .getAttribute("href");
  const response = await context.request.get(url!);
  const content = await response.text();
  expect(content).toContain("SUMMARY:Ouicheur");
  expect(content).not.toContain("Anniversaire");
  await calendar
    .getByRole("checkbox", { name: "Inclure le nom de la liste", exact: true })
    .check();
  page.on("dialog", (d) => d.accept());
  await calendar
    .getByRole("button", { name: "Créer un lien d’abonnement", exact: true })
    .click();
  const feed = await calendar
    .getByRole("textbox", { name: "Lien de partage", exact: true })
    .inputValue();
  expect(feed).toContain("/api/calendar/feed/");
  await page.screenshot({
    path: `test-results/calendar-${info.project.name}.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await calendar
    .getByRole("button", { name: "Révoquer l’abonnement", exact: true })
    .click();
  await expect(
    calendar.getByText(
      "Abonnement révoqué. Les copies déjà importées peuvent subsister dans le calendrier.",
      { exact: true },
    ),
  ).toBeVisible();
  expect((await context.request.get(feed)).status()).toBe(404);
  await page.goto("/admin?tab=security");
  const prefs = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Mes rappels et notifications",
      exact: true,
    }),
  });
  await prefs
    .getByRole("button", { name: "Ajouter un rappel", exact: true })
    .click();
  await prefs
    .getByRole("combobox", { name: "Liste du rappel 1", exact: true })
    .selectOption(list.id);
  await prefs
    .getByRole("button", { name: "Enregistrer mes notifications", exact: true })
    .click();
  await expect(
    prefs.getByText("Préférences de notification enregistrées.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    prefs.getByRole("checkbox", {
      name: "Activer mes rappels personnalisés",
      exact: true,
    }),
  ).not.toBeChecked();
  await page.screenshot({
    path: `test-results/notification-preferences-${info.project.name}.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
