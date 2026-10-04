import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createI18n, resolveLocale } from "../lib/i18n";
import { english } from "../lib/messages";
import { AppError } from "../lib/validation";
import { stateLabel } from "../lib/format";

test("browser language selects the best supported regional preference", () => {
  for (const [header, expected] of [
    ["fr-FR,fr;q=0.9,en;q=0.8", "fr"],
    ["fr-CA", "fr"],
    ["FR-be;q=1", "fr"],
    ["en-GB,fr;q=0.9", "en"],
    ["en;q=0.4,fr;q=0.9", "fr"],
    ["de-DE,fr;q=0.8,en;q=0.7", "fr"],
    ["fr;q=0.7,en;q=0.7", "fr"],
    ["en;q=0,fr;q=0.5", "fr"],
    ["fr;q=0,en;q=0.5", "en"],
  ])
    assert.equal(resolveLocale(undefined, header), expected, header);
});

test("manual preference wins and invalid preferences fall back to the browser", () => {
  assert.equal(resolveLocale("en", "fr-FR"), "en");
  assert.equal(resolveLocale("fr", "en-US"), "fr");
  assert.equal(resolveLocale("invalid", "fr-FR"), "fr");
  assert.equal(resolveLocale("__proto__", "fr-FR"), "fr");
});

test("absent, unsupported and malformed browser languages safely fall back", () => {
  for (const header of [
    undefined,
    null,
    "",
    "de-DE,ja;q=0.9",
    "*",
    "french",
    "fr_FR",
    "fr;q=2,en;q=0.5",
    "fr;q=-1",
    "fr;q=NaN",
    "fr;q=",
    "fr;q=0.1234",
  ])
    assert.equal(resolveLocale(undefined, header), "en", String(header));
});

test("locales stay independent, preserve user text and format amounts and history", () => {
  const en = createI18n(resolveLocale(undefined));
  const fr = createI18n(resolveLocale("fr"));
  assert.equal(resolveLocale("de"), "en");
  assert.equal(resolveLocale("__proto__"), "en");
  assert.equal(en.t("La Ouichlist de {0}", "Camille"), "Camille’s Ouichlist");
  assert.equal(
    fr.t("La Ouichlist de {0}", "Camille"),
    "La Ouichlist de Camille",
  );
  assert.equal(
    en.t("La Ouichlist de {0}", "<test>{1}"),
    "<test>{1}’s Ouichlist",
  );
  assert.equal(en.money(123450, "EUR"), "€1,234.50");
  assert.match(fr.money(123450, "EUR"), /^1\s234,50\s€$/);
  assert.notEqual(
    en.date("2026-09-24T12:00:00Z"),
    fr.date("2026-09-24T12:00:00Z"),
  );
  const error = new AppError(
    "Source inaccessible (HTTP {0}). Aucun contournement effectué.",
    400,
    [429],
  );
  const stored = JSON.stringify([error.key, ...error.values]);
  assert.equal(
    en.storedError(stored),
    "Source unavailable (HTTP 429). No access restrictions were bypassed.",
  );
  assert.equal(fr.storedError(stored), error.message);
  assert.equal(en.storedError(error.message), en.storedError(stored));
  assert.equal(en.storedError("Titre manquant."), "Missing title.");
  assert.equal(en.t("Mot de passe"), "Password");
});

test("all UI calls, application errors and state labels have English translations", () => {
  for (const [key, value] of Object.entries(english)) {
    assert.doesNotMatch(
      key,
      /\bwishlists?\b/i,
      "Use Ouichlist in interface messages.",
    );
    assert.doesNotMatch(
      value,
      /\bwishlists?\b/i,
      "Use Ouichlist in both languages.",
    );
    const placeholders = (s: string) =>
      [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
    assert.ok(value.trim(), key);
    assert.deepEqual(placeholders(value), placeholders(key), key);
  }
  for (const label of Object.values(stateLabel))
    assert.ok(Object.hasOwn(english, label), label);
  for (const dir of ["components", "app", "lib"]) {
    for (const file of readdirSync(dir, {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => /\.tsx?$/.test(file))) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      for (const match of source.matchAll(
        /(?:\bt|new AppError)\(\s*("(?:[^"\\]|\\.)*")/g,
      )) {
        const key = JSON.parse(match[1]);
        assert.ok(Object.hasOwn(english, key), `${dir}/${file}: ${key}`);
      }
    }
  }
});
