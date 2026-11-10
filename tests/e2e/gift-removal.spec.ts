import { test, expect } from "./fixtures";

test("un nom suffit et le retrait supprime ou archive selon les engagements", async ({
  page,
  context,
}, info) => {
  const origin = "http://localhost:3211";
  const headers = { origin };
  await context.addCookies([
    { name: "ouicheur_locale", value: "fr", url: origin },
  ]);
  await context.request.post("/api/login", {
    headers,
    data: { password: "test-only-password-2026" },
  });
  await page.goto("/admin");
  const add = page.getByRole("button", {
    name: "Ajouter une envie",
    exact: true,
  });
  const dialog = page.getByRole("dialog");
  const state = async () =>
    (await (await context.request.get("/api/admin")).json()).gifts;
  const cardFor = (title: string) =>
    page
      .locator(".gift-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const remove = async (title: string) => {
    const card = cardFor(title);
    await card.getByText("Gérer", { exact: true }).click();
    await card
      .getByRole("button", { name: "Retirer de la liste", exact: true })
      .click();
    await expect(dialog).toHaveAccessibleName(`Retirer ${title} de la liste ?`);
  };

  const title = `Nom seul ${info.project.name}`;
  await add.click();
  await expect(
    dialog.getByLabel("Objectif (EUR)", { exact: false }),
  ).toBeHidden();
  await dialog.getByLabel("Nom de cette envie").fill(title);
  await dialog.getByRole("button", { name: "Enregistrer cette envie" }).click();
  await expect(cardFor(title)).toBeVisible();
  const gift = (await state()).find(
    (item: { title: string }) => item.title === title,
  );
  expect(gift).toMatchObject({ url: "", quantity: 1, budget_mode: "unknown" });
  await remove(title);
  await dialog
    .getByRole("button", { name: "Supprimer définitivement", exact: true })
    .click();
  await expect(cardFor(title)).toHaveCount(0);
  expect(
    (await state()).some((item: { id: string }) => item.id === gift.id),
  ).toBe(false);

  const reserved = `Envie réservée ${info.project.name}`;
  const created = await context.request.post("/api/admin/gifts", {
    headers,
    data: { title: reserved, budget_mode: "unknown" },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  const reservation = await context.request.post("/api/reservations", {
    headers,
    data: { gift_id: id, quantity: 1 },
  });
  expect(reservation.ok()).toBe(true);
  await page.reload();
  await remove(reserved);
  await dialog
    .getByRole("button", { name: "Archiver cette envie", exact: true })
    .click();
  await expect(cardFor(reserved)).toHaveCount(0);
  expect(
    (await state()).find((item: { id: string }) => item.id === id),
  ).toMatchObject({ visibility: "archived", reserved: 1 });
});
