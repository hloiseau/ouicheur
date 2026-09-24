import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

process.env.DATA_DIR = resolve(process.env.DATA_DIR || "data");
const container = existsSync("server.js");
process.env.HOSTNAME = container ? "0.0.0.0" : "127.0.0.1";
process.env.NEXT_TELEMETRY_DISABLED = "1";
await import("./prepare-setup.ts");
if (!container) {
  cpSync("public", ".next/standalone/public", { recursive: true });
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
}
await import(
  pathToFileURL(resolve(container ? "server.js" : ".next/standalone/server.js"))
    .href
);
