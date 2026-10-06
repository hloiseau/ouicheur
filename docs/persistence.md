# Catalog persistence

Version 1.3.2 introduces a small asynchronous catalog contract shared by SQLite and PostgreSQL. The existing application still uses SQLite by default. No database server or configuration change is required for existing installations.

The implemented slice covers owner creation/editing of list metadata and changing a gift's purchased status. Validation, surprise-disclosure rules, share revocation decisions and audit decisions live in `lib/catalog.ts`. The existing HTTP endpoints use `catalogService` with `SqliteCatalogStore`; synchronous internal callers keep compatibility facades using the same rules. SQLite transactions contain no `await`.

`PostgresCatalogStore` accepts a pool compatible with node-postgres and a **server-verified tenant UUID**. It uses transaction-local tenant context, a single connection per transaction, row locks and an audit record committed atomically with each mutation. Table policies enforce tenant scope; the runtime role must not own the tables, be a superuser or have `BYPASSRLS`. Application permissions remain necessary inside each tenant. The `Access` object is trusted server context, never a request payload. RLS is not authentication or protection against a compromised application with DB credentials.

The driver is injected; `pg` is only a development dependency of this repository. Integrators supply their own bounded pool and verified TLS settings. Separate migration credentials from runtime credentials. `migrateCatalog` applies the checksum-verified migration under a transaction-scoped advisory lock. `provisionCatalogTenant` and `grantCatalogRuntime` are administrative operations, not runtime HTTP endpoints. Role creation and secret management belong to the deployment operator.

The initial PostgreSQL schema is intentionally partial: lists, purchase state, per-tenant reveal state and audit. It **does not implement full gift creation, login, financial records, reservations, uploads, workers or a data migration from SQLite**. Do not point the existing application at PostgreSQL or infer whole-application support from these contracts. Subsequent slices must extend the common model and adapters without duplicating domain rules.

## Verification

`npm test` runs the existing regression suite and the catalog contract on SQLite. `npm run test:postgres` runs the same contract plus PostgreSQL isolation/concurrency tests against a real server. It requires `POSTGRES_TEST_URL` pointing to an empty disposable database named `ouicheur_test_*`, with permission to create test roles and the schema. Test users and data are synthetic; use a disposable server, as the test-created schema and roles are retained until that server is removed. The test suite refuses an existing `ouicheur` schema and never silently skips when PostgreSQL is absent.

CI provisions PostgreSQL 18 separately from the application images. The suite checks shared business behavior, rollback after audit failure, default-deny RLS, cross-tenant writes and composite foreign keys, pooled-connection context after commit/error, owner-role rejection, concurrent migrations, migration checksums, and idempotent purchase changes from two independent pools. Two pools are not proof of a complete multi-replica web application or of capacity under load.

The PostgreSQL SQL is not a migration for the application's SQLite schema. Do not execute it using the existing SQLite management commands.
