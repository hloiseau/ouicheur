import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveGift } from "../lib/gifts";
import { confirmManual, createIntent } from "../lib/payments";

const runId = randomUUID();
const folder = resolve(".local/docker-check", runId);
mkdirSync(folder, { recursive: true });
const source = join(folder, "data");
const db = openDatabase(join(source, "wishlist.sqlite"));
await initializeOwner(db, "Docker Test", "docker-test-only-password");
db.prepare("UPDATE owner SET paypal='FictionalTestOnly'").run();
const giftId = saveGift(db, {
  url: "https://example.com/docker",
  title: "Cadeau Docker",
  target: "100",
  visibility: "visible",
});
const intent = createIntent(db, { gift_id: giftId, amount: "20" });
confirmManual(db, {
  contribution_id: intent.id,
  transaction_ref: "DOCKER-TEST",
  gross: "20",
  fee: "1",
  currency: "EUR",
  reason: "Fixture de test conteneur",
  event_id: randomUUID(),
  recipient_checked: true,
  association_checked: true,
  received_checked: true,
});
db.close();
let name = `wishlister-test-${runId}`;
function docker(...args: string[]) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
async function ready() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if (
        (
          await fetch("http://localhost:3212/api/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        return;
    } catch {
      /* Container startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Le conteneur n’est pas prêt.");
}
function start(data: string) {
  docker(
    "run",
    "--detach",
    "--name",
    name,
    "--publish",
    "127.0.0.1:3212:3000",
    "--mount",
    `type=bind,source=${data},target=/app/data`,
    "--env",
    "APP_ORIGIN=http://localhost:3212",
    "wishlister:local",
  );
}
async function login() {
  const r = await fetch("http://localhost:3212/api/login", {
    method: "POST",
    headers: {
      origin: "http://localhost:3212",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: "docker-test-only-password" }),
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie")!.split(";")[0];
}
async function check(cookie: string) {
  const r = await fetch("http://localhost:3212/api/admin", {
    headers: { cookie },
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.gifts[0].confirmed, 1900);
  assert.equal(data.gifts[0].title, "Cadeau Docker");
}
try {
  start(source);
  await ready();
  let cookie = await login();
  await check(cookie);
  const publicPage = await fetch("http://localhost:3212/");
  assert.equal(publicPage.status, 200);
  assert.ok((await publicPage.text()).includes("Docker Test"));
  docker("exec", name, "npm", "run", "backup", "--", "/app/backups/smoke");
  docker("restart", name);
  await ready();
  await check(cookie);
  const snapshot = join(folder, "snapshot");
  docker("cp", `${name}:/app/backups/smoke`, snapshot);
  const restored = join(folder, "restored");
  const result = spawnSync(
    process.execPath,
    ["scripts/manage.ts", "restore", snapshot, restored],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  docker("rm", "--force", name);
  name += "-restored";
  start(restored);
  await ready();
  const oldSession = await fetch("http://localhost:3212/api/admin", {
    headers: { cookie },
  });
  assert.equal(oldSession.status, 401);
  cookie = await login();
  await check(cookie);
  console.log(
    "Docker : démarrage, page publique, session, financement, redémarrage, sauvegarde et restauration sur un nouveau conteneur validés.",
  );
} finally {
  spawnSync("docker", ["rm", "--force", name], { encoding: "utf8" });
}
