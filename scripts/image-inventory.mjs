import { execFileSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";

// Run inside the final image, after installing Chromium and its Debian dependencies.
const destination = "third-party-licenses";
mkdirSync(destination, { recursive: true });
const debian = execFileSync(
  "dpkg-query",
  [
    "-W",
    "-f=${binary:Package}\t${Version}\t${Architecture}\t${source:Package}\t${source:Version}\n",
  ],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .map((line) => {
    const [name, version, architecture, source, sourceVersion] =
      line.split("\t");
    return {
      name,
      version,
      architecture,
      source: source || name,
      source_version: sourceVersion || version,
      source_url: `https://sources.debian.org/src/${encodeURIComponent(source || name)}/${encodeURIComponent(sourceVersion || version)}/`,
    };
  });
const browserRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || "/ms-playwright";
const installed = readdirSync(browserRoot).filter((n) =>
  /^(chromium|ffmpeg)/.test(n),
);
const registry = JSON.parse(
  readFileSync("node_modules/playwright-core/browsers.json", "utf8"),
).browsers;
const browsers = registry.filter((b) =>
  installed.some((n) => n.startsWith(b.name.replaceAll("-", "_") + "-")),
);
const notices = [];
function collect(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (
      /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(entry.name)
    ) {
      const target = join(
        destination,
        "browsers",
        path.slice(browserRoot.length + 1),
      );
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(path, target);
      notices.push(target);
    }
  }
}
collect(browserRoot);
if (!browsers.length || !notices.length)
  throw Error("Chromium inventory or notices are missing");
const native = {};
if (existsSync("node_modules/@img")) {
  for (const name of readdirSync("node_modules/@img")) {
    const path = join("node_modules/@img", name, "versions.json");
    if (existsSync(path)) native[name] = JSON.parse(readFileSync(path, "utf8"));
  }
}
writeFileSync(
  join(destination, "runtime-inventory.json"),
  JSON.stringify(
    {
      version: JSON.parse(readFileSync("package.json", "utf8")).version,
      revision: process.env.NEXT_PUBLIC_BUILD_REVISION || "local",
      architecture: process.arch,
      platform: process.platform,
      node: process.versions,
      debian,
      browsers,
      browser_notices: notices,
      native,
      sources: {
        node: `https://nodejs.org/dist/${process.version}/`,
        chromium: "https://chromium.googlesource.com/chromium/src/",
        sharp_libvips: "https://github.com/lovell/sharp-libvips",
        debian: "https://sources.debian.org/",
      },
    },
    null,
    2,
  ),
);
