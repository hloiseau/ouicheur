"use client";
import { useEffect, useState } from "react";
import type { SessionSummary } from "../lib/sessions";
import { useI18n } from "./language";
import { Modal } from "./modal";
import { api, Field, Notice } from "./ui";

export function AccountSecurity({
  onChange,
}: {
  onChange: () => Promise<void>;
}) {
  const { t, date } = useI18n();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<SessionSummary | "others" | null>(null);
  const [dialogError, setDialogError] = useState("");
  const refresh = async () =>
    setSessions(await api<SessionSummary[]>("admin/sessions"));
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const chooseTarget = (value: SessionSummary | "others") => {
    setDialogError("");
    setTarget(value);
  };
  return (
    <div className="stack account-security">
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <section className="panel stack">
        <div className="panel-heading">
          <h2>{t("Appareils connectés")}</h2>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Actualiser")}
          </button>
        </div>
        <p>
          {t(
            "Chaque connexion expire après 12 heures. Vous pouvez fermer une session à tout moment. Les noms d’appareils sont indicatifs ; aucune adresse IP n’est conservée.",
          )}
        </p>
        {!sessions && !error && <p role="status">{t("Chargement…")}</p>}
        {sessions?.map((session) => (
          <article className="session-card" key={session.id}>
            <div className="stack">
              <h3>{session.device || t("Navigateur non identifié")}</h3>
              {session.current && (
                <strong className="session-current">
                  {t("Cette session")}
                </strong>
              )}
              <dl className="session-dates">
                <div>
                  <dt>{t("Connexion")}</dt>
                  <dd>
                    {session.created_at
                      ? date(session.created_at)
                      : t("Avant cette mise à jour")}
                  </dd>
                </div>
                <div>
                  <dt>{t("Dernière activité")}</dt>
                  <dd>
                    {session.last_seen
                      ? date(session.last_seen)
                      : t("Non disponible")}
                  </dd>
                </div>
                <div>
                  <dt>{t("Expiration")}</dt>
                  <dd>{date(session.expires_at)}</dd>
                </div>
              </dl>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => chooseTarget(session)}
            >
              {session.current
                ? t("Déconnecter cette session")
                : t("Déconnecter cet appareil")}
            </button>
          </article>
        ))}
        <div className="form-actions">
          <button
            className="button secondary"
            disabled={busy || !sessions?.some((s) => !s.current)}
            onClick={() => chooseTarget("others")}
          >
            {t("Déconnecter les autres appareils")}
          </button>
        </div>
      </section>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fields = new FormData(form);
          setPasswordError("");
          setPasswordNotice("");
          if (fields.get("password") !== fields.get("confirmation")) {
            setPasswordError(t("Les mots de passe ne correspondent pas."));
            return;
          }
          setBusy(true);
          try {
            await api("admin/password", {
              current: fields.get("current"),
              password: fields.get("password"),
            });
            form.reset();
            setPasswordNotice(
              t(
                "Mot de passe modifié. Les autres appareils sont déconnectés ; cette session reste ouverte.",
              ),
            );
            await refresh();
            await onChange();
          } catch (e) {
            setPasswordError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{t("Changer mon mot de passe")}</h2>
        {passwordError && <Notice error>{passwordError}</Notice>}
        {passwordNotice && <Notice>{passwordNotice}</Notice>}
        <p>
          {t(
            "Les autres appareils seront déconnectés. Vous resterez connecté ici avec une nouvelle session.",
          )}
        </p>
        <Field label={t("Mot de passe actuel")}>
          <input
            name="current"
            type="password"
            required
            maxLength={256}
            autoComplete="current-password"
          />
        </Field>
        <Field label={t("Nouveau mot de passe (12 caractères minimum)")}>
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t("Confirmer le nouveau mot de passe")}>
          <input
            name="confirmation"
            type="password"
            required
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
          />
        </Field>
        <button className="button primary" disabled={busy}>
          {busy ? t("Enregistrement…") : t("Changer mon mot de passe")}
        </button>
      </form>
      <section className="panel stack">
        <h2>{t("Récupérer mon accès")}</h2>
        <p>
          {t(
            "Si vous perdez votre mot de passe, utilisez la commande locale depuis votre serveur. Elle déconnecte tous les appareils sans supprimer vos envies.",
          )}
        </p>
        <code>npm run password</code>
        <a
          href="https://github.com/hloiseau/ouicheur/blob/main/docs/account-security.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Voir la procédure de récupération")}
        </a>
      </section>
      {target && (
        <Modal
          title={t("Fermer des sessions")}
          busy={busy}
          onClose={() => setTarget(null)}
        >
          <p>
            {target === "others"
              ? t(
                  "Tous les autres appareils devront se reconnecter. Cette session restera ouverte.",
                )
              : target.current
                ? t("Vous allez être déconnecté de cet appareil.")
                : t(
                    "Cet appareil devra se reconnecter avec votre mot de passe.",
                  )}
          </p>
          {dialogError && <Notice error>{dialogError}</Notice>}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              {t("Annuler")}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setDialogError("");
                setError("");
                setNotice("");
                try {
                  const result = await api<{ signed_out: boolean }>(
                    "admin/sessions/revoke",
                    {
                      id: target === "others" ? target : target.id,
                      confirm: true,
                    },
                  );
                  if (result.signed_out) {
                    window.location.assign("/admin?tab=security");
                    return;
                  }
                  setTarget(null);
                  setNotice(t("Les sessions sélectionnées sont fermées."));
                  await refresh();
                } catch (e) {
                  setDialogError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Confirmer la déconnexion")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
