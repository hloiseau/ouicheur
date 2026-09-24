import { cpSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

process.env.DATA_DIR = resolve(process.env.DATA_DIR || "data");
process.env.HOSTNAME = "127.0.0.1";
process.env.NEXT_TELEMETRY_DISABLED = "1";
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
await import(pathToFileURL(resolve(".next/standalone/server.js")).href);
