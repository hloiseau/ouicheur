import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { database, dataDir } from "../lib/db.ts";
import { initializeOwner, setPassword } from "../lib/auth.ts";
import { backupInstance, restoreInstance } from "../lib/backup.ts";

import { createI18n } from "../lib/i18n.ts";
const { t } = createI18n("en");

let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const ask = createInterface({
  input: process.stdin,
  output,
  terminal: !!process.stdin.isTTY,
});
async function password() {
  process.stdout.write("New password (at least 12 characters, hidden input): ");
  muted = true;
  const first = await ask.question("");
  muted = false;
  process.stdout.write("\nConfirm password: ");
  muted = true;
  const second = await ask.question("");
  muted = false;
  process.stdout.write("\n");
  if (first !== second) throw new Error("Passwords do not match.");
  return first;
}
try {
  const command = process.argv[2];
  if (command === "setup") {
    const db = database();
    if (db.prepare("SELECT 1 FROM owner").get())
      throw new Error(
        "Instance already set up. Use npm run password to recover access.",
      );
    const name = await ask.question("Owner nickname: ");
    await initializeOwner(db, name, await password());
    console.log(
      "Owner created. Sign in at /admin to configure PayPal.Me and your profile.",
    );
  } else if (command === "password") {
    await setPassword(database(), await password());
    console.log("Password changed and all sessions revoked.");
  } else if (command === "backup") {
    console.log(
      "Backup created:",
      backupInstance(
        database(),
        dataDir(),
        process.argv[3] ||
          resolve("backups", new Date().toISOString().replace(/[:.]/g, "-")),
      ),
    );
  } else if (command === "restore") {
    if (!process.argv[3])
      throw new Error(
        "Usage: npm run restore -- path/to/backup [new/data/directory]",
      );
    console.log(
      "Backup restored:",
      restoreInstance(process.argv[3], process.argv[4] || dataDir()),
    );
  } else throw new Error("Unknown command.");
} catch (error) {
  console.error(error instanceof Error ? t(error.message) : "Command failed.");
  process.exitCode = 1;
} finally {
  ask.close();
}
