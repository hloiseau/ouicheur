import { resolve } from "node:path";
import {
  fetchSafe,
  connectionReset,
  MAX_HTML_BYTES,
  resolvePublic,
} from "./fetch-safe";
import { AppError, webUrl } from "./validation";

// Chromium's network stack can read public pages refused by Node's TLS client.
// It only downloads the document: no page scripts, assets, credentials or stored session.
export async function fetchHtml(input: string, deadline = Date.now() + 15000) {
  try {
    return await fetchSafe(input, "html", 0, deadline);
  } catch (error) {
    const refused =
      error instanceof AppError && [403, 429].includes(Number(error.values[0]));
    if (!refused && !connectionReset(error)) throw error;
    return fetchBrowserHtml(input, deadline);
  }
}
export async function fetchBrowserHtml(
  input: string,
  deadline: number,
  hops = 0,
): Promise<Awaited<ReturnType<typeof fetchSafe>>> {
  if (hops > 3)
    throw new AppError("Trop de redirections ou serveur trop lent.");
  const url = webUrl(input);
  const address = await resolvePublic(url, undefined, deadline);
  const remaining = () => Math.max(1, deadline - Date.now());
  if (Date.now() >= deadline)
    throw new AppError("Trop de redirections ou serveur trop lent.");
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(".local/pw-browsers");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    headless: true,
    timeout: remaining(),
    args: [
      `--host-resolver-rules=MAP ${url.hostname} ${address.family === 6 ? `[${address.address}]` : address.address}`,
      "--disable-quic",
      "--no-proxy-server",
    ],
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let redirect: string | undefined;
  let redirects = hops;
  try {
    let fail: (error: Error) => void;
    const interrupted = new Promise<never>((_resolve, reject) => {
      fail = reject;
      timer = setTimeout(
        () =>
          reject(new AppError("Trop de redirections ou serveur trop lent.")),
        remaining(),
      );
    });
    const download = async () => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        serviceWorkers: "block",
        acceptDownloads: false,
        extraHTTPHeaders: {
          "Accept-Encoding": "identity",
          // Keep document negotiation explicit when CDP intercepts the navigation.
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const { frameTree } = await cdp.send("Page.getFrameTree");
      let navigations = 0;
      // CDP pauses EACH redirect before connection, including IP-literal destinations.
      // A Playwright route alone does not intercept every redirected URL.
      cdp.on("Fetch.requestPaused", (event) => {
        const mainDocument =
          event.resourceType === "Document" &&
          event.frameId === frameTree.frame.id;
        const allowed =
          mainDocument &&
          new URL(event.request.url).origin === url.origin &&
          hops + navigations < 4;
        if (mainDocument) {
          navigations++;
          if (!allowed) {
            redirect = event.request.url;
            redirects = hops + navigations - 1;
            fail(new AppError("Cette destination réseau est interdite."));
          }
        }
        void cdp
          .send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", {
            requestId: event.requestId,
            ...(!allowed ? { errorReason: "BlockedByClient" } : {}),
          })
          .catch(fail);
      });
      await cdp.send("Fetch.enable", {
        patterns: [{ urlPattern: "*", requestStage: "Request" }],
      });
      const max = MAX_HTML_BYTES;
      let bytes = 0;
      cdp.on("Network.dataReceived", (event) => {
        bytes += event.dataLength;
        if (bytes > max) fail(new AppError("Fichier distant trop volumineux."));
      });
      await cdp.send("Network.enable");
      const response = await page.goto(url.toString(), {
        waitUntil: "commit",
        timeout: remaining(),
      });
      if (!response || response.status() !== 200)
        throw new AppError(
          "Source inaccessible (HTTP {0}). Aucun contournement effectué.",
          400,
          [response?.status() || 0],
        );
      const type = (response.headers()["content-type"] || "")
        .split(";")[0]
        .trim();
      if (!["text/html", "application/xhtml+xml"].includes(type))
        throw new AppError("Format distant non autorisé.");
      if (Number(response.headers()["content-length"] || 0) > max)
        throw new AppError("Fichier distant trop volumineux.");
      const body = await response.body();
      if (body.length > max)
        throw new AppError("Fichier distant trop volumineux.");
      return { body, type, url: response.url() };
    };
    return await Promise.race([download(), interrupted]);
  } catch (error) {
    if (!redirect) throw error;
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
  // New origin, new DNS validation and pinned connection, before following the redirect.
  return fetchBrowserHtml(redirect!, deadline, redirects);
}
