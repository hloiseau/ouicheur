"use client";
import { useEffect, useState } from "react";
import { useI18n } from "./language";
import { api, Field, Notice } from "./ui";
type Idea = {
  id: string;
  list_id: string;
  list_name: string;
  title: string;
  nickname: string;
  message: string;
  url: string;
  state: string;
  plan_title: string;
  plan_note: string;
  prepared: number;
};
export function SecretSuggestions() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Idea[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => setRows(await api<Idea[]>("team/secrets"));
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const action = async (row: Idea, kind: string, form?: HTMLFormElement) => {
    if (
      kind !== "save" &&
      !window.confirm(
        kind === "delete"
          ? t("Supprimer cette idée secrète et toute sa préparation ?")
          : kind === "accept"
            ? t("Accepter cette idée pour la préparer en secret ?")
            : t("Refuser cette suggestion ?"),
      )
    )
      return;
    const values = form ? new FormData(form) : null;
    setBusy(true);
    setError("");
    try {
      await api("team/secrets", {
        id: row.id,
        action: kind,
        confirm: true,
        ...(values
          ? {
              title: values.get("title"),
              note: values.get("note"),
              prepared: values.get("prepared") === "on",
            }
          : {}),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="stack">
      <h2>{t("Idées secrètes à préparer")}</h2>
      <p>
        {t(
          "Ces idées vous sont confiées personnellement. Leur acceptation crée une préparation privée, sans publication, réservation ni paiement. Ne les copiez pas sur la liste du destinataire.",
        )}
      </p>
      {error && <Notice error>{error}</Notice>}
      {!rows.length && (
        <p>{t("Aucune idée secrète ne vous est confiée pour le moment.")}</p>
      )}
      {rows.map((row) => (
        <article className="panel stack" key={row.id}>
          <h3>{row.title}</h3>
          <p>
            {row.list_name} · {row.nickname || t("Sans pseudo")}
          </p>
          <strong>
            {t(
              row.state === "pending"
                ? "Suggestion en attente"
                : row.state === "accepted"
                  ? "Suggestion acceptée"
                  : "Suggestion refusée",
            )}
          </strong>
          {row.message && <p className="wrap-code">{row.message}</p>}
          {row.url && (
            <a
              href={row.url}
              rel="noreferrer noopener"
              target="_blank"
              className="wrap-code"
            >
              {t("Voir le produit ↗")}
            </a>
          )}
          {row.state === "accepted" && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void action(row, "save", e.currentTarget);
              }}
            >
              <Field label={t("Cadeau à préparer")}>
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue={row.plan_title}
                />
              </Field>
              <Field label={t("Mes notes privées")}>
                <textarea
                  name="note"
                  maxLength={2000}
                  defaultValue={row.plan_note}
                />
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="prepared"
                  defaultChecked={!!row.prepared}
                />
                {t("Le cadeau est prêt")}
              </label>
              <button className="button secondary" disabled={busy}>
                {t("Enregistrer la préparation")}
              </button>
            </form>
          )}
          <div className="form-actions">
            {row.state === "pending" && (
              <>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void action(row, "accept")}
                >
                  {t("Préparer en secret")}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action(row, "reject")}
                >
                  {t("Refuser")}
                </button>
              </>
            )}
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void action(row, "delete")}
            >
              {t("Supprimer la proposition")}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
