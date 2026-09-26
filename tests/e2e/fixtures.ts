import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

// The browser suite shares one fixture instance. Quotas are per scenario;
// the application's normal limits still apply within each test.
export const test = base.extend<{ resetRateLimits: void }>({
  resetRateLimits: [
    async ({}, use) => {
      const marker = process.env.E2E_RUN_ID
        ? `.local/e2e-${process.env.E2E_RUN_ID}.txt`
        : ".local/e2e-current.txt";
      const folder = resolve(readFileSync(marker, "utf8"));
      if (!folder.startsWith(resolve(".local/e2e") + sep))
        throw new Error("Refusing to reset quotas outside the test instance.");
      const db = new DatabaseSync(join(folder, "wishlist.sqlite"));
      try {
        db.exec("DELETE FROM rate_limits");
      } finally {
        db.close();
      }
      await use();
    },
    { auto: true },
  ],
});
export { expect };
