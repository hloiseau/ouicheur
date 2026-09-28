import {
  mkdirSync,
  readdirSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";

// Run after npm prune: retain attribution from the actual production dependency tree.
const destination = "third-party-licenses";
const packages = [];
function walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) walk(path);
    else {
      if (entry.name === "package.json") {
        try {
          const p = JSON.parse(readFileSync(path, "utf8"));
          if (p.name && p.version)
            packages.push({
              name: p.name,
              version: p.version,
              license: p.license || "see notices",
              path,
            });
        } catch {}
      }
      if (
        /^(licen[cs]e|copying|notice|copyright|authors)([._-]|$)/i.test(
          entry.name,
        ) ||
        entry.name === "versions.json"
      ) {
        const target = join(destination, path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(path, target);
      }
    }
  }
}
walk("node_modules");
mkdirSync(destination, { recursive: true });
writeFileSync(
  join(destination, "packages.json"),
  JSON.stringify(packages, null, 2),
);
copyFileSync("package-lock.json", join(destination, "package-lock.json"));
