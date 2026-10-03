"use client";
import { useState } from "react";
import type { Gift } from "../lib/gifts";
import type { Wishlist } from "../lib/lists";
import { useI18n } from "./language";
import { api, Field, Notice } from "./ui";
export function BulkOrganizer({
  gifts,
  listId,
  lists,
  categories,
  onChange,
}: {
  gifts: Pick<Gift, "id" | "list_id" | "title">[];
  listId: string;
  lists: Wishlist[];
  categories: { id: string; name: string }[];
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [ids, setIds] = useState<string[]>([]),
    [action, setAction] = useState("archive"),
    [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const rows = gifts.filter((g) => g.list_id === listId).slice(0, 500);
  const selected = ids.filter((id) => rows.some((g) => g.id === id));
  const order = async (id: string, direction: string) => {
    setBusy(true);
    setError("");
    try {
      await api("admin/gifts/order", { id, direction });
      onChange();
      setNotice(
        t(
          "Ordre enregistré. Choisissez le tri manuel pour le retrouver sur la liste.",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel stack">
      <summary>{t("Organiser plusieurs envies")}</summary>
      {!listId ? (
        <p>{t("Choisissez une liste pour organiser ses envies.")}</p>
      ) : (
        <>
          <p>
            {t(
              "Sélectionnez jusqu’à 500 envies parmi les résultats affichés. Les flèches modifient l’ordre manuel de la liste.",
            )}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setIds(rows.map((g) => g.id))}
            >
              {t("Tout sélectionner")}
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => setIds([])}
            >
              {t("Vider la sélection")}
            </button>
          </div>
          <div className="bulk-picker">
            {rows.map((g) => (
              <div className="bulk-row" key={g.id}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={selected.includes(g.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...selected, g.id]
                          : selected.filter((id) => id !== g.id),
                      )
                    }
                  />
                  {g.title}
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    aria-label={t("Monter {0}", g.title)}
                    onClick={() => void order(g.id, "up")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    aria-label={t("Descendre {0}", g.title)}
                    onClick={() => void order(g.id, "down")}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                !selected.length ||
                !window.confirm(
                  t(
                    "Appliquer cette action à {0} envies ? Un déplacement ou archivage peut retirer leur accès aux invités.",
                    selected.length,
                  ),
                )
              )
                return;
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const r = await api<{ count: number }>("admin/gifts/bulk", {
                  list_id: listId,
                  ids: selected,
                  action,
                  value,
                  confirm: true,
                });
                setIds([]);
                setNotice(t("{0} envies mises à jour.", r.count));
                onChange();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <strong>{t("{0} envies sélectionnées", selected.length)}</strong>
            <Field label={t("Action sur la sélection")}>
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setValue("");
                }}
              >
                <option value="archive">{t("Archiver")}</option>
                <option value="restore">{t("Rendre visible")}</option>
                <option value="category">{t("Changer de catégorie")}</option>
                <option value="list">{t("Déplacer vers une liste")}</option>
              </select>
            </Field>
            {action === "category" && (
              <Field label={t("Catégorie")}>
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">{t("Sans catégorie")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {action === "list" && (
              <Field label={t("Liste de destination")}>
                <select
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">{t("Choisir une liste")}</option>
                  {lists
                    .filter((l) => !l.archived && l.id !== listId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <button
              className="button secondary"
              disabled={busy || !selected.length}
            >
              {t("Appliquer à la sélection")}
            </button>
          </form>
        </>
      )}
      {error && <Notice error>{error}</Notice>}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
