"use client";
import { useEffect, useState } from "react";
import {
  notificationKinds,
  type NotificationRule,
  type NotificationPreferences,
} from "../lib/notification-labels";
import { api, Field, Notice } from "./ui";
import { useI18n } from "./language";
type Data = {
  owner: boolean;
  preferences: NotificationPreferences;
  email: string;
  verified: boolean;
  ntfy_available: boolean;
  smtp_available: boolean;
  owner_email_configured: boolean;
  lists: { id: string; name: string }[];
};
export function NotificationPreferencesPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<Data | null>(null),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const refresh = async () => {
    const d = await api<Data>("account/notifications");
    setData(d);
    setEmail(d.email);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const action = async (run: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await run();
      await refresh();
      setNotice(t(message));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const set = (patch: Partial<NotificationPreferences>) =>
    data &&
    setData({ ...data, preferences: { ...data.preferences, ...patch } });
  const updateRule = (index: number, patch: Partial<NotificationRule>) =>
    data &&
    set({
      rules: data.preferences.rules.map((r, i) =>
        i === index ? { ...r, ...patch } : r,
      ),
    });
  return (
    <section className="panel stack">
      <h2>{t("Mes rappels et notifications")}</h2>
      <p>
        {t(
          "Choisissez vos occasions, canaux et horaires. Les messages restent neutres, sans noms de cadeaux, montants ou liens privés.",
        )}
      </p>
      {error && <Notice error>{error}</Notice>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          {data.owner && (
            <p>
              {t(
                data.ntfy_available
                  ? "Serveur ntfy configuré"
                  : "Serveur ntfy à configurer",
              )}
            </p>
          )}
          <details>
            <summary>{t("Mon adresse de courriel")}</summary>
            <div className="stack">
              <p>
                {t(
                  data.smtp_available
                    ? "Serveur SMTP configuré"
                    : "Le courriel n’est pas configuré sur cette instance.",
                )}
              </p>
              {data.owner_email_configured && (
                <p>
                  {t("Une adresse propriétaire est configurée sur le serveur.")}
                </p>
              )}
              {data.verified && (
                <p>{t("Adresse vérifiée : {0}", data.email)}</p>
              )}
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(
                    () =>
                      api("account/email/request", { email, consent: true }),
                    "Un code valable 15 minutes a été envoyé. Aucune notification n’est activée par cette vérification.",
                  );
                }}
              >
                <Field label={t("Adresse de courriel pour mes rappels")}>
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <button
                  className="button secondary"
                  disabled={busy || !data.smtp_available}
                >
                  {t("Recevoir un code de vérification")}
                </button>
              </form>
              {!data.verified && data.email && (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(
                      () => api("account/email/confirm", { code }),
                      "Adresse vérifiée.",
                    );
                  }}
                >
                  <Field label={t("Code à 6 chiffres")}>
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </Field>
                  <button className="button secondary" disabled={busy}>
                    {t("Vérifier l’adresse")}
                  </button>
                </form>
              )}
              {data.email && (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      () => api("account/email/remove", { confirm: true }),
                      "Adresse supprimée et envois en attente annulés.",
                    )
                  }
                >
                  {t("Supprimer mon adresse")}
                </button>
              )}
            </div>
          </details>
          <form
            className="stack"
            onChange={() => setNotice("")}
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                () => api("account/notifications", data.preferences),
                "Préférences de notification enregistrées.",
              );
            }}
          >
            <label className="checkbox">
              <input
                type="checkbox"
                checked={data.preferences.enabled}
                onChange={(e) => set({ enabled: e.target.checked })}
              />
              {t("Activer mes rappels personnalisés")}
            </label>
            <Field label={t("Fuseau horaire des rappels")}>
              <input
                required
                maxLength={80}
                value={data.preferences.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label={t("Ne pas déranger à partir de")}>
                <input
                  type="time"
                  required
                  value={data.preferences.quiet_start}
                  onChange={(e) => set({ quiet_start: e.target.value })}
                />
              </Field>
              <Field label={t("Reprendre les envois à")}>
                <input
                  type="time"
                  required
                  value={data.preferences.quiet_end}
                  onChange={(e) => set({ quiet_end: e.target.value })}
                />
              </Field>
            </div>
            <p className="fine-print">
              {t(
                "Deux horaires identiques désactivent la pause nocturne. Le résumé est envoyé au plus une fois par jour et par canal, hors pause.",
              )}
            </p>
            {data.preferences.rules.map((r, i) => (
              <fieldset className="stack panel" key={i}>
                <legend>{t("Rappel {0}", i + 1)}</legend>
                <Field label={t("Type de rappel {0}", i + 1)}>
                  <select
                    value={r.kind}
                    onChange={(e) =>
                      updateRule(i, {
                        kind: e.target.value as NotificationRule["kind"],
                      })
                    }
                  >
                    {Object.entries(notificationKinds)
                      .filter(
                        ([k]) =>
                          data.owner ||
                          ![
                            "declaration",
                            "import_failed",
                            "backup_failed",
                          ].includes(k),
                      )
                      .map(([k, label]) => (
                        <option key={k} value={k}>
                          {t(label)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={t("Liste du rappel {0}", i + 1)}>
                  <select
                    value={r.list_id}
                    onChange={(e) => updateRule(i, { list_id: e.target.value })}
                  >
                    <option value="">
                      {t("Toutes mes listes autorisées")}
                    </option>
                    {data.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("Canal du rappel {0}", i + 1)}>
                  <select
                    value={r.channel}
                    onChange={(e) =>
                      updateRule(i, {
                        channel: e.target.value as NotificationRule["channel"],
                      })
                    }
                  >
                    {data.owner && <option value="ntfy">ntfy</option>}
                    <option value="email">{t("Courriel")}</option>
                  </select>
                </Field>
                <Field label={t("Fréquence du rappel {0}", i + 1)}>
                  <select
                    value={r.frequency}
                    onChange={(e) =>
                      updateRule(i, {
                        frequency: e.target
                          .value as NotificationRule["frequency"],
                      })
                    }
                  >
                    <option value="instant">{t("À chaque événement")}</option>
                    <option value="daily">{t("Résumé quotidien")}</option>
                  </select>
                </Field>
                {r.kind === "event_reminder" && (
                  <Field label={t("Jours avant l’occasion {0}", i + 1)}>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      required
                      value={r.days}
                      onChange={(e) =>
                        updateRule(i, { days: Number(e.target.value) })
                      }
                    />
                  </Field>
                )}
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    set({
                      rules: data.preferences.rules.filter(
                        (_, index) => index !== i,
                      ),
                    })
                  }
                >
                  {t("Supprimer le rappel {0}", i + 1)}
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="button secondary"
              disabled={data.preferences.rules.length >= 64}
              onClick={() =>
                set({
                  rules: [
                    ...data.preferences.rules,
                    {
                      kind: "event_reminder",
                      list_id: "",
                      channel:
                        data.owner && data.ntfy_available ? "ntfy" : "email",
                      frequency: "instant",
                      days: 7,
                    },
                  ],
                })
              }
            >
              {t("Ajouter un rappel")}
            </button>
            <button className="button primary" disabled={busy}>
              {t("Enregistrer mes notifications")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
