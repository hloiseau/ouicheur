import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import http2 from "node:http2";
import https from "node:https";
import tls from "node:tls";
import type { AddressInfo } from "node:net";
import { fetchSafe, MAX_HTML_BYTES } from "../lib/fetch-safe";

// Public test certificate/key, trusted only inside this test's TLS connection.
const cert = readFileSync("tests/fixtures/fetch-test-cert.pem");
const key = readFileSync("tests/fixtures/fetch-test-key.pem");

test("récupération HTTPS : HTTP/2, compatibilité HTTP/1.1 et limites réseau", async (t) => {
  const received: string[] = [];
  const server = http2.createSecureServer({ cert, key, allowHTTP1: true });
  server.on("request", (req, res) => {
    received.push(req.url!);
    if (
      req.httpVersionMajor !== 2 ||
      !req.headers["user-agent"]?.includes("Mozilla/5.0")
    ) {
      res.writeHead(403).end();
      return;
    }
    switch (req.url) {
      case "/redirect":
        res.writeHead(302, { location: "/product?ref=gift" }).end();
        break;
      case "/private":
        res.writeHead(302, { location: "http://127.0.0.1/private" }).end();
        break;
      case "/loop":
        res.writeHead(302, { location: "/loop" }).end();
        break;
      case "/large":
        res
          .writeHead(200, { "content-type": "text/html" })
          .end(Buffer.alloc(MAX_HTML_BYTES + 1));
        break;
      case "/merchant":
        res
          .writeHead(200, { "content-type": "text/html" })
          .end(Buffer.alloc(3 * 1024 * 1024));
        break;
      case "/encoded":
        res
          .writeHead(200, {
            "content-type": "text/html",
            "content-encoding": "gzip",
          })
          .end("unsupported");
        break;
      case "/type":
        res.writeHead(200, { "content-type": "application/json" }).end("{}");
        break;
      case "/slow":
        break;
      default:
        res
          .writeHead(200, { "content-type": "text/html; charset=utf-8" })
          .end("<title>Produit</title>");
    }
  });
  const legacy = https.createServer({ cert, key }, (_req, res) => {
    res.writeHead(200, { "content-type": "image/png" }).end("image fixture");
  });
  server.listen(0, "127.0.0.1");
  legacy.listen(0, "127.0.0.1");
  await Promise.all([once(server, "listening"), once(legacy, "listening")]);
  let port = (server.address() as AddressInfo).port;
  let trustCertificate = true;
  const connect = tls.connect;
  t.mock.method(tls, "connect", (options: tls.ConnectionOptions) => {
    // No external traffic: verify pinning, then route the socket to our local fixture.
    assert.equal(options.rejectUnauthorized, undefined);
    assert.ok(options.lookup);
    options.lookup("8.8.8.8", {}, (_error, address, family) => {
      assert.equal(address, "8.8.8.8");
      assert.equal(family, 4);
    });
    return connect({
      ...options,
      host: "127.0.0.1",
      port,
      lookup: undefined,
      servername: "fetch.test",
      ca: trustCertificate ? cert : undefined,
    });
  });
  try {
    const product = await fetchSafe("https://8.8.8.8/redirect");
    assert.equal(product.body.toString(), "<title>Produit</title>");
    assert.equal(product.url, "https://8.8.8.8/product?ref=gift");
    assert.deepEqual(received, ["/redirect", "/product?ref=gift"]);
    assert.equal(
      (await fetchSafe("https://8.8.8.8/merchant")).body.length,
      3 * 1024 * 1024,
    );
    await assert.rejects(fetchSafe("https://8.8.8.8/private"), /privées/);
    await assert.rejects(fetchSafe("https://8.8.8.8/loop"), /redirections/);
    await assert.rejects(fetchSafe("https://8.8.8.8/large"), /volumineux/);
    await assert.rejects(fetchSafe("https://8.8.8.8/encoded"), /Encodage/);
    await assert.rejects(fetchSafe("https://8.8.8.8/type"), /Format/);
    await assert.rejects(
      fetchSafe("https://8.8.8.8/slow", "html", 0, Date.now() + 150),
    );
    trustCertificate = false;
    await assert.rejects(
      fetchSafe("https://8.8.8.8/product"),
      /self-signed certificate/,
    );
    trustCertificate = true;
    port = (legacy.address() as AddressInfo).port;
    const image = await fetchSafe("https://8.8.8.8/image", "image");
    assert.equal(image.type, "image/png");
    assert.equal(image.body.toString(), "image fixture");
  } finally {
    server.close();
    legacy.close();
    await Promise.all([once(server, "close"), once(legacy, "close")]);
  }
});
