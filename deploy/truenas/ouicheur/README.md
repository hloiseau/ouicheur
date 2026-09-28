# Ouicheur

Ouicheur is an MIT-licensed personal wishlist with English and French interfaces,
product-link imports, local images and optional direct PayPal.Me contributions.
Visitors do not need accounts. Declared contributions are not verified payments.

Open the web portal after installation. Retrieve the private first-run code from
the Ouicheur container logs and create the owner in the browser. Keep `/app/data`
and `/app/backups` persistent and writable by the configured user/group. Use an
HTTPS reverse proxy for public access and set `APP_ORIGIN` to that exact origin.
Leave proxy trust disabled unless the proxy is the only entry point.

This is a candidate catalog definition, not an accepted or NAS-tested app. Its
image tag identifies the reviewed amd64 build; `app_version` matches that build's
package version, not an existing GitHub release. Use a tested numbered image for
the final submission. See the parent integration README for remaining checks.
