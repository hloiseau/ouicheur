"use client";
import { PageHeader } from "./page-header";
import { useI18n } from "./language";

import { useState } from "react";
import { api, Field, Icon, Notice } from "./ui";
import { currencies } from "../lib/validation";

export function Setup() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <PageHeader />
      <main id="main" className="login-page">
        <section className="login-card setup-card">
          <h1>{t("Votre Ouichlist commence ici.")}</h1>
          <p>
            {t(
              "Créez votre espace personnel. Cette étape ne sera demandée qu’une fois.",
            )}{" "}
          </p>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(event.currentTarget);
              try {
                await api("setup", Object.fromEntries(form));
                window.location.assign("/admin");
              } catch (error) {
                setError((error as Error).message);
                setBusy(false);
              }
            }}
          >
            <Field
              label={t("Code d’installation")}
              hint={t(
                "Dans TrueNAS, ouvrez les journaux de l’application Ouicheur et copiez le code affiché au démarrage.",
              )}
            >
              <input
                name="code"
                type="password"
                required
                autoComplete="off"
                maxLength={256}
                spellCheck={false}
                autoCapitalize="none"
              />
            </Field>
            <Field
              label={t("Votre nom ou pseudonyme")}
              hint={t("Il sera affiché sur votre Ouichlist.")}
            >
              <input
                name="name"
                required
                autoComplete="nickname"
                maxLength={80}
              />
            </Field>
            <Field
              label={t("Mot de passe")}
              hint={t(
                "Au moins 12 caractères. Choisissez un mot de passe réservé à cette application.",
              )}
            >
              <input
                name="password"
                type="password"
                required
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
              />
            </Field>
            <Field label={t("Confirmer le mot de passe")}>
              <input
                name="confirmation"
                type="password"
                required
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
              />
            </Field>
            <Field label={t("Devise de la Ouichlist")}>
              <select name="currency" defaultValue="EUR">
                {currencies.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </Field>
            <Field
              label={t("Lien PayPal.Me (facultatif)")}
              hint={t("Vous pourrez l’ajouter plus tard dans votre profil.")}
            >
              <input
                name="paypal"
                placeholder="https://paypal.me/yourName"
                maxLength={100}
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            {error && <Notice error>{error}</Notice>}
            <button className="button primary wide" disabled={busy}>
              {busy ? t("Création de votre espace…") : t("Créer ma Ouichlist")}
              <Icon name="arrow" size={17} />
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
