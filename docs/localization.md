# Ouicheur: language and upgrade notes

Ouicheur opens in **English** by default. Choose **Français** in the language selector to use the French interface. The preference is stored in the `ouicheur_locale` cookie for one year and applies to this browser, not to other visitors. Switching languages preserves unsaved form input.

The setup wizard, public Ouichlist, gift and contribution pages, administration, errors and page titles are translated. Money and dates use the selected locale; timestamps include UTC to avoid differences between the server and browser. Gift names, descriptions, categories, profiles and personal messages remain exactly as their authors entered them. The Japan search prompt follows the selected language too.

## First run

Start the Docker app and open its web portal. Copy the **Setup code** from the app logs, choose your name, password and currency, then select **Create my Ouichlist**. PayPal.Me is optional during setup. There is no default owner password and no required setup command. The setup closes permanently once the account exists.

The local image is `ouicheur:local`. See the [TrueNAS 25.10 guide](truenas.md) and [Compose template](../compose.truenas.yaml) for installation; the image still needs to be published to a registry accessible to the NAS.

## Upgrading from Wishlister

The new name does not require a database migration or account reset. The local Compose project name, data volumes and session cookie deliberately keep their legacy names so an existing instance keeps its data and sign-in sessions. Keep the existing data mounts on TrueNAS. Renaming a dataset is unnecessary.

Exports now download as `ouicheur-export.json`. Their data format and backup compatibility are unchanged. Startup logs and local account/backup commands are in English.

## Maintaining translations

`lib/messages.ts` maps the existing French source messages to English. `lib/i18n.ts` handles numbered placeholders and regional formats without an extra dependency. Use `useI18n()` in client components and `await getI18n()` on the server. The server reads the same language cookie as the browser; it never uses a global mutable language setting.

Add every new UI label and application error to the catalog, keeping the same `{0}`, `{1}`, etc. placeholders in both languages. Translate complete sentences around variable values. Do not translate user content or internal identifiers. Imports store message keys and arguments so errors from previous jobs can follow the viewer’s language.

Run `npm test` for catalog coverage, then `npm run build` and the browser tests for language switching, form preservation, setup, server errors and mobile layout.
