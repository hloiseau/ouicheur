"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "./page-header";
import { useI18n } from "./language";
import { api, Field, Notice } from "./ui";

export function Invitation() {
  const { t, date } = useI18n();
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<{
    name: string;
    login: string;
    expires: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const secret = location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/.test(secret)) {
      setError(t("Invitation expirée ou révoquée."));
      return;
    }
    setToken(secret);
    void api<{ name: string; login: string; expires: number }>("invitation", {
      token: secret,
    })
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageHeader />
      <main id="main" className="container status-page">
        <section className="panel stack">
          <h1>{t("Rejoindre les préparatifs")}</h1>
          {error && <Notice error>{error}</Notice>}
          {!info && !error && <p role="status">{t("Chargement…")}</p>}
          {info && (
            <>
              <p>
                {t(
                  "Bienvenue {0}. Choisissez votre mot de passe pour accéder aux listes qui vous sont confiées.",
                  info.name,
                )}
              </p>
              <p>
                {t("Identifiant de connexion")} : <strong>{info.login}</strong>
              </p>
              <p>
                {t(
                  "Invitation valable jusqu’au {0}",
                  date(new Date(info.expires).toISOString()),
                )}
              </p>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const fields = new FormData(e.currentTarget);
                  try {
                    await api("invitation/accept", {
                      token,
                      password: fields.get("password"),
                      confirmation: fields.get("confirmation"),
                    });
                    window.location.assign("/organiser");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field
                  label={t("Nouveau mot de passe (12 caractères minimum)")}
                >
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    required
                  />
                </Field>
                <Field label={t("Confirmer le nouveau mot de passe")}>
                  <input
                    name="confirmation"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    required
                  />
                </Field>
                <button className="button primary" disabled={busy}>
                  {t("Créer mon accès")}
                </button>
              </form>
            </>
          )}
          <a href="/admin?member=1">
            {t("J’ai déjà un compte coorganisateur")}
          </a>
        </section>
      </main>
    </>
  );
}
