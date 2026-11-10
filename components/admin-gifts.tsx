"use client";
import type { WishDetails } from "../lib/wish-details";
import { hasBudget } from "../lib/wish-details";
import {
  WishDetailsFields,
  WishKindField,
  WishBudgetField,
} from "./wish-details";
import { priorityLabel, type GiftPriority } from "../lib/priority-labels";
import { PrioritiesEditor } from "./priorities";
import { useI18n } from "./language";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Gift } from "../lib/gifts";
import { decimal } from "../lib/format";
import { money as parseMoney, webUrl } from "../lib/validation";
import { api, Field, Notice } from "./ui";
import { Modal } from "./modal";
import { ImagePicker } from "./image-picker";
export { ImagePicker } from "./image-picker";
import { CategoryEditor, type Category } from "./categories";

import { PriceHistory } from "./price-history";
import type { Wishlist } from "../lib/lists";

export type GiftDraft = WishDetails & {
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
  closed: boolean;
};
export const blankGift = (): GiftDraft => ({
  kind: "product",
  budget_mode: "fixed",
  offers: [],
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
  closed: false,
});
export function giftDraft(gift: Gift): GiftDraft {
  return {
    kind: gift.kind || "product",
    budget_mode: gift.budget_mode || "fixed",
    size: gift.size,
    color: gift.color,
    model: gift.model,
    variant_note: gift.variant_note,
    variant_policy: gift.variant_policy,
    time_hint: gift.time_hint,
    original_url: gift.original_url,
    offers: gift.offers || [],
    list_id: gift.list_id,
    url: gift.url,
    title: gift.title,
    description: gift.description,
    target:
      gift.budget_mode && gift.budget_mode !== "fixed"
        ? ""
        : decimal(gift.target / gift.quantity),
    quantity: gift.quantity,
    allow_duplicate: false,
    image: gift.image,
    category_id: gift.category_id,
    priority: gift.priority,
    visibility: gift.visibility,
    closed: !!gift.closed,
  };
}
export function GiftFields({
  value,
  onChange,
  priorities,
  categories,
  currency,
  mode = "import",
  merchantField,
  listField,
  onImageBusy,
  showDuplicate = true,
  onManagePriorities,
  onCreateCategory,
  imageEndpoint = "admin/images",
}: {
  value: GiftDraft;
  onChange: (value: GiftDraft) => void;
  priorities: GiftPriority[];
  categories: { id: string; name: string }[];
  currency: string;
  mode?: "quick" | "details" | "import";
  merchantField?: ReactNode;
  listField?: ReactNode;
  onImageBusy?: (busy: boolean) => void;
  showDuplicate?: boolean;
  onManagePriorities?: () => void;
  onCreateCategory?: () => void;
  imageEndpoint?: string | null;
}) {
  const { t, money } = useI18n();
  const set = <K extends keyof GiftDraft>(key: K, next: GiftDraft[K]) =>
    onChange({ ...value, [key]: next });
  const name = (
    <Field label={t("Nom de cette envie")}>
      <input
        name="title"
        required
        value={value.title}
        onChange={(e) => set("title", e.target.value)}
        maxLength={160}
      />
    </Field>
  );
  if (mode === "quick")
    return (
      <>
        {merchantField}
        {name}
      </>
    );

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
  const importing = mode === "import";
  const identity = (
    <>
      {name}
      <WishKindField value={value} onChange={onChange} />
      {importing ? (
        <Field
          label={t(
            !value.kind || value.kind === "product"
              ? "Lien du produit"
              : "Lien (facultatif)",
          )}
        >
          <input
            required={!value.kind || value.kind === "product"}
            type="url"
            value={value.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://…"
            maxLength={2048}
          />
        </Field>
      ) : (
        merchantField
      )}
      <Field label={t("Pourquoi ce cadeau ?")}>
        <textarea
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
      {imageEndpoint !== null && (
        <ImagePicker
          endpoint={imageEndpoint}
          value={value.image}
          allowUrl={false}
          onChange={(v) => set("image", v)}
          onBusyChange={onImageBusy}
        />
      )}
    </>
  );
  const budget = (
    <>
      <WishBudgetField value={value} onChange={onChange} />
      <div className="form-grid">
        {hasBudget(value) && (
          <Field
            label={t("Objectif ({0})", currency)}
            hint={t(
              "Montant pour un exemplaire, livraison comprise. Le total est multiplié par la quantité.",
            )}
          >
            <input
              required={importing}
              inputMode="decimal"
              disabled={!!value.budget_mode && value.budget_mode !== "fixed"}
              value={value.target}
              onChange={(e) => set("target", e.target.value)}
            />
          </Field>
        )}
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
      </div>
      {hasBudget(value) && (
        <p className="fine-print" aria-live="polite">
          {t(
            "Objectif total : {0}",
            total === undefined ? "—" : money(total, currency),
          )}
        </p>
      )}
    </>
  );
  const organization = (
    <>
      {listField}
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
      <Field label={t("Priorité")}>
        <select
          value={value.priority}
          onChange={(e) => set("priority", Number(e.target.value))}
        >
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {priorityLabel(p, t)}
            </option>
          ))}
        </select>
      </Field>
      {onManagePriorities && (
        <button
          type="button"
          className="text-link priority-manage-link"
          onClick={onManagePriorities}
        >
          {t("Gérer les priorités")}
        </button>
      )}
      <Field label={t("Visibilité")}>
        <select
          value={value.visibility}
          onChange={(e) => set("visibility", e.target.value)}
        >
          <option value="visible">{t("Visible sur ma Ouichlist")}</option>
          <option value="archived">{t("Archivé (privé)")}</option>
        </select>
      </Field>
      <div className="gift-pause-option">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={value.closed}
            onChange={(e) => set("closed", e.target.checked)}
          />
          {t("Mettre cette envie en pause")}
        </label>
        <p className="fine-print">
          {t(
            "Bloque les nouvelles participations et réservations sans supprimer le cadeau. Les participations déjà commencées peuvent être finalisées.",
          )}
        </p>
      </div>
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
    </>
  );
  return (
    <>
      {importing ? (
        <>
          {identity}
          {budget}
          {organization}
        </>
      ) : (
        <>
          <section className="gift-editor-section stack">
            <h3>{t("Informations de l’envie")}</h3>
            {identity}
          </section>
          <section className="gift-editor-section stack">
            <h3>{t("Budget et quantité")}</h3>
            {budget}
          </section>
          <section className="gift-editor-section stack">
            <h3>{t("Organisation de l’envie")}</h3>
            {organization}
          </section>
        </>
      )}
      <WishDetailsFields
        expanded={!importing}
        value={value}
        onChange={onChange}
        currency={currency}
      />
    </>
  );
}
export function GiftEditor({
  gift,
  priorities,
  categories,
  currency,
  onDone,
  onSaved,
  categoryId = null,
  listId = "default",
  initialUrl = "",
  initialTitle = "",
  suggestion: proposed,
  onCategoriesChanged,
  apiPrefix = "admin",
}: {
  gift: Gift | null;
  priorities: GiftPriority[];
  categories: { id: string; name: string }[];
  currency: string;
  onDone: () => void;
  onSaved?: () => void;
  categoryId?: string | null;
  listId?: string;
  initialUrl?: string;
  initialTitle?: string;
  suggestion?: { id: string; title: string };
  onCategoriesChanged?: () => void;
  apiPrefix?: "admin" | "team";
}) {
  const { t, date, money } = useI18n();
  const [value, setValue] = useState(
    gift
      ? giftDraft(gift)
      : {
          ...blankGift(),
          category_id: categoryId,
          list_id: listId,
          url: initialUrl,
          title: proposed?.title || initialTitle,
        },
  );
  const [showDetails, setShowDetails] = useState(Boolean(gift || proposed));
  const [priorityEditor, setPriorityEditor] = useState(false);
  const [savedPriorities, setSavedPriorities] = useState<GiftPriority[] | null>(
    null,
  );
  const priorityOptions = savedPriorities || priorities;
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
    void api<Wishlist[]>(`${apiPrefix}/lists`)
      .then(setLists)
      .catch(() => {});
  }, [apiPrefix]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [operation, setOperation] = useState<"extract" | "save" | null>(null);
  const busy = operation !== null;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (showDetails)
      formRef.current
        ?.querySelector<HTMLInputElement>('input[name="title"]')
        ?.focus();
  }, [showDetails]);
  const triedInitialUrl = useRef(false);
  const extracting = useRef(false);
  const imported = useRef<
    Partial<Pick<GiftDraft, "title" | "description" | "target" | "image">>
  >({});
  const [suggestion, setSuggestion] = useState<{
    suggested_price: number | null;
    suggested_currency: string | null;
    extracted_at: string | null;
  }>({
    suggested_price: gift?.suggested_price || null,
    suggested_currency: gift?.suggested_currency || null,
    extracted_at: gift?.extracted_at || null,
  });
  const changeLink = (url: string) => {
    const auto = imported.current;
    imported.current = {};
    const next = {
      ...value,
      url,
      original_url: url,
      title: value.title === auto.title ? "" : value.title,
      description:
        value.description === auto.description ? "" : value.description,
      target: value.target === auto.target ? "" : value.target,
      image: value.image === auto.image ? "" : value.image,
    };
    setValue(next);
    setExtractionError("");
    setNotice("");
    setSuggestion({
      suggested_price: null,
      suggested_currency: null,
      extracted_at: null,
    });
    return next;
  };
  const extract = async (initial: GiftDraft) => {
    if (busy || uploading || extracting.current) return;
    const url = initial.url;
    try {
      webUrl(url);
    } catch (error) {
      setExtractionError(t((error as Error).message));
      return;
    }
    extracting.current = true;
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
      }>(`${apiPrefix}/extract`, { url });
      const suggestedTarget =
        hasBudget(initial) &&
        !initial.target.trim() &&
        m.price &&
        m.currency === (gift?.currency || currency)
          ? decimal(m.price)
          : undefined;
      imported.current = {
        ...imported.current,
        ...(!initial.title.trim() && m.title ? { title: m.title } : {}),
        ...(!initial.description.trim() && m.description
          ? { description: m.description }
          : {}),
        ...(suggestedTarget ? { target: suggestedTarget } : {}),
      };
      setValue((v) => ({
        ...v,
        url: m.url,
        original_url: initial.original_url || url,
        title:
          !initial.title.trim() && v.title === initial.title
            ? m.title || v.title
            : v.title,
        description:
          !initial.description.trim() && v.description === initial.description
            ? m.description || v.description
            : v.description,
        target:
          v.target === initial.target && hasBudget(v)
            ? suggestedTarget || v.target
            : v.target,
      }));
      setSuggestion({
        suggested_price: m.price,
        suggested_currency: m.currency || null,
        extracted_at: m.extracted_at,
      });
      if (m.image_url && !initial.image) {
        try {
          const { image } = await api<{ image: string }>(
            `${apiPrefix}/images`,
            {
              url: m.image_url,
            },
          );
          imported.current.image = image;
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
            : m.price === null
              ? t("Aucun prix trouvé. Vous pouvez enregistrer sans budget.")
              : t(
                  "Le prix est une suggestion, sans garantie de disponibilité.",
                ),
        ),
      );
    } catch (e) {
      setExtractionError((e as Error).message);
    } finally {
      extracting.current = false;
      setOperation(null);
    }
  };
  useEffect(() => {
    if (!gift && initialUrl && !triedInitialUrl.current) {
      triedInitialUrl.current = true;
      void extract(value);
    }
  }, [gift, initialUrl]);
  const merchantField = (
    <>
      <div className="extract-box inline-input">
        <Field label={t("Lien du produit")}>
          <input
            type="url"
            autoFocus
            maxLength={2048}
            readOnly={busy}
            value={value.url}
            onChange={(e) => changeLink(e.target.value)}
            onPaste={(event) => {
              if (busy || uploading || extracting.current) return;
              const pasted = event.clipboardData.getData("text").trim();
              try {
                webUrl(pasted);
              } catch {
                return;
              }
              event.preventDefault();
              void extract(changeLink(pasted));
            }}
            placeholder={t("Collez le lien de votre envie…")}
          />
        </Field>
        {value.url && !notice && operation !== "extract" && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || uploading}
            onClick={() => void extract(value)}
          >
            {t("Récupérer les informations")}
          </button>
        )}
      </div>
      {operation === "extract" && <Notice>{t("Lecture…")}</Notice>}
      {notice && (
        <div className="gift-import-preview">
          {value.image && (
            <img src={value.image} width={56} height={56} alt="" />
          )}
          <div>
            {suggestion.suggested_price !== null &&
              suggestion.suggested_currency && (
                <strong>
                  {t(
                    "Prix relevé : {0}",
                    money(
                      suggestion.suggested_price,
                      suggestion.suggested_currency,
                    ),
                  )}
                </strong>
              )}
            <p role="status">{notice}</p>
          </div>
        </div>
      )}
      {error && <Notice error>{error}</Notice>}
      {extractionError && (
        <Notice error>
          <p>
            {t(
              "L’import n’a pas abouti. Le lien est conservé. Ajoutez simplement un nom.",
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
    </>
  );
  return (
    <>
      <Modal
        title={
          gift
            ? t("Modifier cette envie")
            : showDetails
              ? t("Détails de la nouvelle envie")
              : t("Une nouvelle envie")
        }
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
                    ? `${apiPrefix}/gifts/${gift.id}`
                    : `${apiPrefix}/gifts`,
                {
                  ...value,
                  budget_mode:
                    hasBudget(value) && !value.target.trim()
                      ? "unknown"
                      : value.budget_mode,
                  original_url: value.original_url || value.url,
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
          <GiftFields
            mode={showDetails ? "details" : "quick"}
            merchantField={merchantField}
            listField={
              !proposed && lists.length > 1 ? (
                <Field label={t("Liste")}>
                  <select
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
              ) : undefined
            }
            onImageBusy={setUploading}
            value={value}
            onChange={setValue}
            priorities={priorityOptions}
            imageEndpoint={`${apiPrefix}/images`}
            onManagePriorities={
              apiPrefix === "admin" ? () => setPriorityEditor(true) : undefined
            }
            categories={categoryOptions}
            onCreateCategory={
              apiPrefix === "admin" ? () => setCategoryEditor(true) : undefined
            }
            currency={gift?.currency || currency}
          />
          <div className="form-actions">
            <button
              className="button primary"
              disabled={busy || uploading || !value.title.trim()}
            >
              {operation === "save"
                ? t("Enregistrement…")
                : proposed
                  ? t("Accepter et créer l’envie")
                  : t("Enregistrer cette envie")}
            </button>
            {!showDetails && (
              <button
                className="button secondary"
                type="button"
                disabled={operation === "save"}
                onClick={() => setShowDetails(true)}
              >
                {t("Compléter les détails")}
              </button>
            )}
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
        {gift &&
          apiPrefix === "admin" &&
          !!(gift.url || gift.offers?.length) && (
            <PriceHistory gift={gift} onSaved={onSaved || onDone} />
          )}
      </Modal>
      {priorityEditor && (
        <PrioritiesEditor
          priorities={priorityOptions}
          onClose={() => setPriorityEditor(false)}
          onSaved={(items) => {
            setSavedPriorities(items);
            setPriorityEditor(false);
            onCategoriesChanged?.();
          }}
        />
      )}
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
