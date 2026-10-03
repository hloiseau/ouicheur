# Contributing to Ouicheur

Ouicheur is a self-hosted Ouichlist with one instance owner and invited family
accounts/coorganizers. Discuss
larger changes in a GitHub issue before implementing them, especially changes
to permissions, automatic payments or new external services.

Use Node 24 and the committed lockfile. Start with `npm ci`, then run
`npm run check`, `npm test` and `npm run build`. For browser or network changes,
install Chromium with `npm run browser:install` and run `npm run test:e2e` and
`npm run test:fetch-browser`. Docker changes also need `npm run test:docker`
after building `ouicheur:local`. GitHub Actions runs these checks on pull requests.

Keep English and French messages consistent. Use synthetic fixtures and isolated
data directories. Do not include real wishlist contents, payment references,
credentials or personal server configuration in issues, screenshots or commits.

Describe the problem, resulting behavior and verification in each pull request.
Preserve existing data volumes and migrations. Never describe a declared or
manually approved contribution as a provider-verified payment.

Contributions to this repository are made under its [MIT license](LICENSE).
Security reports follow [SECURITY.md](SECURITY.md).

## Triage and maintenance

Use the Bug, NAS feedback or Feature forms. Start with the smallest synthetic
reproduction, assess impact/frequency/effort, then fix and add a regression only
where it protects meaningful behavior. Close with a verified commit and ask the
reporter to retry that case. Prioritize data loss, confidentiality, blocked
installation/update, then recurring UX problems.

Dependabot proposes npm, GitHub Actions and Docker base updates weekly. Patch
updates are grouped where appropriate; nothing auto-merges. Native Debian and
Chromium components are covered by the actual image inventory, not by the npm
SBOM alone. Updating Playwright/Node requires the network and container tests.

`main` is the development channel. Numbered versions are stable snapshots after
verification. Never move a published version tag; fix forward with a new patch
version. See [release checklist](docs/release-checklist.md),
[upgrade/rollback](docs/releases/1.2.0.md) and [test scope](docs/verification.md).
