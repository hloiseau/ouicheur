### App Name

Ouicheur

### App Description

An MIT-licensed, self-hosted personal wishlist with English and French interfaces,
product-link imports, local images and optional direct PayPal.Me contributions.
One owner per instance; visitors do not need accounts. Declared contributions are
not payment-provider-verified transactions.

### App Website / Github Repo

https://github.com/hloiseau/ouicheur

### Docker Installation Documentation

https://github.com/hloiseau/ouicheur/blob/main/docs/truenas.md

### App Icon URL

https://raw.githubusercontent.com/hloiseau/ouicheur/main/public/icon.png

### Docker Image

`ghcr.io/hloiseau/ouicheur:sha-285b41eca5adb181a9a340dea10a636d12865969`

### App Category

Productivity

### Requirements Checklist

- [x] The app is actively maintained
- [x] The app has official Docker images available
- [ ] The app has versioned image tags available
- [x] The app is open source or has a free tier
- [ ] I have tested the Docker installation locally

### Additional Information

This is an initial app proposal, not a claim of native TrueNAS validation. The
image has a commit-specific tag, but no numbered release has been published yet.
Anonymous registry access and linux/amd64 image metadata were checked on
2026-09-28. Its digest is
`sha256:9915f152b0c53f8c41f68bf1aafd6375d0f17d6eb0e721e4a6720842bde93825`.

The existing upstream CI passes unit tests, browser workflows and a Docker smoke
test covering initial setup, restart and backup/restore:
https://github.com/hloiseau/ouicheur/actions/runs/36264329576.
No new native TrueNAS or Unraid installation has been performed for this request.

Deployment contract: one application container, TCP 3000, SQLite and images under
`/app/data`, backups under `/app/backups`, default image UID/GID 1000:1000.
`APP_ORIGIN` configures the public origin; `TRUST_PROXY` defaults to 0. The image
contains Chromium for public product imports and exposes `/api/health`.
It requires no host networking, privileged application container or Docker socket.
First-run setup uses a private code read from the container logs.

A candidate `ix-dev/community` package is being prepared upstream, with separate
data/backup storage, configurable UID/GID, port and origin, plus two rendering
scenarios. Remaining work includes a corrected numbered image, complete native
component notices, official catalog validation and real NAS install/upgrade tests.
The original application code has a full MIT license; the current image needs an
explicit copy of that license, which is included in the preparation proposal.

Please consider this a request for inclusion and early maintainer feedback, not
a request to merge an untested application into the catalog immediately.
