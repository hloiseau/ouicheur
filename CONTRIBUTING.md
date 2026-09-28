# Contributing to Ouicheur

Ouicheur is a personal, self-hosted wishlist with one owner per instance. Discuss
larger changes in a GitHub issue before implementing them, especially multiple
owners, automatic payments or new external services.

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
