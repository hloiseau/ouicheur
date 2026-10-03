import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db";
import { listGifts } from "../lib/gifts";
import { backupInstance, restoreInstance } from "../lib/backup";
import { supportInfo } from "../lib/support";
import { buildInfo } from "../lib/build-info";

const migrations = readdirSync("migrations")
  .filter((n) => n.endsWith(".sql"))
  .sort();
test("every historical schema upgrades with its ledger intact and restores into an isolated current instance", async (t) => {
  for (let prefix = 1; prefix <= migrations.length; prefix++) {
    await t.test(migrations[prefix - 1], () => {
      const root = mkdtempSync(join(tmpdir(), "ouicheur-schema-"));
      const source = join(root, "original");
      mkdirSync(source);
      const path = join(source, "wishlist.sqlite");
      let db: DatabaseSync | undefined = new DatabaseSync(path);
      try {
        db.exec(
          "PRAGMA foreign_keys=ON; CREATE TABLE migrations(name TEXT PRIMARY KEY) STRICT",
        );
        for (let i = 0; i < prefix; i++) {
          db.exec(readFileSync(join("migrations", migrations[i]), "utf8"));
          db.prepare("INSERT INTO migrations VALUES (?)").run(migrations[i]);
          if (i === 0)
            db.exec(`
            INSERT INTO owner(id,password_hash,name,bio) VALUES(1,'private-test-hash','PRIVATE_OWNER','PRIVATE_BIO');
            INSERT INTO gifts(id,url,title,target,currency,visibility,created_at,updated_at)
              VALUES('old-gift','https://example.org/migration','PRIVATE_WISH',2500,'EUR','visible','2026-01-01','2026-01-01');
            INSERT INTO contributions(id,gift_id,amount,currency,nickname,state,created_at,expires_at)
              VALUES('old-contribution','old-gift',100,'EUR','PRIVATE_DONOR','declared','2026-01-01','2099-01-01');
            INSERT INTO payments(id,contribution_id,transaction_ref,currency,gross,fee,net,provenance,created_at)
              VALUES('old-payment','old-contribution','PRIVATE_TRANSACTION','EUR',100,10,90,'manual','2026-01-01');
            INSERT INTO sessions(hash,expires) VALUES('private-session',4070908800000);
          `);
        }
        db.close();
        db = openDatabase(path);
        assert.equal(
          db.prepare("PRAGMA integrity_check").get()!.integrity_check,
          "ok",
        );
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
        const expected = listGifts(db, true);
        assert.equal(expected.length, 1);
        assert.equal(expected[0].target, 2500);
        assert.equal(expected[0].funded, 90);
        assert.equal(expected[0].quantity, 1);
        assert.equal(
          db.prepare("SELECT COUNT(*) n FROM migrations").get()!.n,
          migrations.length,
        );
        const report = supportInfo(db);
        assert.deepEqual(Object.keys(report).sort(), [
          "architecture",
          "node",
          "platform",
          "revision",
          "schema",
          "sqlite",
          "version",
        ]);
        assert.doesNotMatch(
          JSON.stringify(report),
          /PRIVATE_|private-session|private-test-hash|example\.org/,
        );
        assert.equal(report.revision, buildInfo.revision);
        backupInstance(db, source, join(root, "snapshot"));
        db.close();
        db = undefined;
        restoreInstance(join(root, "snapshot"), join(root, "restored"));
        db = openDatabase(join(root, "restored", "wishlist.sqlite"));
        assert.deepEqual(listGifts(db, true), expected);
        assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 0);
        assert.equal(db.prepare("SELECT net FROM payments").get()!.net, 90);
        assert.equal(
          db.prepare("SELECT COUNT(*) n FROM contributions").get()!.n,
          1,
        );
      } finally {
        db?.close();
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
test("release package and lockfile versions match", () => {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(lock.version, buildInfo.version);
  assert.equal(lock.packages[""].version, buildInfo.version);
});
