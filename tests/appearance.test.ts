import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database, openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { publicProfile } from "../lib/gifts";
import { appearanceStyle, defaultAppearance } from "../lib/appearance";
import { backupInstance, restoreInstance } from "../lib/backup";
import { storeImage } from "../lib/images";
import sharp from "sharp";

test("existing profiles gain appearance defaults; background and preferences survive backup/restore", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-appearance-"));
  const path = join(folder, "wishlist.sqlite");
  const previousDataDir = process.env.DATA_DIR;
  const legacy = new DatabaseSync(path);
  legacy.exec("CREATE TABLE migrations (name TEXT PRIMARY KEY) STRICT");
  for (const name of readdirSync("migrations")
    .filter((name) => name.endsWith(".sql") && name < "005-")
    .sort()) {
    legacy.exec(readFileSync(join("migrations", name), "utf8"));
    legacy.prepare("INSERT INTO migrations VALUES (?)").run(name);
  }
  await initializeOwner(legacy, "Existing profile", "test-appearance-password");
  legacy.close();
  const db = openDatabase(path);
  try {
    const profile = publicProfile(db)!;
    assert.equal(profile.name, "Existing profile");
    for (const [key, value] of Object.entries(defaultAppearance))
      assert.equal(profile[key as keyof typeof profile], value);
    process.env.DATA_DIR = folder;
    const background = await storeImage(
      await sharp({
        create: { width: 12, height: 12, channels: 3, background: "#20332c" },
      })
        .png()
        .toBuffer(),
    );
    db.prepare(
      "UPDATE owner SET background=?,accent='#45e6cf',banner_position=83,layout='comfortable'",
    ).run(background);
    backupInstance(db, folder, join(folder, "backup"));
    restoreInstance(join(folder, "backup"), join(folder, "restored"));
    const restored = openDatabase(join(folder, "restored", "wishlist.sqlite"));
    try {
      assert.deepEqual(publicProfile(restored), publicProfile(db));
      assert.deepEqual(
        readFileSync(join(folder, "restored/images", background.slice(7))),
        readFileSync(join(folder, "images", background.slice(7))),
      );
    } finally {
      restored.close();
    }
    assert.equal(
      appearanceStyle({ accent: "#000000" })[
        "--profile-ink" as keyof ReturnType<typeof appearanceStyle>
      ],
      "#ffffff",
    );
    assert.equal(
      appearanceStyle({ accent: "#ffffff" })[
        "--profile-ink" as keyof ReturnType<typeof appearanceStyle>
      ],
      "#000000",
    );
    assert.deepEqual(
      appearanceStyle({ accent: "url(https://invalid.example)" }),
      appearanceStyle(defaultAppearance),
    );
  } finally {
    db.close();
    // storeImage also opens the shared connection; release it before Windows cleanup.
    database().close();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    rmSync(folder, { recursive: true, force: true });
  }
});
