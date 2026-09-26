import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import http2 from "node:http2";
import tls from "node:tls";
import type { LookupFunction } from "node:net";
import { addAbortSignal, type Readable } from "node:stream";
import ipaddr from "ipaddr.js";
import { AppError, webUrl } from "./validation";

// Large merchant pages (notably Amazon) exceed 2 MiB before their product data.
export const MAX_HTML_BYTES = 8 * 1024 * 1024;
// Compatible with merchant browser detection while explicitly identifying our application.
export const HTTP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Ouicheur/1.0";

export function publicAddress(address: string) {
  try {
    const ip = ipaddr.parse(address);
    if (ip.range() !== "unicast") return false;
    if (ip.kind() === "ipv6") {
      const v6 = ip as ipaddr.IPv6;
      // Only global unicast; reject mapped/transition/documentation/reserved ranges.
      return (
        v6.match(ipaddr.parse("2000::") as ipaddr.IPv6, 3) &&
        !v6.match(ipaddr.parse("2001::") as ipaddr.IPv6, 23) &&
        !v6.match(ipaddr.parse("2002::") as ipaddr.IPv6, 16) &&
        !v6.match(ipaddr.parse("3fff::") as ipaddr.IPv6, 20)
      );
    }
    return true;
  } catch {
    return false;
  }
}
export function connectionReset(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    [
      "ECONNRESET",
      "EPIPE",
      "ERR_HTTP2_ERROR",
      "ERR_HTTP2_STREAM_ERROR",
    ].includes(String(error.code))
  );
}
export async function resolvePublic(
  url: URL,
  resolver = lookup,
  deadline = Date.now() + 4000,
) {
  if (
    (url.port && !["80", "443"].includes(url.port)) ||
    url.hostname.endsWith(".local") ||
    url.hostname === "localhost"
  )
    throw new AppError("Cette destination réseau est interdite.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(hostname)) {
    if (!publicAddress(hostname))
      throw new AppError("Les adresses privées ou réservées sont interdites.");
    return {
      address: hostname,
      family: ipaddr.parse(hostname).kind() === "ipv4" ? 4 : 6,
    };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      resolver(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AppError("Résolution DNS trop lente.")),
          Math.max(1, Math.min(4000, deadline - Date.now())),
        );
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new AppError(
        "La résolution DNS pointe vers une adresse privée ou réservée.",
      );
    // Prefer IPv4 when available: some hosts advertise IPv6 with unreliable routing.
    // All answers above remain validated, including the unused addresses.
    return addresses.find((address) => address.family === 4) || addresses[0];
  } finally {
    clearTimeout(timer);
  }
}
export async function fetchSafe(
  input: string,
  kind: "html" | "image" = "html",
  hops = 0,
  deadline = Date.now() + 15000,
): Promise<{ body: Buffer; url: string; type: string }> {
  if (hops > 3 || Date.now() >= deadline)
    throw new AppError("Trop de redirections ou serveur trop lent.");
  const url = webUrl(input);
  const address = await resolvePublic(url, undefined, deadline);
  const max = kind === "html" ? MAX_HTML_BYTES : 5 * 1024 * 1024;
  const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  let socket: tls.TLSSocket | undefined;
  let session: http2.ClientHttp2Session | undefined;
  let agent: https.Agent | undefined;
  let request: http.ClientRequest | http2.ClientHttp2Stream | undefined;
  let response: Readable | undefined;
  const result = await new Promise<{
    body: Buffer;
    type: string;
    redirect?: string;
  }>((resolve, reject) => {
    const receive = (
      stream: Readable,
      status: number,
      headers: http.IncomingHttpHeaders,
    ) => {
      response = stream;
      stream.on("error", reject);
      const type = String(headers["content-type"] || "")
        .split(";")[0]
        .trim();
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headers.location;
        if (!location)
          return reject(new AppError("Redirection sans destination."));
        return resolve({
          body: Buffer.alloc(0),
          type,
          redirect: location,
        });
      }
      if (status !== 200) {
        return reject(
          new AppError(
            "Source inaccessible (HTTP {0}). Aucun contournement effectué.",
            400,
            [status],
          ),
        );
      }
      if (
        headers["content-encoding"] &&
        headers["content-encoding"] !== "identity"
      ) {
        return reject(new AppError("Encodage distant non pris en charge."));
      }
      if (
        kind === "html"
          ? !["text/html", "application/xhtml+xml"].includes(type)
          : !["image/jpeg", "image/png", "image/webp"].includes(type)
      ) {
        return reject(new AppError("Format distant non autorisé."));
      }
      if (Number(headers["content-length"] || 0) > max) {
        return reject(new AppError("Fichier distant trop volumineux."));
      }
      let size = 0;
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > max) {
          stream.destroy();
          reject(new AppError("Fichier distant trop volumineux."));
        } else chunks.push(chunk);
      });
      stream.on("end", () => resolve({ body: Buffer.concat(chunks), type }));
    };
    // Pin the validated DNS address for both protocols and every redirect.
    const lookup: LookupFunction = (_host, options, callback) => {
      if (options.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    };
    const headers = {
      "user-agent": HTTP_USER_AGENT,
      "accept-encoding": "identity",
      accept:
        kind === "html"
          ? "text/html,application/xhtml+xml"
          : "image/jpeg,image/png,image/webp",
    };
    const http1 = () => {
      request = (url.protocol === "https:" ? https : http).get(
        url,
        { agent: agent || false, lookup, headers, signal },
        (res) => receive(res, res.statusCode || 0, res.headers),
      );
      request.on("error", reject);
    };
    if (url.protocol === "http:") return http1();

    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    socket = tls.connect({
      host: hostname,
      port: Number(url.port) || 443,
      servername: ipaddr.isValid(hostname) ? undefined : hostname,
      lookup,
      ALPNProtocols: ["h2", "http/1.1"],
    });
    socket.on("error", reject);
    addAbortSignal(signal, socket);
    socket.once("secureConnect", () => {
      if (socket!.alpnProtocol === "h2") {
        session = http2.connect(url.origin, {
          createConnection: () => socket!,
        });
        session.on("error", reject);
        const stream = session.request(
          { ":path": url.pathname + url.search, ...headers },
          { signal },
        );
        request = stream;
        stream.on("error", reject);
        stream.once("response", (res) =>
          receive(stream, res[":status"] || 0, res),
        );
        stream.end();
      } else {
        // Reuse the TLS socket whose certificate and destination were just checked.
        agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
        agent.createConnection = () => socket!;
        http1();
      }
    });
  }).finally(() => {
    response?.destroy();
    request?.destroy();
    session?.destroy();
    agent?.destroy();
    socket?.destroy();
  });
  if (result.redirect)
    return fetchSafe(
      new URL(result.redirect, url).toString(),
      kind,
      hops + 1,
      deadline,
    );
  return {
    body: result.body,
    type: result.type,
    url: url.toString(),
  };
}
