import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { openDatabase } from "../lib/db";
import { prepareSetup, completeWebSetup } from "../lib/setup";
import { verifyPassword } from "../lib/auth";

const input = {
  name: "Alex",
  password: "setup-test-only-password",
  confirmation: "setup-test-only-password",
  currency: "CHF",
  paypal: "https://paypal.me/FictionalTestOnly",
};

test("setup web protégé, validation et fermeture définitive", async () => {
  const db = openDatabase(":memory:");
  try {
    const code = prepareSetup(db)!;
    assert.equal(code.length, 32);
    assert.equal(prepareSetup(db), code);
    await assert.rejects(
      completeWebSetup(db, { ...input, code: "incorrect" }),
      /Code d’installation incorrect/,
    );
    await assert.rejects(
      completeWebSetup(db, { ...input, code, confirmation: "different" }),
      /ne correspondent pas/,
    );
    await assert.rejects(
      completeWebSetup(db, { ...input, code, currency: "INVALID" }),
    );
    await assert.rejects(
      completeWebSetup(db, { ...input, code, password: "short" }),
    );
    assert.equal(db.prepare("SELECT 1 FROM owner").get(), undefined);
    assert.equal(prepareSetup(db), code);
    await completeWebSetup(db, { ...input, code });
    const owner = db.prepare("SELECT * FROM owner").get()!;
    assert.equal(owner.name, input.name);
    assert.equal(owner.currency, "CHF");
    assert.equal(owner.paypal, "FictionalTestOnly");
    assert.ok(
      await verifyPassword(input.password, String(owner.password_hash)),
    );
    assert.equal(db.prepare("SELECT 1 FROM bootstrap").get(), undefined);
    assert.equal(prepareSetup(db), null);
    await assert.rejects(
      completeWebSetup(db, { ...input, name: "Replacement", code }),
      /déjà initialisée/,
    );
    assert.equal(db.prepare("SELECT name FROM owner").get()!.name, input.name);
    assert.ok(
      !JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes(code),
    );
  } finally {
    db.close();
  }
});

test("code conservé après redémarrage et un seul propriétaire en concurrence", async () => {
  const folder = resolve(".local/setup-tests", randomUUID());
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "wishlist.sqlite");
  const original = openDatabase(file);
  const code = prepareSetup(original)!;
  original.close();
  const first = openDatabase(file);
  const second = openDatabase(file);
  try {
    assert.equal(prepareSetup(first), code);
    const results = await Promise.allSettled([
      completeWebSetup(first, { ...input, code }),
      completeWebSetup(second, { ...input, code, name: "Second" }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.equal(first.prepare("SELECT COUNT(*) n FROM owner").get()!.n, 1);
    assert.equal(
      first
        .prepare("SELECT COUNT(*) n FROM audit WHERE action='owner.initialize'")
        .get()!.n,
      1,
    );
    assert.equal(prepareSetup(second), null);
  } finally {
    first.close();
    second.close();
  }
});
