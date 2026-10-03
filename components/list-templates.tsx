"use client";
import { useState } from "react";
import { listTemplates, templateWishes } from "../lib/list-template-data";
import { useI18n } from "./language";
import { api, Field, Notice } from "./ui";
export function ListTemplates({ refresh }: { refresh: () => Promise<void> }) {
  const { t, locale } = useI18n(),
    [kind, setKind] = useState<keyof typeof listTemplates>("birthday"),
    [name, setName] = useState(""),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState(false);
  return (
    <details className="panel stack list-templates">
      <summary>{t("Partir d’un modèle d’occasion")}</summary>
      <form
        className="stack"
        onChange={() => setCreated(false)}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("admin/lists/template", {
              template: kind,
              name: name.trim() || t(listTemplates[kind].name),
              event_date: date,
              locale,
              confirm: true,
            });
            await refresh();
            setCreated(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {t(
            "Ces exemples fictifs servent de point de départ. La liste sera privée : vérifiez son contenu avant de la partager.",
          )}
        </p>
        <Field label={t("Type d’occasion")}>
          <select
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as keyof typeof listTemplates)
            }
          >
            {Object.entries(listTemplates).map(([key, item]) => (
              <option key={key} value={key}>
                {t(item.name)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Nom de la liste")}>
          <input
            maxLength={80}
            value={name}
            placeholder={t(listTemplates[kind].name)}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("Date de l’événement")}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <h3>{t("Aperçu des exemples")}</h3>
        <ul>
          {listTemplates[kind].items.map((key) => (
            <li key={key}>
              <strong>{t(templateWishes[key].title)}</strong>
              <p>{t(templateWishes[key].description)}</p>
            </li>
          ))}
        </ul>
        <button className="button primary" disabled={busy}>
          {t("Créer le brouillon privé")}
        </button>
        {created && (
          <div role="status">
            <p>{t("Brouillon créé. Retrouvez-le dans vos listes.")}</p>
            <ol>
              <li>{t("Adaptez ou supprimez les exemples dans Mes envies.")}</li>
              <li>
                {t("Vérifiez les préférences, la date et le mode surprise.")}
              </li>
              <li>
                {t(
                  "Archivez les exemples inutiles, puis réglez le partage de la liste.",
                )}
              </li>
            </ol>
            <a href="/help">{t("Aide pour les invités")}</a>
          </div>
        )}
        {error && <Notice error>{error}</Notice>}
      </form>
    </details>
  );
}
