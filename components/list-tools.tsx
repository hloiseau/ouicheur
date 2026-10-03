"use client";
import { useEffect, useState } from "react";
import type { Wishlist } from "../lib/lists";
import type { Preference } from "../lib/preferences";
import { preferenceLabels } from "../lib/preference-labels";
import { useI18n } from "./language";
import { api, Field, Notice } from "./ui";
type Preferences = {
  editable: boolean;
  notes_allowed: boolean;
  fields: Preference[];
  note: string;
};
export function PreferenceEditor({ listId }: { listId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<Preferences | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    setSaved(false);
    void api<Preferences>(
      `account/preferences?list_id=${encodeURIComponent(listId)}`,
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [listId]);
  return (
    <section className="stack">
      <p>
        {t(
          "Renseignez uniquement ce que vous souhaitez partager. Les champs restent privés par défaut ; vider un champ l’efface.",
        )}
      </p>
      {error && <Notice error>{error}</Notice>}
      {data && (
        <form
          className="stack"
          onChange={() => setSaved(false)}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("account/preferences", {
                list_id: listId,
                ...(data.editable ? { fields: data.fields } : {}),
                ...(data.notes_allowed ? { note: data.note } : {}),
              });
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {data.editable ? (
            Object.entries(preferenceLabels).map(([key, label]) => {
              const field = key as Preference["field"],
                current = data.fields.find((f) => f.field === field) || {
                  field,
                  value: "",
                  visibility: "private" as const,
                };
              const update = (patch: Partial<Preference>) =>
                setData({
                  ...data,
                  fields: [
                    ...data.fields.filter((f) => f.field !== field),
                    { ...current, ...patch },
                  ],
                });
              return (
                <fieldset key={field} className="panel stack">
                  <legend>{t(label)}</legend>
                  <Field label={t("Préférence : {0}", t(label))}>
                    <textarea
                      value={current.value}
                      maxLength={1000}
                      onChange={(e) => update({ value: e.target.value })}
                    />
                  </Field>
                  <Field label={t("Visibilité : {0}", t(label))}>
                    <select
                      value={current.visibility}
                      onChange={(e) =>
                        update({
                          visibility: e.target
                            .value as Preference["visibility"],
                        })
                      }
                    >
                      <option value="private">
                        {t("Privé : destinataire et propriétaire")}
                      </option>
                      <option value="shared">
                        {t("Visible aux personnes ayant accès à la liste")}
                      </option>
                    </select>
                  </Field>
                </fieldset>
              );
            })
          ) : (
            <p>
              {t(
                "Les préférences personnelles sont modifiées par le destinataire ou le propriétaire.",
              )}
            </p>
          )}
          {data.notes_allowed && (
            <Field
              label={t("Mes notes de préparation")}
              hint={t(
                "Ces notes restent dans votre compte et ne sont pas des préférences du destinataire.",
              )}
            >
              <textarea
                maxLength={2000}
                value={data.note}
                onChange={(e) => setData({ ...data, note: e.target.value })}
              />
            </Field>
          )}
          <button className="button secondary" disabled={busy}>
            {t("Enregistrer")}
          </button>
          {saved && <p role="status">{t("Préférences enregistrées.")}</p>}
        </form>
      )}
    </section>
  );
}
export function SharedPreferences({ listId }: { listId: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Preference[]>([]);
  useEffect(() => {
    let active = true;
    setRows([]);
    void api<Preference[]>(`lists/${encodeURIComponent(listId)}/preferences`)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
  }, [listId]);
  return rows.length ? (
    <section className="panel stack">
      <h3>{t("Pour choisir une attention")}</h3>
      <dl>
        {rows.map((r) => (
          <div key={r.field}>
            <dt>{t(preferenceLabels[r.field])}</dt>
            <dd className="wrap-code">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  ) : null;
}
export function ListTools({
  list,
  owner = false,
}: {
  list: Wishlist;
  owner?: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(`${list.name} — ${t("Copie")}`),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="stack">
      <div className="form-actions">
        <a
          className="text-link"
          href={`/api/lists/${list.id}/export?format=json`}
        >
          {t("Exporter JSON")}
        </a>
        <a
          className="text-link"
          href={`/api/lists/${list.id}/export?format=csv`}
        >
          {t("Exporter CSV")}
        </a>
        <a className="text-link" href={`/lists/${list.id}/print`}>
          {t("Imprimer cette liste")}
        </a>
      </div>
      <SharedPreferences listId={list.id} />
      {owner && (
        <>
          <details>
            <summary>{t("Mes préférences cadeaux")}</summary>
            <PreferenceEditor listId={list.id} />
          </details>
          <details>
            <summary>{t("Dupliquer pour une autre occasion")}</summary>
            <form
              className="stack panel"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  !window.confirm(
                    t(
                      "Créer une copie privée sans achats, réservations ni contributions ?",
                    ),
                  )
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  const r = await api<{ id: string }>("admin/lists/duplicate", {
                    id: list.id,
                    name,
                    event_date: date,
                    confirm: true,
                  });
                  window.location.assign(`/lists/${r.id}`);
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              <Field label={t("Nom de la copie")}>
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label={t("Date de la nouvelle occasion")}>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <p>
                {t(
                  "Seules les envies visibles et les préférences sont copiées. Le partage, les accès des proches et les engagements sont à configurer à nouveau.",
                )}
              </p>
              {error && <Notice error>{error}</Notice>}
              <button className="button secondary" disabled={busy}>
                {t("Créer la copie privée")}
              </button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
