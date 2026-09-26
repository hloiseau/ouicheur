import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db";
import { backupInstance, restoreInstance } from "../lib/backup";

test("les images propres aux catégories survivent à la sauvegarde et à la restauration", () => {
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-categories-"));
  const source = join(folder, "source");
  mkdirSync(source);
  const legacy = new DatabaseSync(join(source, "wishlist.sqlite"));
  legacy.exec("CREATE TABLE migrations (name TEXT PRIMARY KEY) STRICT");
  for (const name of readdirSync("migrations")
    .filter((name) => name.endsWith(".sql") && name < "008-")
    .sort()) {
    legacy.exec(readFileSync(join("migrations", name), "utf8"));
    legacy.prepare("INSERT INTO migrations VALUES (?)").run(name);
  }
  legacy
    .prepare("INSERT INTO categories(id,name) VALUES (?,?)")
    .run("old", "Existing category");
  legacy.close();
  const db = openDatabase(join(source, "wishlist.sqlite"));
  try {
    assert.equal(
      db.prepare("SELECT image FROM categories WHERE id='old'").get()!.image,
      "",
    );
    const file = `${"a".repeat(64)}.webp`;
    mkdirSync(join(source, "images"));
    writeFileSync(join(source, "images", file), "category-only-image");
    db.prepare("UPDATE categories SET image=? WHERE id='old'").run(
      `/media/${file}`,
    );
    const backup = backupInstance(db, source, join(folder, "backup"));
    restoreInstance(backup, join(folder, "restored"));
    assert.equal(
      readFileSync(join(folder, "restored", "images", file), "utf8"),
      "category-only-image",
    );
    const restored = openDatabase(join(folder, "restored", "wishlist.sqlite"));
    try {
      assert.equal(
        restored.prepare("SELECT image FROM categories WHERE id='old'").get()!
          .image,
        `/media/${file}`,
      );
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    assert.ok(folder.startsWith(join(tmpdir(), "ouicheur-categories-")));
    rmSync(folder, { recursive: true, force: true });
  }
});
