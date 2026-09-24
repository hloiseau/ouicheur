"use client";
import { useState } from "react";
import { api, Field, Icon, Notice } from "./ui";
import { currencies } from "../lib/validation";

export function Setup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main id="main" className="login-page">
      <section className="login-card setup-card">
        <h1>Votre wishlist commence ici.</h1>
        <p>
          Créez votre espace personnel. Cette étape ne sera demandée qu’une
          fois.
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
            label="Code d’installation"
            hint="Dans TrueNAS, ouvrez les journaux de l’application Wishlister et copiez le code affiché au démarrage."
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
            label="Votre nom ou pseudonyme"
            hint="Il sera affiché sur votre wishlist."
          >
            <input
              name="name"
              required
              autoComplete="nickname"
              maxLength={80}
            />
          </Field>
          <Field
            label="Mot de passe"
            hint="Au moins 12 caractères. Choisissez un mot de passe réservé à cette application."
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
          <Field label="Confirmer le mot de passe">
            <input
              name="confirmation"
              type="password"
              required
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
            />
          </Field>
          <Field label="Devise de la wishlist">
            <select name="currency" defaultValue="EUR">
              {currencies.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Lien PayPal.Me (facultatif)"
            hint="Vous pourrez l’ajouter plus tard dans votre profil."
          >
            <input
              name="paypal"
              placeholder="https://paypal.me/votreNom"
              maxLength={100}
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          {error && <Notice error>{error}</Notice>}
          <button className="button primary wide" disabled={busy}>
            {busy ? "Création de votre espace…" : "Créer ma wishlist"}
            <Icon name="arrow" size={17} />
          </button>
        </form>
      </section>
    </main>
  );
}
