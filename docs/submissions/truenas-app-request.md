# Prepared TrueNAS app request — not submitted

### App Name

Ouicheur

### App Description

An MIT-licensed, self-hosted family wishlist with English and French interfaces,
product-link imports, local images, per-list coorganizers, revocable sessions,
reservations, surprise protection, reminders and gift exchanges. Visitors can
use shared lists without accounts. Optional direct PayPal.Me contributions are
declared payments, not payment-provider-verified transactions.

### App Website / Github Repo

https://github.com/hloiseau/ouicheur

### Docker Installation Documentation

https://github.com/hloiseau/ouicheur/blob/main/docs/truenas.md

### App Icon URL

https://raw.githubusercontent.com/hloiseau/ouicheur/main/public/icon.png

### Docker Image

`ghcr.io/hloiseau/ouicheur:sha-35e849507983f3e5139b7b4f34f13899214a8f46`

This commit reference is prepared for final 1.2.0 testing. Choose the published
stable tag and verified digest before submitting this request.

### App Category

Productivity

### Requirements Checklist

- [x] The app is actively maintained
- [x] The app has official Docker images available
- [ ] The app has versioned image tags available (verify the numbered release before submission)
- [x] The app is open source
- [ ] I have tested the final 1.2.0 Docker installation locally on TrueNAS

### Additional Information

The owner reported successful use on TrueNAS 25.04 and testers reported successful
use on Unraid before the final 1.2.0 additions. Their exact final install/upgrade
and restore results remain to be recorded in
https://github.com/hloiseau/ouicheur/issues/45.

The public CI tests Linux AMD64 and ARM64, database migrations, browser workflows,
accessibility and real Docker setup/restart/backup/restore. It preserves MIT and
dependency notices and produces npm and final-runtime inventories. These checks
do not certify native catalog installation. The release notes identify behavior
changes and restore effects:
https://github.com/hloiseau/ouicheur/blob/main/docs/releases/1.2.0.md.

Deployment contract: one application container, TCP 3000, SQLite and images under
`/app/data`, backups under `/app/backups`, default image UID/GID 1000:1000.
`APP_ORIGIN` configures the public origin; `TRUST_PROXY` defaults to 0. The image
contains Chromium for public product imports and exposes `/api/health`.
It requires no host networking, privileged application container or Docker socket.
First-run setup uses a private code read from the container logs.

The candidate `ix-dev/community` package uses library 2.3.15 and separate data/backup
storage, configurable UID/GID, port and origin. Both ixVolume and host-path
scenarios passed preliminary rendering with the pinned upstream library. Before
submission, run the official catalog Docker validation, regenerate metadata,
record the final NAS results and confirm the stable image/digest.

The project owner will decide when to submit; this file has not been sent to
catalog maintainers. See
https://github.com/hloiseau/ouicheur/blob/main/deploy/truenas/README.md.
