"use client";
import { useId, useState } from "react";
import { priorityLabel, type GiftPriority } from "../lib/priority-labels";
import { useI18n } from "./language";
import { Modal } from "./modal";
import { api, Field, Notice } from "./ui";

type Draft = { id?: number; name: string | null; key: string };
export function PrioritiesEditor({
  priorities,
  onClose,
  onSaved,
}: {
  priorities: GiftPriority[];
  onClose: () => void;
  onSaved: (priorities: GiftPriority[]) => void;
}) {
  const { t } = useI18n();
  const radioGroup = useId();
  const [previous] = useState(priorities);
  const [rows, setRows] = useState<Draft[]>(
    priorities.map((p) => ({ id: p.id, name: p.name, key: String(p.id) })),
  );
  const [featured, setFeatured] = useState(
    String(priorities.find((p) => p.featured)?.id ?? 2),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = (row: Draft) =>
    priorityLabel(
      { id: row.id ?? -1, name: row.name, position: 0, featured: 0 },
      t,
    );
  const move = (index: number, offset: number) =>
    setRows((items) => {
      const next = [...items];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  return (
    <Modal title={t("Gérer les priorités")} onClose={onClose} busy={busy}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const saved = await api<GiftPriority[]>("admin/priorities", {
              previous,
              priorities: rows.map(({ id, name }) => ({ id, name })),
              featured: rows.findIndex((p) => p.key === featured),
            });
            onSaved(saved);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="fine-print">
          {t(
            "Les envies sont triées de haut en bas selon cet ordre. Choisissez la priorité affichée avec un cœur sur les cartes et dans les filtres.",
          )}
        </p>
        {error && <Notice error>{error}</Notice>}
        <fieldset className="priority-fields" disabled={busy}>
          <legend className="sr-only">
            {t("Priorités, de la plus forte à la plus faible")}
          </legend>
          {rows.map((row, index) => (
            <div className="priority-row" key={row.key}>
              <Field label={t("Nom de la priorité {0}", index + 1)}>
                <input
                  required
                  maxLength={60}
                  value={label(row)}
                  onChange={(e) =>
                    setRows((items) =>
                      items.map((p) =>
                        p.key === row.key ? { ...p, name: e.target.value } : p,
                      ),
                    )
                  }
                />
              </Field>
              <div className="priority-row-actions">
                <label className="checkbox">
                  <input
                    type="radio"
                    name={radioGroup}
                    checked={featured === row.key}
                    onChange={() => setFeatured(row.key)}
                  />
                  {t("Afficher avec un cœur")}
                </label>
                <div className="priority-move">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={index === 0}
                    aria-label={t("Monter {0}", label(row))}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={index === rows.length - 1}
                    aria-label={t("Descendre {0}", label(row))}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  {row.id === undefined && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setRows((items) =>
                          items.filter((p) => p.key !== row.key),
                        );
                        if (featured === row.key)
                          setFeatured(
                            String(previous.find((p) => p.featured)!.id),
                          );
                      }}
                    >
                      {t("Retirer")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </fieldset>
        <button
          type="button"
          className="button secondary"
          disabled={busy || rows.length >= 30}
          onClick={() =>
            setRows((items) => [
              ...items,
              { name: "", key: crypto.randomUUID() },
            ])
          }
        >
          {t("Ajouter une priorité")}
        </button>
        <div className="form-actions">
          <button className="button primary" disabled={busy}>
            {busy ? t("Enregistrement…") : t("Enregistrer")}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("Annuler")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
