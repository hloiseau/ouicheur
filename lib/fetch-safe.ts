import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { AppError, webUrl } from "./validation";

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
export async function resolvePublic(url: URL, resolver = lookup) {
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
          4000,
        );
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new AppError(
        "La résolution DNS pointe vers une adresse privée ou réservée.",
      );
    return addresses[0];
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
  const address = await resolvePublic(url);
  const max = kind === "html" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  const result = await new Promise<{
    body: Buffer;
    type: string;
    redirect?: string;
  }>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).get(
      url,
      {
        agent: false,
        // Pin the validated DNS address for this connection, including every redirect.
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
        headers: {
          "User-Agent": "Wishlister/1.0 (personal wishlist metadata)",
          "Accept-Encoding": "identity",
          Accept:
            kind === "html"
              ? "text/html,application/xhtml+xml"
              : "image/jpeg,image/png,image/webp",
        },
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      },
      (response) => {
        const status = response.statusCode || 0;
        const type = String(response.headers["content-type"] || "")
          .split(";")[0]
          .trim();
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.destroy();
          if (!location)
            return reject(new AppError("Redirection sans destination."));
          return resolve({
            body: Buffer.alloc(0),
            type,
            redirect: new URL(location, url).toString(),
          });
        }
        if (status !== 200) {
          response.destroy();
          return reject(
            new AppError(
              `Source inaccessible (HTTP ${status}). Aucun contournement effectué.`,
            ),
          );
        }
        if (
          response.headers["content-encoding"] &&
          response.headers["content-encoding"] !== "identity"
        ) {
          response.destroy();
          return reject(new AppError("Encodage distant non pris en charge."));
        }
        if (
          kind === "html"
            ? !["text/html", "application/xhtml+xml"].includes(type)
            : !["image/jpeg", "image/png", "image/webp"].includes(type)
        ) {
          response.destroy();
          return reject(new AppError("Format distant non autorisé."));
        }
        if (Number(response.headers["content-length"] || 0) > max) {
          response.destroy();
          return reject(new AppError("Fichier distant trop volumineux."));
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > max) {
            response.destroy();
            reject(new AppError("Fichier distant trop volumineux."));
          } else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({ body: Buffer.concat(chunks), type }),
        );
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
  if (result.redirect)
    return fetchSafe(result.redirect, kind, hops + 1, deadline);
  return { body: result.body, type: result.type, url: url.toString() };
}
