"use client";

import { useState } from "react";
import { ImagePicker } from "./image-picker";
import { useI18n } from "./language";
import { Modal } from "./modal";
import { api, Field, Icon, Notice } from "./ui";

export type Category = { id: string; name: string; image: string };

export function Categories({
  categories,
  gifts,
  selected,
  onSelect,
  editable = false,
  onSaved,
}: {
  categories: Category[];
  gifts: { category_id: string | null; image: string }[];
  selected: string;
  onSelect: (id: string) => void;
  editable?: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [editor, setEditor] = useState<Category | "new" | null>(null);
  const count = (n: number) => (n === 1 ? t("1 envie") : t("{0} envies", n));
  return (
    <>
      <div className="collection-strip" aria-label={t("Filtrer par catégorie")}>
        <button
          type="button"
          className="collection-card"
          aria-pressed={!selected}
          onClick={() => onSelect("")}
        >
          <span className="collection-art">
            <Icon name="grid" size={28} />
          </span>
          <span>
            <strong>{t("Tout")}</strong>
            <small>{count(gifts.length)}</small>
          </span>
        </button>
        {categories.map((category) => {
          const items = gifts.filter(
            (gift) => gift.category_id === category.id,
          );
          if (!editable && !items.length) return null;
          const image =
            category.image || items.find((gift) => gift.image)?.image;
          return (
            <div className="collection-item" key={category.id}>
              <button
                type="button"
                className="collection-card"
                aria-pressed={selected === category.id}
                onClick={() => onSelect(category.id)}
              >
                <span className="collection-art">
                  {image ? (
                    <img src={image} alt="" loading="lazy" />
                  ) : (
                    <Icon name="gift" size={28} />
                  )}
                </span>
                <span>
                  <strong>{category.name}</strong>
                  <small>{count(items.length)}</small>
                </span>
              </button>
              {editable && (
                <button
                  type="button"
                  className="collection-edit"
                  aria-label={t("Modifier la catégorie {0}", category.name)}
                  onClick={() => setEditor(category)}
                >
                  ✎
                </button>
              )}
            </div>
          );
        })}
        {editable && (
          <button
            type="button"
            className="collection-card collection-add"
            onClick={() => setEditor("new")}
          >
            <span className="collection-art">
              <Icon name="plus" size={28} />
            </span>
            <span>
              <strong>{t("Nouvelle catégorie")}</strong>
              <small>{t("Un nom, une image")}</small>
            </span>
          </button>
        )}
      </div>
      {editor && (
        <CategoryEditor
          category={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setEditor(null);
            onSelect(id);
            onSaved();
          }}
        />
      )}
    </>
  );
}

export function CategoryEditor({
  category,
  onClose,
  onSaved,
}: {
  category: Category | null;
  onClose: () => void;
  onSaved: (id: string, category?: Category) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(category?.name || "");
  const [image, setImage] = useState(category?.image || "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={category ? t("Modifier la catégorie") : t("Nouvelle catégorie")}
      onClose={onClose}
      busy={busy || uploading}
    >
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || uploading) return;
          setBusy(true);
          setError("");
          try {
            const result = await api<{ id: string }>("admin/categories", {
              id: category?.id,
              name,
              image,
            });
            onSaved(result.id, { id: result.id, name: name.trim(), image });
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("Nom de la catégorie")}>
          <input
            required
            autoFocus
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <ImagePicker
          label={t("Image de la catégorie")}
          value={image}
          onChange={setImage}
          onBusyChange={setUploading}
          allowUrl={false}
        />
        {error && <Notice error>{error}</Notice>}
        <div className="form-actions">
          <button className="button primary" disabled={busy || uploading}>
            {busy ? t("Enregistrement…") : t("Enregistrer")}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || uploading}
            onClick={onClose}
          >
            {t("Annuler")}
          </button>
        </div>
        {category && (
          <details className="category-delete">
            <summary>{t("Supprimer cette catégorie")}</summary>
            <p>{t("Les envies seront conservées, sans catégorie.")}</p>
            <button
              type="button"
              className="button secondary"
              disabled={busy || uploading}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("admin/categories/delete", { id: category.id });
                  onSaved("");
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Confirmer la suppression")}
            </button>
          </details>
        )}
      </form>
    </Modal>
  );
}
