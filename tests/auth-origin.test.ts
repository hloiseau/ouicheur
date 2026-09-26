import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { requireOrigin } from "../lib/auth";

const originalOrigin = process.env.APP_ORIGIN;
afterEach(() => {
  if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalOrigin;
});

function request(
  address: string,
  origin = address,
  headers: Record<string, string> = {},
) {
  return new Request(`${address}/api/login`, {
    method: "POST",
    headers: {
      host: new URL(address).host,
      origin,
      "content-type": "application/json",
      ...headers,
    },
  });
}

test("same-origin login works on local addresses and alternate ports without changing APP_ORIGIN", () => {
  process.env.APP_ORIGIN = "https://ouicheur.example";
  for (const address of [
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://[::1]:3000",
    "http://192.168.1.20:31000",
    "http://nas.local:31000",
    "https://test.example",
  ])
    assert.doesNotThrow(() => requireOrigin(request(address)), address);
});

test("uses the browser Host, even when Next exposes the internal container URL", () => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  assert.doesNotThrow(() =>
    requireOrigin(
      request("http://0.0.0.0:3000", "http://192.168.1.20:31000", {
        host: "192.168.1.20:31000",
      }),
    ),
  );
});

test("direct access does not need a configured public domain", () => {
  for (const configured of [undefined, "", "domain-not-configured-yet"]) {
    if (configured === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = configured;
    assert.doesNotThrow(() => requireOrigin(request("http://nas.local:31000")));
    assert.throws(
      () =>
        requireOrigin(
          request("http://nas.local:31000", "https://attacker.example"),
        ),
      { status: 403 },
    );
  }
});

test("configured public origin remains available behind an HTTPS reverse proxy", () => {
  process.env.APP_ORIGIN = "https://ouicheur.example";
  assert.doesNotThrow(() =>
    requireOrigin(request("http://app:3000", "https://ouicheur.example")),
  );
});

test("rejects another site, port or protocol, missing origins and forged forwarding headers", () => {
  process.env.APP_ORIGIN = "https://ouicheur.example";
  for (const origin of [
    "https://attacker.example",
    "http://localhost:3001",
    "https://localhost:3000",
    "http://localhost.attacker.example:3000",
    "http://localhost:3000@attacker.example",
    "http://localhost:3000/path",
    "http://localhost:3000/",
    "null",
    "",
    "not a URL",
  ]) {
    assert.throws(
      () =>
        requireOrigin(
          request("http://localhost:3000", origin, {
            "x-forwarded-host": new URL("https://attacker.example").host,
            "x-forwarded-proto": "https",
          }),
        ),
      { status: 403 },
      origin,
    );
  }
  const missing = request("http://localhost:3000");
  missing.headers.delete("origin");
  assert.throws(() => requireOrigin(missing), { status: 403 });
});

test("rejects malformed Host values and still requires JSON", () => {
  process.env.APP_ORIGIN = "https://ouicheur.example";
  for (const host of [
    "",
    "localhost:3000, attacker.example",
    "user@localhost:3000",
    "localhost:3000/path",
  ]) {
    assert.throws(
      () =>
        requireOrigin(
          request("http://localhost:3000", "http://localhost:3000", { host }),
        ),
      { status: 403 },
    );
  }
  assert.throws(
    () =>
      requireOrigin(
        request("http://localhost:3000", "http://localhost:3000", {
          "content-type": "text/plain",
        }),
      ),
    { status: 415 },
  );
});
