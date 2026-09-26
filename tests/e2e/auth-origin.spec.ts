import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDatabase } from "../../lib/db";
import { initializeOwner } from "../../lib/auth";

test("local login, logout and reconnection work with a different public HTTPS origin", async ({
  page,
  context,
}) => {
  const local = "http://127.0.0.1:3214";
  const publicOrigin = "https://ouicheur.example";
  const folder = resolve(".local/e2e-auth", randomUUID());
  mkdirSync(folder, { recursive: true });
  const db = openDatabase(join(folder, "wishlist.sqlite"));
  try {
    await initializeOwner(db, "Origin test", "test-only-origin-password");
  } finally {
    db.close();
  }
  const server = spawn(process.execPath, ["scripts/start.mjs"], {
    env: {
      ...process.env,
      PORT: "3214",
      APP_ORIGIN: publicOrigin,
      DATA_DIR: folder,
    },
    stdio: "ignore",
  });
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await context.request.get(`${local}/api/health`)).status();
          } catch {
            return 0;
          }
        },
        { timeout: 20000 },
      )
      .toBe(200);

    const signIn = async (address: string) => {
      await page.goto(`${address}/admin`);
      await page
        .getByLabel("Password", { exact: true })
        .fill("test-only-origin-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "My wishes", exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "My wishes", exact: true }),
      ).toBeVisible();
      const cookie = (await context.cookies(address)).find(
        (c) => c.name === "wishlister_session",
      );
      expect(cookie).toMatchObject({
        secure: false,
        httpOnly: true,
        sameSite: "Strict",
        path: "/",
      });
    };
    await signIn(local);
    const rejected = await context.request.post(`${local}/api/logout`, {
      headers: { origin: "https://attacker.example" },
      data: {},
    });
    expect(rejected.status()).toBe(403);
    expect((await context.request.get(`${local}/api/admin`)).status()).toBe(
      200,
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    expect((await context.request.get(`${local}/api/admin`)).status()).toBe(
      401,
    );
    await signIn(local);
    await signIn("http://localhost:3214");

    // Simulate the validated public origin behind TLS termination: the cookie
    // must still be Secure, although the proxy-to-container connection is HTTP.
    const secureLogin = await context.request.post(`${local}/api/login`, {
      headers: { origin: publicOrigin },
      data: { password: "test-only-origin-password" },
    });
    expect(secureLogin.status()).toBe(200);
    expect(secureLogin.headers()["set-cookie"]).toMatch(/; Secure(?:;|$)/i);
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  }
});
