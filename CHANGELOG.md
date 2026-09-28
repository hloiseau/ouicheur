# Changelog

## 1.1.0 — unreleased, product completion

- Multiple lists and dated events, public/unlisted/private visibility, archival,
  revocable sharing, image authorization and locally generated QR codes.
- Anonymous reservations with quantity locking, expiry, cancellation and purchase
  confirmation; direct purchases and funding are kept mutually exclusive.
- Optional strict contribution approval, preserving legacy counting by default.
- Authenticated mobile quick add and PWA share target, without private offline caches.
- Complete downloadable backups, scheduling, retention and sanitized health reports.
- Optional ntfy notification queue with retries and no personal content in messages.
- Manual price and stock refresh with dated comparison and explicit application.
- Paginated administrative histories, controlled cleanup and image disk limits.
- Native AMD64/ARM64 CI and a smaller standalone runtime with retained license notices.
- English quick start, product/upgrade guide and migration/concurrency/restore tests.

Migration `010` assigns existing wishes to the public `default` list. Gift IDs,
quantities, goals, currencies and financial entries are preserved. Existing
Docker volume names stay unchanged. Back up before upgrading. Rollback requires
the matching database backup, not just an older container image.

Catalog submissions and numbered release publication are deferred until validation.
