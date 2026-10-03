import type { DatabaseSync } from "node:sqlite";
import { buildInfo } from "./build-info.ts";

// Allowlist: no records, counts, addresses, paths, tokens or environment dump.
export function supportInfo(db: DatabaseSync) {
  return {
    version: buildInfo.version,
    revision: buildInfo.revision,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    sqlite: String(
      db.prepare("SELECT sqlite_version() version").get()!.version,
    ),
    schema: String(
      db.prepare("SELECT MAX(name) name FROM migrations").get()!.name || "none",
    ),
  };
}
export type SupportInfo = ReturnType<typeof supportInfo>;
