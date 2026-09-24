import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../lib/db";
import { authorized, createSession } from "../lib/auth";

function run(
  command: string,
  folder: string,
  replies: string[] = [],
  args: string[] = [],
) {
  return new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["scripts/manage.ts", command, ...args],
        { env: { ...process.env, DATA_DIR: folder }, stdio: "pipe" },
      );
      let output = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Le dialogue CLI n’a pas terminé."));
      }, 10000);
      child.stdout.on("data", (chunk) => {
        const line = chunk.toString();
        output += line;
        if (
          /Pseudonyme|Nouveau mot de passe|Confirmez le mot de passe/.test(line)
        )
          child.stdin.write(`${replies.shift() || ""}\n`);
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    },
  );
}
test("les commandes natives initialisent, ferment setup, récupèrent l’accès et restaurent", async () => {
  const folder = mkdtempSync(join(tmpdir(), "wishlister-cli-"));
  try {
    const source = join(folder, "data");
    const backup = join(folder, "backup");
    const restored = join(folder, "restore");
    const setup = await run("setup", source, [
      "CLI Test",
      "cli-test-only-password",
      "cli-test-only-password",
    ]);
    assert.equal(setup.code, 0, setup.output);
    assert.ok(!setup.output.includes("cli-test-only-password"));
    assert.equal((await run("setup", source)).code, 1);
    const db = openDatabase(join(source, "wishlist.sqlite"));
    const token = createSession(db);
    db.close();
    assert.equal(
      (
        await run("password", source, [
          "new-cli-test-password",
          "new-cli-test-password",
        ])
      ).code,
      0,
    );
    const reopened = openDatabase(join(source, "wishlist.sqlite"));
    assert.ok(!authorized(reopened, token));
    reopened.close();
    const snapshot = await run("backup", source, [], [backup]);
    assert.equal(snapshot.code, 0, snapshot.output);
    const restore = await run("restore", source, [], [backup, restored]);
    assert.equal(restore.code, 0, restore.output);
    const check = openDatabase(join(restored, "wishlist.sqlite"));
    assert.equal(
      check.prepare("SELECT name FROM owner").get()!.name,
      "CLI Test",
    );
    check.close();
  } finally {
    assert.ok(folder.startsWith(join(tmpdir(), "wishlister-cli-")));
    rmSync(folder, { recursive: true, force: true });
  }
});
