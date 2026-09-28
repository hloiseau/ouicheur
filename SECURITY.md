# Security

Ouicheur is actively developed. Before reporting a problem, record the image tag
or commit and check whether a newer version already addresses it. There is no
published long-term support policy yet.

For a suspected vulnerability, use **Security → Report a vulnerability** on
GitHub if private reporting is available. If it is unavailable, open an issue
asking the maintainer for a private reporting channel **without publishing the
vulnerability details**. This document does not imply that GitHub private
reporting has been enabled.

Provide reproduction steps with synthetic data, affected versions and the
expected security boundary through that private channel. Do not publish setup
codes, session cookies, backups, payment references or credentials.

Configure the owner before Internet exposure and use HTTPS for public access.
Enable `TRUST_PROXY=1` only when a trusted proxy replaces forwarded headers and
clients cannot bypass it. Keep both persistent volumes private and back them up
outside the NAS. Imported pages are untrusted input; do not weaken the network
checks to make a merchant import succeed.

Contributions declared by visitors are not verified payments. Owners must check
their payment account before relying on them. See the README for the exact
funding and moderation behavior.
