import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveGift } from "../lib/gifts";
import { confirmManual, createIntent } from "../lib/payments";

// Test-only instance. No fixtures or simulator are reachable through production routes.
const folder = resolve(".local", "e2e", randomUUID());
mkdirSync(folder, { recursive: true });
const db = openDatabase(join(folder, "wishlist.sqlite"));
await initializeOwner(db, "Camille", "test-only-password-2026");
db.prepare("UPDATE owner SET paypal='FictionalTestOnly',bio=?").run(
  "Des livres à dévorer, des idées à faire pousser et quelques petits bonheurs pour le quotidien. Merci de faire un bout de chemin avec moi ♡",
);
const categories = [
  [randomUUID(), "À la maison"],
  [randomUUID(), "Évasion & loisirs"],
  [randomUUID(), "Les petits plaisirs"],
];
for (const [id, name] of categories)
  db.prepare("INSERT INTO categories(id,name) VALUES (?,?)").run(id, name);
for (const [index, title, description, target, priority] of [
  [
    0,
    "Une lumière pour les soirs de lecture",
    "Une lampe toute douce pour accompagner mes livres et mes soirées tranquilles.",
    "89",
    2,
  ],
  [
    1,
    "Le prochain chapitre",
    "De nouvelles histoires à découvrir, une tasse de thé à la main.",
    "45",
    1,
  ],
  [
    2,
    "Un petit coin de verdure",
    "Des plantes, quelques pots et un peu de nature dans mon quotidien.",
    "65",
    0,
  ],
] as const) {
  const gift = saveGift(db, {
    url: `https://example.com/e2e-${index}`,
    title,
    description,
    target,
    priority,
    category_id: categories[index][0],
    visibility: "visible",
  });
  if (index < 2) {
    const intent = createIntent(db, {
      gift_id: gift,
      amount: "15",
      nickname: "Alex",
      message: "Pour tes petits moments de bonheur !",
      public_name: true,
      public_message: false,
    });
    confirmManual(db, {
      contribution_id: intent.id,
      transaction_ref: `TEST-FIXTURE-${index}`,
      gross: "15",
      fee: "0",
      currency: "EUR",
      reason: "Fixture fictive de test uniquement",
      event_id: randomUUID(),
      recipient_checked: true,
      association_checked: true,
      received_checked: true,
    });
  }
}
writeFileSync(resolve(".local/e2e-current.txt"), folder);
if (process.env.E2E_RUN_ID)
  writeFileSync(resolve(`.local/e2e-${process.env.E2E_RUN_ID}.txt`), folder);
db.close();
const child = spawn(process.execPath, ["scripts/start.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: "3211",
    APP_ORIGIN: "http://localhost:3211",
    DATA_DIR: folder,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
