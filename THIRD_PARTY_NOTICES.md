# Third-party software

Ouicheur's own code and documentation are licensed under [MIT](LICENSE),
copyright 2026 Hugo Loiseau. Dependencies and container components retain their
own licenses; the image's MIT label describes Ouicheur, not every bundled file.

Direct runtime dependencies in the reviewed lockfile:

| Component         | Version | Declared license | Upstream                                |
| ----------------- | ------- | ---------------- | --------------------------------------- |
| Next.js           | 16.3.6  | MIT              | https://github.com/vercel/next.js       |
| React / React DOM | 19.3.0  | MIT              | https://github.com/facebook/react       |
| Cheerio           | 1.2.0   | MIT              | https://github.com/cheeriojs/cheerio    |
| csv-parse         | 7.0.2   | MIT              | https://github.com/adaltas/node-csv     |
| ipaddr.js         | 2.5.0   | MIT              | https://github.com/whitequark/ipaddr.js |
| Playwright Core   | 1.63.0  | Apache-2.0       | https://github.com/microsoft/playwright |
| Sharp             | 0.35.4  | Apache-2.0       | https://github.com/lovell/sharp         |
| node-qrcode       | 1.5.4   | MIT              | https://github.com/soldair/node-qrcode  |
| node-tar          | 7.5.22  | BlueOak-1.0.0    | https://github.com/isaacs/node-tar      |
| Zod               | 4.6.5   | MIT              | https://github.com/colinhacks/zod       |

The Linux image also includes Node.js, Debian packages, Chromium and native
libraries. In particular, the prebuilt libvips package used by Sharp declares
`LGPL-3.0-or-later`; its component versions are in
`node_modules/@img/sharp-libvips-linux-x64/versions.json`. Its upstream build
source is https://github.com/lovell/sharp-libvips. The lockfile also includes
`caniuse-lite` data under `CC-BY-4.0`, upstream https://github.com/browserslist/caniuse-lite.

The Dockerfile uses Next.js standalone output and also collects the production
dependency license/notice texts and package inventory into
`/app/third-party-licenses` before reducing the runtime files. A CycloneDX npm
SBOM is included as `npm-sbom.cdx.json`; it covers npm build and runtime packages,
not the Debian base or Chromium system dependencies. Build-only tools are removed
before collecting the production inventory in `packages.json`. The image explicitly
includes this file and Ouicheur's license. Debian notices are normally under `/usr/share/doc`.
Do not strip bundled notices when reducing the image size.

This is a navigation aid, **not a complete license bundle, SBOM or compliance
certification**. Before a numbered public release, inventory the actual final
image, retain all required license/attribution texts and fulfill any applicable
source-availability obligations for bundled native components. A clean npm
vulnerability report does not establish license compliance. Imported merchant
images and user content are not relicensed by Ouicheur's MIT license.
