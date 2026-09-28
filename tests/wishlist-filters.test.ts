import test from "node:test";
import assert from "node:assert/strict";
import {
  availableToGive,
  filterWishlist,
  giftBudgetAmount,
  parseBudget,
} from "../lib/wishlist-filters";

const gift = {
  id: "books",
  title: "Éditions illustrées",
  description: "Trois livres pour les soirées de lecture",
  target: 5997,
  quantity: 3,
  currency: "EUR",
  funded: 0,
  reserved: 0,
  purchased: 0,
  closed: 0,
  priority: 0,
};
const filters: Parameters<typeof filterWishlist>[1] = {
  search: "",
  currency: "EUR",
  basis: "unit",
  minimum: null,
  maximum: null,
  availableOnly: false,
  sort: "priority",
  locale: "fr",
};

test("budgets accept French and English cents without rounding malformed input", () => {
  assert.equal(parseBudget("19,99"), 1999);
  assert.equal(parseBudget(" 19.99 "), 1999);
  assert.equal(parseBudget("0"), 0);
  assert.equal(parseBudget("1000000"), 100000000);
  assert.equal(parseBudget(""), null);
  for (const value of ["-1", "19.999", "1e3", "NaN", "1,2.3", "1000000.01"])
    assert.equal(parseBudget(value), undefined, value);
});

test("a budget can buy one requested copy without covering the whole quantity", () => {
  assert.equal(giftBudgetAmount(gift, "unit"), 1999);
  assert.equal(giftBudgetAmount(gift, "total"), 5997);
  assert.deepEqual(
    filterWishlist([gift], { ...filters, minimum: 1999, maximum: 1999 }),
    [gift],
  );
  assert.deepEqual(filterWishlist([gift], { ...filters, maximum: 1998 }), []);
  assert.deepEqual(
    filterWishlist([gift], { ...filters, basis: "total", maximum: 1999 }),
    [],
  );
});

test("remaining budget uses funding totals and never becomes negative", () => {
  const funded = { ...gift, funded: 4997 };
  assert.equal(giftBudgetAmount(funded, "remaining"), 1000);
  assert.equal(giftBudgetAmount({ ...gift, funded: 7000 }, "remaining"), 0);
  assert.deepEqual(
    filterWishlist([funded], { ...filters, basis: "remaining", maximum: 1000 }),
    [funded],
  );
});

test("unavailable and fully reserved gifts are excluded but partial reservations can be given", () => {
  for (const unavailable of [
    { ...gift, visibility: "archived" },
    { ...gift, closed: 1 },
    { ...gift, purchased: 1 },
    { ...gift, funded: 5997 },
    { ...gift, reserved: 3 },
  ]) {
    assert.equal(availableToGive(unavailable, "unit"), false);
    assert.deepEqual(
      filterWishlist([unavailable], { ...filters, availableOnly: true }),
      [],
    );
  }
  const partial = { ...gift, reserved: 1 };
  assert.equal(availableToGive(partial, "unit"), true);
  assert.equal(availableToGive(partial, "remaining"), false);
});

test("a numeric budget needs a currency and never admits a cheaper foreign amount", () => {
  const dollars = { ...gift, id: "usd", currency: "USD", target: 300 };
  assert.deepEqual(
    filterWishlist([gift, dollars], { ...filters, maximum: 1999 }),
    [gift],
  );
  assert.deepEqual(
    filterWishlist([gift, dollars], {
      ...filters,
      currency: "",
      maximum: 1999,
    }),
    [],
  );
  assert.deepEqual(
    filterWishlist([gift], { ...filters, minimum: 2000, maximum: 1000 }),
    [],
  );
});

test("monetary sorting groups currencies and does not modify source order", () => {
  const cheap = { ...gift, id: "cheap", target: 1500, quantity: 1 };
  const expensive = { ...gift, id: "expensive", target: 2200, quantity: 1 };
  const dollar = { ...gift, id: "dollar", currency: "USD", target: 3 };
  const source = Object.freeze([dollar, expensive, gift, cheap]);
  assert.deepEqual(
    filterWishlist(source, {
      ...filters,
      currency: "",
      sort: "unit-price",
    }).map((g) => g.id),
    ["cheap", "books", "expensive", "dollar"],
  );
  assert.deepEqual(
    filterWishlist(source, { ...filters, sort: "unit-price-desc" }).map(
      (g) => g.id,
    ),
    ["expensive", "books", "cheap"],
  );
  assert.deepEqual(
    source.map((g) => g.id),
    ["dollar", "expensive", "books", "cheap"],
  );
});

test("search ignores accents and still combines with price and currency filters", () => {
  assert.deepEqual(filterWishlist([gift], { ...filters, search: "editions" }), [
    gift,
  ]);
  assert.deepEqual(
    filterWishlist([gift], { ...filters, search: "soirees", maximum: 1998 }),
    [],
  );
});
