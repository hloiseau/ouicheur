# Changelog

## Unreleased — 1.2 development

- Comptes coorganisateurs par invitation à usage unique et droits par liste,
  profils familiaux avec destinataire lié au mode surprise, espace de préparation
  partagé et gestion des sessions propre à chaque compte. Migration 015 sans
  changement des visibilités existantes ; invitations révoquées à la restauration.

- Écran Accès et sécurité : appareils connectés, révocation individuelle ou des
  autres sessions, changement de mot de passe conservant l’appareil courant avec
  rotation du jeton. Migration 014, récupération locale conservée et protection
  contre les connexions concurrentes à une réinitialisation.

- Priorités personnalisables : noms, nouveaux niveaux, ordre de tri et choix du
  niveau affiché avec un cœur. Filtres et formulaires reprennent ces réglages.
  Migration 013 préservant les affectations existantes, export et sauvegardes inclus.
- Interrupteur propriétaire « Cadeau acheté » sur les cartes et fiches, réversible
  et compatible avec le mode surprise. Le formulaire propose désormais
  « Mettre cette envie en pause », avec une explication de ses effets.
- Retrait du parcours personnel ChatGPT / Sendico de l’interface.

- Suggestions des proches activables par liste, modération par le propriétaire,
  acceptation atomique en une seule envie et suivi privé par lien révocable.
  Le pseudo et le message ne sont pas publiés automatiquement. Migration 012,
  limites de fréquence et de stockage, aucune extraction à l’envoi invité.
  Voir [le parcours et ses limites](docs/suggestions.md).

- Optional surprise mode per list, with server-side redaction for the signed-in
  recipient, including the public preview, API and RSC responses.
- Explicit reveal for one session, protected administrative exports/history and
  suppression of reservation notifications; financial totals stay accurate.
- Migration `011` preserves existing behavior by default. See
  [surprise mode](docs/surprise-mode.md) for limits and backup/restore behavior.

- Budget filters by unit price, total goal or remaining funding, with explicit
  currency selection and inclusive minimum/maximum amounts.
- Availability filter, additional monetary/name sorts and accent-insensitive
  search, combined with existing lists, categories and favorites.
- List-scoped navigation counts and pagination reset when filters change.
- A sourced review of 16 wishlist alternatives and a prioritized GitHub backlog
  for the self-hosted edition.

It is not the complete 1.2.0 release.

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
