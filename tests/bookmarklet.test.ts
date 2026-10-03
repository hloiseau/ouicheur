import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { browserBookmarklet } from "../lib/bookmarklet";
test("bookmarklet transfers only an explicitly selected title or URL to this instance", () => {
  for (const selected of [
    "",
    "A chosen title",
    "https://example.net/variant?size=M",
  ]) {
    let opened: unknown[] = [];
    runInNewContext(
      browserBookmarklet("https://wishlist.example.org").slice(
        "javascript:".length,
      ),
      {
        URL,
        document: { title: "Merchant page" },
        location: { href: "https://merchant.example/item" },
        window: {
          getSelection: () => selected,
          open: (...args: unknown[]) => {
            opened = args;
          },
        },
      },
    );
    const url = new URL(String(opened[0]));
    assert.equal(url.origin, "https://wishlist.example.org");
    assert.equal(url.pathname, "/add");
    assert.deepEqual([...url.searchParams.keys()], ["url", "title"]);
    assert.equal(
      url.searchParams.get("url"),
      selected.startsWith("https:")
        ? selected
        : "https://merchant.example/item",
    );
    assert.equal(
      url.searchParams.get("title"),
      selected && !selected.startsWith("https:") ? selected : "Merchant page",
    );
    assert.deepEqual(opened.slice(1), ["_blank", "noopener,noreferrer"]);
  }
});
