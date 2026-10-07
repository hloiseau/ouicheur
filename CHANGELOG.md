# Changelog

## 1.4.0 — une interface plus simple, en clair et en sombre

- Thèmes Appareil, Clair et Sombre disponibles dans les en-têtes, avec préférence mémorisée et application dès le premier affichage.
- Listes, catégories, recherche et filtres réorganisés ; profil, navigation propriétaire et formulaires plus compacts sur mobile.
- Cartes centrées sur le produit et son budget, images mieux dimensionnées, descriptions longues repliables et parcours « Offrir ou participer » plus lisible.
- Pagination avec compteur et reprise après une erreur temporaire, sans perdre les produits déjà chargés ni afficher un faux résultat vide.
- Imports plus fiables face aux salles d’attente marchandes et aux liens redirigés vers un catalogue ; indication explicite lorsqu’aucun prix n’est récupéré.
- Revue visuelle sur 47 produits de 16 domaines, dans les deux thèmes et à plusieurs largeurs ; régressions de thème, pagination et accessibilité couvertes.
- Aucun changement du schéma de données ni nouvelle variable d’environnement.

Voir les [notes de mise à jour et de validation](docs/releases/1.4.0.md).

## 1.3.3 — persistance commune des cadeaux

- Création, lecture et modification des cadeaux avec budget, quantités, variantes et offres alternatives dans un contrat partagé SQLite/PostgreSQL.
- Mêmes validations, protections des surprises, réservations actives, historique de contributions et audit atomique ; importateurs SQLite conservés.
- Migration PostgreSQL additive depuis le schéma expérimental précédent, isolation des références par tenant et protection des écritures concurrentes.
- Le mode auto-hébergé reste SQLite ; aucun transfert de données ni runtime web PostgreSQL complet.

Voir les [notes de version et limites](docs/releases/1.3.3.md). La publication stable suit les contrôles CI.

## 1.3.2 — contrat de persistance commun

- Règles de création/modification des listes et d’état d’achat partagées par les adaptateurs SQLite et PostgreSQL.
- Service asynchrone utilisé par les routes concernées ; transactions SQLite courtes et synchrones conservées.
- Adaptateur PostgreSQL expérimental limité à cette tranche : isolation par tenant, migrations contrôlées, audit atomique et confirmations concurrentes sans double effet.
- Tests contractuels communs et PostgreSQL réel en CI. L’application complète reste en SQLite ; aucune migration des données existantes ni installation PostgreSQL obligatoire.

Voir les [notes de mise à jour et limites](docs/releases/1.3.2.md). La publication stable suit les contrôles CI.

## 1.3.1 — la langue du navigateur dès la première visite

- Détection du français et de l’anglais à partir des préférences du navigateur, variantes régionales et ordre de préférence inclus.
- Choix manuel existant conservé et prioritaire ; repli en anglais si aucune langue prise en charge n’est indiquée.
- Même langue dès le rendu serveur, dans les titres, formulaires, erreurs API et liens de partage.
- Aucune géolocalisation, aucun service externe ni migration de données.

Voir les [notes de mise à jour](docs/releases/1.3.1.md). La publication stable suit les contrôles CI.

## 1.3.0 — participer sans PayPal

- Déclaration d’un virement déjà effectué, sans compte visiteur ni PayPal configuré.
- Promesses de participation d’un montant choisi, affichées séparément du financement.
- Lien privé pour déclarer ensuite le versement ou annuler la promesse.
- Confirmation de réception et filtre des promesses dans l’administration ; aucun double comptage.
- Modes normal/strict, centimes, plafonds, accès privés et réservations préservés.
- Migration additive 024 : les contributions existantes conservent leur parcours PayPal.
- Promesses actives préservées par l’expiration et le nettoyage ; interface française et anglaise.

Voir les [notes de mise à jour](docs/releases/1.3.0.md). La publication stable suit les contrôles CI.

## 1.2.0 — finalisation du socle libre

Le code est préparé pour 1.2.0 ; voir les [notes de version](docs/releases/1.2.0.md)
pour distinguer la fusion dans `main` de la publication du tag stable.

- Coordination secrète, variantes/offres alternatives, expériences/services/fait main.
- Outils de listes, préférences choisies, exports/impression, ajout depuis le navigateur.
- Calendriers récurrents et privés, notifications opt-in, courriel vérifié, alertes de prix bornées.
- Suivi personnel des cadeaux, journal reçu/remerciements, modèles privés d’occasions.
- Échanges familiaux avec exclusions, consentement et questions facultatives contrôlées.
- Pagination, images responsives, quotas de travail, diagnostic par commit et formulaires de retours.
- Migrations 016 à 023 ; restauration testée depuis chaque schéma historique.
- Inventaires npm et image finale, notices, maintenance des dépendances par PR.

Les fonctionnalités ci-dessous, développées avant la finalisation, font aussi partie de 1.2.0.

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
