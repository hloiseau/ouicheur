"use client";
import { useI18n } from "./language";

import { useEffect, useId, useRef, useState } from "react";
import type { Gift } from "../lib/gifts";
import { decimal } from "../lib/format";
import { money as parseMoney } from "../lib/validation";
import { api, Field, Notice } from "./ui";
import { Modal } from "./modal";
import { ImagePicker } from "./image-picker";
export { ImagePicker } from "./image-picker";
import { CategoryEditor, type Category } from "./categories";

import { ProductRefresh } from "./product-refresh";
import type { Wishlist } from "../lib/lists";

export type GiftDraft = {
  list_id?: string;
  url: string;
  title: string;
  description: string;
  target: string;
  quantity: number;
  allow_duplicate: boolean;
  image: string;
  category_id: string | null;
  priority: number;
  visibility: string;
  purchased: boolean;
  closed: boolean;
  japan_search: boolean;
};
export const blankGift = (): GiftDraft => ({
  url: "",
  title: "",
  description: "",
  target: "",
  quantity: 1,
  allow_duplicate: false,
  image: "",
  category_id: null,
  priority: 0,
  visibility: "visible",
  purchased: false,
  closed: false,
  japan_search: false,
});
export function giftDraft(gift: Gift): GiftDraft {
  return {
    list_id: gift.list_id,
    url: gift.url,
    title: gift.title,
    description: gift.description,
    target: decimal(gift.target / gift.quantity),
    quantity: gift.quantity,
    allow_duplicate: false,
    image: gift.image,
    category_id: gift.category_id,
    priority: gift.priority,
    visibility: gift.visibility,
    purchased: !!gift.purchased,
    closed: !!gift.closed,
    japan_search: !!gift.japan_search,
  };
}
export function GiftFields({
  value,
  onChange,
  categories,
  currency,
  simple = false,
  onImageBusy,
  showDuplicate = true,
  onCreateCategory,
}: {
  value: GiftDraft;
  onChange: (value: GiftDraft) => void;
  categories: { id: string; name: string }[];
  currency: string;
  simple?: boolean;
  onImageBusy?: (busy: boolean) => void;
  showDuplicate?: boolean;
  onCreateCategory?: () => void;
}) {
  const { t, money } = useI18n();
  let total: number | undefined;
  try {
    const amount = parseMoney(value.target) * value.quantity;
    if (
      Number.isInteger(value.quantity) &&
      value.quantity >= 1 &&
      value.quantity <= 999 &&
      amount <= 100000000
    )
      total = amount;
  } catch {
    /* The form remains editable while the amount is incomplete. */
  }
  const set = <K extends keyof GiftDraft>(key: K, next: GiftDraft[K]) =>
    onChange({ ...value, [key]: next });
  const Options = simple ? "details" : "div";
  return (
    <>
      {!simple && (
        <>
          <Field label={t("Lien du produit")}>
            <input
              required
              type="url"
              value={value.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://…"
              maxLength={2048}
            />
          </Field>
        </>
      )}
      <Field label={t("Nom de cette envie")}>
        <input
          name="title"
          required
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={160}
        />
      </Field>
      <div className="form-grid">
        <Field
          label={t("Objectif ({0})", currency)}
          hint={t(
            "Montant pour un exemplaire, livraison comprise. Le total est multiplié par la quantité.",
          )}
        >
          <input
            required
            inputMode="decimal"
            value={value.target}
            onChange={(e) => set("target", e.target.value)}
          />
        </Field>
        <Field label={t("Quantité")}>
          <input
            type="number"
            required
            min={1}
            max={999}
            step={1}
            value={value.quantity || ""}
            onChange={(e) => set("quantity", Number(e.target.value))}
          />
        </Field>
        <div className="category-field">
          <Field label={t("Catégorie")}>
            <select
              value={value.category_id || ""}
              onChange={(e) => set("category_id", e.target.value || null)}
            >
              <option value="">{t("Sans catégorie")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {onCreateCategory && (
            <button
              type="button"
              className="text-link"
              onClick={onCreateCategory}
            >
              {t("Créer une catégorie")}
            </button>
          )}
        </div>
      </div>
      <p className="fine-print" aria-live="polite">
        {t(
          "Objectif total : {0}",
          total === undefined ? "—" : money(total, currency),
        )}
      </p>
      {showDuplicate && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={value.allow_duplicate}
            onChange={(e) => set("allow_duplicate", e.target.checked)}
          />
          {t("Autoriser un doublon")}
        </label>
      )}
      <ImagePicker
        value={value.image}
        allowUrl={false}
        onChange={(v) => set("image", v)}
        onBusyChange={onImageBusy}
      />

      <Options className="gift-options">
        {simple && <summary>{t("Plus d’options")}</summary>}
        <div className="stack">
          <Field label={t("Priorité")}>
            <select
              value={value.priority}
              onChange={(e) => set("priority", Number(e.target.value))}
            >
              <option value={0}>{t("Une petite envie")}</option>
              <option value={1}>{t("J’aimerais beaucoup")}</option>
              <option value={2}>{t("Coup de cœur")}</option>
            </select>
          </Field>
          <Field label={t("Visibilité")}>
            <select
              value={value.visibility}
              onChange={(e) => set("visibility", e.target.value)}
            >
              <option value="visible">{t("Visible sur ma Ouichlist")}</option>
              <option value="archived">{t("Archivé (privé)")}</option>
            </select>
          </Field>
          <Field label={t("Pourquoi ce cadeau ?")}>
            <textarea
              value={value.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.japan_search}
              onChange={(e) => set("japan_search", e.target.checked)}
            />
            {t("Activer la recherche au Japon avec ChatGPT et Sendico")}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.closed}
              onChange={(e) => set("closed", e.target.checked)}
            />
            {t("Fermer les nouvelles intentions de contribution")}{" "}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.purchased}
              onChange={(e) => set("purchased", e.target.checked)}
            />
            {t("J’ai effectivement acheté ce cadeau")}{" "}
          </label>
        </div>
      </Options>
    </>
  );
}
export function GiftEditor({
  gift,
  categories,
  currency,
  onDone,
  onSaved,
  categoryId = null,
  listId = "default",
  initialUrl = "",
  suggestion: proposed,
  onCategoriesChanged,
}: {
  gift: Gift | null;
  categories: { id: string; name: string }[];
  currency: string;
  onDone: () => void;
  onSaved?: () => void;
  categoryId?: string | null;
  listId?: string;
  initialUrl?: string;
  suggestion?: { id: string; title: string };
  onCategoriesChanged?: () => void;
}) {
  const { t, date } = useI18n();
  const [value, setValue] = useState(
    gift
      ? giftDraft(gift)
      : {
          ...blankGift(),
          category_id: categoryId,
          list_id: listId,
          url: initialUrl,
          title: proposed?.title || "",
        },
  );
  const [categoryEditor, setCategoryEditor] = useState(false);
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const categoryOptions = [
    ...categories,
    ...createdCategories.filter(
      (c) => !categories.some((existing) => existing.id === c.id),
    ),
  ];
  const [lists, setLists] = useState<Wishlist[]>([]);
  useEffect(() => {
    void api<Wishlist[]>("admin/lists")
      .then(setLists)
      .catch(() => {});
  }, []);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [operation, setOperation] = useState<"extract" | "save" | null>(null);
  const busy = operation !== null;
  const formRef = useRef<HTMLFormElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const urlHintId = useId();
  const [suggestion, setSuggestion] = useState<{
    suggested_price: number | null;
    suggested_currency: string | null;
    extracted_at: string | null;
  }>({
    suggested_price: gift?.suggested_price || null,
    suggested_currency: gift?.suggested_currency || null,
    extracted_at: gift?.extracted_at || null,
  });
  const extract = async () => {
    if (busy || uploading || !urlRef.current?.reportValidity()) return;
    const initial = value;
    const url = initial.url;
    setOperation("extract");
    setError("");
    setExtractionError("");
    setNotice("");
    try {
      const m = await api<{
        url: string;
        title: string;
        description: string;
        image_url: string;
        price: number | null;
        currency: string;
        extracted_at: string;
      }>("admin/extract", { url });
      setValue((v) => ({
        ...v,
        url: m.url,
        title:
          !initial.title.trim() && v.title === initial.title
            ? m.title || v.title
            : v.title,
        description:
          !initial.description.trim() && v.description === initial.description
            ? m.description || v.description
            : v.description,
        target:
          !initial.target.trim() &&
          v.target === initial.target &&
          m.price &&
          m.currency === (gift?.currency || currency)
            ? decimal(m.price)
            : v.target,
      }));
      setSuggestion({
        suggested_price: m.price,
        suggested_currency: m.currency || null,
        extracted_at: m.extracted_at,
      });
      if (m.image_url && !initial.image) {
        try {
          const { image } = await api<{ image: string }>("admin/images", {
            url: m.image_url,
          });
          setValue((v) => (v.image === initial.image ? { ...v, image } : v));
        } catch (e) {
          setError(
            t(
              "Les informations sont récupérées, mais l’image n’a pas pu être importée : {0}",
              (e as Error).message,
            ),
          );
        }
      }
      setNotice(
        t(
          "Aperçu récupéré le {0}. Vérifiez les informations avant d’enregistrer. {1}",
          date(m.extracted_at, true),
          m.currency && m.currency !== (gift?.currency || currency)
            ? t(
                "La source indique {0} : saisissez votre objectif en {1}, sans conversion automatique.",
                m.currency,
                gift?.currency || currency,
              )
            : t("Le prix est une suggestion, sans garantie de disponibilité."),
        ),
      );
    } catch (e) {
      setExtractionError((e as Error).message);
    } finally {
      setOperation(null);
    }
  };
  return (
    <>
      <Modal
        title={gift ? t("Modifier cette envie") : t("Une nouvelle envie")}
        onClose={onDone}
        busy={busy || uploading}
      >
        <form
          ref={formRef}
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || uploading) return;
            setOperation("save");
            setError("");
            try {
              await api(
                proposed
                  ? `admin/suggestions/${proposed.id}/accept`
                  : gift
                    ? `admin/gifts/${gift.id}`
                    : "admin/gifts",
                {
                  ...value,
                  ...suggestion,
                },
              );
              (onSaved || onDone)();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setOperation(null);
            }
          }}
        >
          <div className="extract-box inline-input">
            <Field label={t("Lien du produit")}>
              <input
                ref={urlRef}
                aria-describedby={urlHintId}
                type="url"
                required
                autoFocus
                maxLength={2048}
                readOnly={busy}
                value={value.url}
                onChange={(e) => {
                  setValue((v) => ({ ...v, url: e.target.value }));
                  setExtractionError("");
                  setNotice("");
                  setSuggestion({
                    suggested_price: null,
                    suggested_currency: null,
                    extracted_at: null,
                  });
                }}
                placeholder={t("Collez le lien de votre envie…")}
              />
            </Field>
            <button
              type="button"
              className="button secondary"
              disabled={busy || uploading || !value.url}
              onClick={() => void extract()}
            >
              {operation === "extract"
                ? t("Lecture…")
                : t("Récupérer les informations")}
            </button>
          </div>
          <p className="fine-print" id={urlHintId}>
            {t(
              "La récupération est facultative. Seuls les champs vides sont complétés.",
            )}
          </p>
          {gift && (
            <ProductRefresh
              id={gift.id}
              currency={gift.currency}
              onSaved={onSaved || onDone}
            />
          )}
          {notice && <Notice>{notice}</Notice>}
          {error && <Notice error>{error}</Notice>}
          {extractionError && (
            <Notice error>
              <p>
                {t(
                  "La récupération automatique n’a pas abouti. Votre lien est conservé : ajoutez le nom et le montant pour enregistrer cette envie.",
                )}
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  formRef.current
                    ?.querySelector<HTMLInputElement>('input[name="title"]')
                    ?.focus()
                }
              >
                {t("Compléter manuellement")}
              </button>
              <details>
                <summary>{t("Détail de l’erreur")}</summary>
                <p>{extractionError}</p>
              </details>
            </Notice>
          )}
          <Field label={t("Liste")}>
            <select
              disabled={!!proposed}
              value={value.list_id || "default"}
              onChange={(e) =>
                setValue((v) => ({ ...v, list_id: e.target.value }))
              }
            >
              {lists.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <GiftFields
            simple
            onImageBusy={setUploading}
            value={value}
            onChange={setValue}
            categories={categoryOptions}
            onCreateCategory={() => setCategoryEditor(true)}
            currency={gift?.currency || currency}
          />
          <div className="form-actions">
            <button className="button primary" disabled={busy || uploading}>
              {operation === "save"
                ? t("Enregistrement…")
                : proposed
                  ? t("Accepter et créer l’envie")
                  : t("Enregistrer cette envie")}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy || uploading}
              onClick={onDone}
            >
              {t("Annuler")}{" "}
            </button>
          </div>
        </form>
      </Modal>
      {categoryEditor && (
        <CategoryEditor
          category={null}
          onClose={() => setCategoryEditor(false)}
          onSaved={(id, category) => {
            if (category) setCreatedCategories((items) => [...items, category]);
            setValue((v) => ({ ...v, category_id: id }));
            setCategoryEditor(false);
            onCategoriesChanged?.();
          }}
        />
      )}
    </>
  );
}
