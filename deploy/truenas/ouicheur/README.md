# Ouicheur

Ouicheur is an MIT-licensed family wishlist with English and French interfaces,
product-link imports, local images, per-list coorganizers, revocable sessions,
surprise protection, gift exchanges and optional direct PayPal.Me contributions.
Visitors do not need accounts. Declared contributions are not verified payments.

Open the web portal after installation. Retrieve the private first-run code from
the Ouicheur container logs and create the owner in the browser. Keep `/app/data`
and `/app/backups` persistent and writable by the configured user/group. Use an
HTTPS reverse proxy for public access and set `APP_ORIGIN` to that exact origin.
Leave proxy trust disabled unless the proxy is the only entry point.

This is a candidate catalog definition, not an accepted catalog app. Its commit
tag identifies a tested multi-architecture image; `app_version` matches its
package version. Earlier manual installations received positive feedback on
TrueNAS 25.04 and Unraid, but the complete 1.2.0 features and this catalog package
still need their final native install/upgrade record. See the parent integration
README for remaining checks.
