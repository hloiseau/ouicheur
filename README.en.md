# Ouicheur

[Français](README.md) · [Feature and upgrade guide](docs/product-features.md)

Ouicheur is a self-hosted, MIT-licensed personal Ouichlist. One owner manages gifts
and events; visitors can reserve a gift without an account or contribute directly
through the owner's PayPal.Me link. The interface supports English and French.
Ouicheur never holds money or automatically buys products.

![Ouicheur with fictional demonstration data](docs/screenshots/wishlist-desktop.png)

[Mobile view](docs/screenshots/wishlist-mobile.png) ·
[Instance settings and backups](docs/screenshots/instance-desktop.png)
— screenshots use synthetic data; new installations start empty.

## Quick start

With Docker and Docker Compose installed:

```sh
cp .env.example .env
docker compose up -d --build
docker compose logs app
```

Open http://localhost:3000 and enter the private setup code from the container logs.
Create the owner account; there is no default password. PayPal.Me is optional.
Keep the data and backup volumes when upgrading; do not use `docker compose down -v`.
Set `APP_ORIGIN` to your public HTTPS address when using a reverse proxy.

For TrueNAS, see [the installation guide](docs/truenas.md) and
[the YAML example](compose.truenas.yaml). Catalog submissions are on hold while the
product update is validated. Existing image tags do not include an unmerged PR.

## Features

- Multiple event lists, categories, quantities and profile customization.
- Rename, add and reorder priorities in **My wishes → Manage priorities**. Choose the level shown with a heart; all levels are available in the priority filter. Existing assignments are preserved.
- Owners can mark a gift as bought with a reversible switch on its card or detail page. **Pause this wish** blocks new contributions and reservations while keeping existing records.
- Public, unlisted and owner-only lists; revocable private links and local QR codes.
- Anonymous gift reservations with a personal management link and 14-day expiration.
- Direct PayPal.Me contributions, optional approval before counting, auditable payment corrections.
- Product metadata extraction, dated price/availability refresh with explicit goal confirmation.
- Amazon, Throne, CSV and JSON imports with editable previews and duplicate controls.
- Mobile quick add and an authenticated PWA share target on compatible browsers.
- Downloadable complete backups, daily/weekly scheduling and configurable retention.
- Optional self-hosted ntfy notifications with durable retries and generic messages.
- Sanitized diagnostics, paginated histories, image storage limits and controlled cleanup.

Private links are bearer credentials: anyone receiving a link can pass it on.
Revocation blocks future requests but cannot erase downloaded copies. The owner
profile is shared across accessible lists. Payment declarations are not automatic
proof that PayPal received money. Enable strict contribution mode when approval
should precede counting a declaration.

PWA installation and share-target support depend on the browser and OS. HTTPS is
required outside localhost; the normal `/add` page is always available. Private
content is never cached for offline use.

## Development and tests

Node.js 24 LTS is required.

```sh
npm ci
npm run browser:install
npm run dev
```

Production: `npm run build && npm start`. Tests: `npm test`, `npm run check`,
`npm run test:fetch-browser`, `npm run test:e2e` and `npm run test:docker`.
The CI validates native AMD64 and ARM64 before publishing their shared image tag.

See [contributing](CONTRIBUTING.md), [security](SECURITY.md),
[the changelog](CHANGELOG.md), [MIT license](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md). Merchant images and user content
retain their original rights.
