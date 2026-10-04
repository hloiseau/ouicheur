import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { buildInfo } from "../lib/build-info";
import { saveGift } from "../lib/gifts";
import { confirmManual, createIntent } from "../lib/payments";

const runId = randomUUID();
const folder = resolve(".local/docker-check", runId);
mkdirSync(folder, { recursive: true });
const backups = join(folder, "backups");
mkdirSync(backups);
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
    // Linux CI bind mounts belong to the runner; Windows uses the image UID.
    "--user",
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    "--mount",
    `type=bind,source=${data},target=/app/data`,
    "--mount",
    `type=bind,source=${backups},target=/app/backups`,
    "--env",
    // Direct NAS/test access must work alongside a different public domain.
    "APP_ORIGIN=https://ouicheur.example",
    "ouicheur:local",
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
  assert.doesNotMatch(r.headers.get("set-cookie")!, /; Secure(?:;|$)/i);
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
  const support = await fetch("http://localhost:3212/api/admin/support", {
    headers: { cookie },
  });
  assert.equal(support.status, 200);
  const report = await support.json();
  assert.equal(report.version, buildInfo.version);
  assert.equal(report.revision, process.env.GITHUB_SHA || "local");
  assert.doesNotMatch(
    JSON.stringify(report),
    /Cadeau Docker|DOCKER-TEST|password|token|paypal/i,
  );
}
try {
  // Import the unbundled worker with runtime dependencies before starting the server.
  docker(
    "run",
    "--rm",
    "--entrypoint",
    "node",
    "ouicheur:local",
    "--input-type=module",
    "-e",
    'await import("./lib/operations.ts"); const { readFileSync } = await import("node:fs"); const inventory = JSON.parse(readFileSync("third-party-licenses/runtime-inventory.json", "utf8")); if (!inventory.debian.length || !inventory.browsers.length || !inventory.browser_notices.length || !Object.keys(inventory.native).length) throw Error("Incomplete final-image inventory");',
  );
  const fresh = join(folder, "first-start");
  mkdirSync(fresh, { recursive: true });
  start(fresh);
  await ready();
  const firstCode = [
    ...docker("logs", name).matchAll(/Setup code: ([\w-]{32})/g),
  ].at(-1)?.[1];
  assert.ok(
    firstCode,
    "Le premier démarrage doit afficher le code dans les journaux.",
  );
  docker("restart", name);
  await ready();
  const restartedCode = [
    ...docker("logs", name).matchAll(/Setup code: ([\w-]{32})/g),
  ].at(-1)?.[1];
  assert.equal(restartedCode, firstCode);
  const initialPage = await fetch("http://localhost:3212/setup");
  assert.equal(initialPage.status, 200);
  const setupHtml = await initialPage.text();
  assert.ok(setupHtml.includes("Your Ouichlist starts here."));
  assert.ok(!setupHtml.includes(firstCode));
  const setupResponse = await fetch("http://localhost:3212/api/setup", {
    method: "POST",
    headers: {
      origin: "http://localhost:3212",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: firstCode,
      name: "NAS Test",
      password: "docker-setup-password",
      confirmation: "docker-setup-password",
      currency: "EUR",
      paypal: "",
    }),
  });
  assert.equal(setupResponse.status, 201);
  assert.doesNotMatch(
    setupResponse.headers.get("set-cookie")!,
    /; Secure(?:;|$)/i,
  );
  const setupCookie = setupResponse.headers.get("set-cookie")!.split(";")[0];
  docker("restart", name);
  await ready();
  const initialized = await fetch("http://localhost:3212/api/admin", {
    headers: { cookie: setupCookie },
  });
  assert.equal(initialized.status, 200);
  assert.equal((await initialized.json()).profile.name, "NAS Test");
  const closed = await fetch("http://localhost:3212/api/setup", {
    method: "POST",
    headers: {
      origin: "http://localhost:3212",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: firstCode }),
  });
  assert.equal(closed.status, 409);
  docker("rm", "--force", name);
  name += "-existing";
  start(source);
  await ready();
  let cookie = await login();
  await check(cookie);
  // Native dependencies must work on both AMD64 and ARM64, including the smaller runtime image.
  docker(
    "exec",
    name,
    "node",
    "--input-type=module",
    "-e",
    "import sharp from 'sharp'; import {chromium} from 'playwright-core'; const b=await chromium.launch({headless:true}); await b.close(); await sharp({create:{width:2,height:2,channels:3,background:'#123456'}}).webp().toBuffer(); console.log(process.arch);",
  );
  const operations = await fetch("http://localhost:3212/api/admin/operations", {
    headers: { cookie },
  });
  assert.equal(operations.status, 200);
  assert.equal((await operations.json()).diagnostics.chromium, true);
  const managed = await fetch("http://localhost:3212/api/admin/backups", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://localhost:3212",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(managed.status, 200);
  const backupId = (await managed.json()).id;
  const download = await fetch(
    `http://localhost:3212/api/admin/backups/${backupId}`,
    { headers: { cookie } },
  );
  assert.equal(download.status, 200);
  assert.ok((await download.arrayBuffer()).byteLength > 0);
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
    "Docker : premier démarrage web protégé, code persistant, session, fermeture du setup, instance existante, financement, redémarrage, sauvegarde et restauration validés.",
  );
} finally {
  spawnSync("docker", ["rm", "--force", name], { encoding: "utf8" });
}
