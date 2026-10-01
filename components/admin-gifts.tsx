"use client";
import { useI18n } from "./language";

import { useEffect, useRef, useState } from "react";
import type { Gift } from "../lib/gifts";
import { decimal } from "../lib/format";
import { money as parseMoney } from "../lib/validation";
import { api, Field, Icon, Notice } from "./ui";
import { Modal } from "./modal";

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
export function ImagePicker({
  value,
  onChange,
  allowUrl = true,
  label = "",
  onBusyChange,
}: {
  value: string;
  onChange: (value: string) => void;
  allowUrl?: boolean;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  label ||= t("Image");
  const [url, setUrl] = useState("");
  const latestChange = useRef(onChange);
  useEffect(() => {
    latestChange.current = onChange;
  }, [onChange]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (data: unknown) => {
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const result = await api<{ image: string }>("admin/images", data);
      latestChange.current(result.image);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <div className="image-picker">
      <span className="field-label">{label}</span>
      {value && (
        <div className="image-preview">
          <img src={value} alt={t("Aperçu {0}", label.toLowerCase())} />
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => onChange("")}
          >
            {t("Retirer l’image")}{" "}
          </button>
        </div>
      )}
      {allowUrl && (
        <div className="inline-input">
          <input
            aria-label={t("URL de {0}", label.toLowerCase())}
            type="url"
            disabled={busy}
            placeholder="https://…/image.jpg"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              if (url && !busy) void send({ url });
            }}
          />
        </div>
      )}
      {busy && <p role="status">{t("Import…")}</p>}
      <label className="file-picker">
        <Icon name="upload" size={17} />
        <span>
          {allowUrl
            ? t("Ou choisir un fichier JPEG, PNG, WebP (5 Mo max.)")
            : t("Choisir une image")}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              setError(t("Image limitée à 5 Mo."));
              return;
            }
            const reader = new FileReader();
            setBusy(true);
            onBusyChange?.(true);
            reader.onerror = () => {
              setError(t("Impossible de lire cette image."));
              setBusy(false);
              onBusyChange?.(false);
            };
            reader.onload = () => {
              void send({ base64: String(reader.result).split(",")[1] });
            };
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
export function GiftFields({
  value,
  onChange,
  categories,
  currency,
  simple = false,
  onImageBusy,
  showDuplicate = true,
}: {
  value: GiftDraft;
  onChange: (value: GiftDraft) => void;
  categories: { id: string; name: string }[];
  currency: string;
  simple?: boolean;
  onImageBusy?: (busy: boolean) => void;
  showDuplicate?: boolean;
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
  const [lists, setLists] = useState<Wishlist[]>([]);
  useEffect(() => {
    void api<Wishlist[]>("admin/lists")
      .then(setLists)
      .catch(() => {});
  }, []);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    const url = value.url;
    const initialImage = value.image;
    setBusy(true);
    setError("");
    setNotice("");
    setValue((v) => ({ ...v, url }));
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
        title: m.title || v.title,
        description: m.description || v.description,
        target:
          m.price && m.currency === (gift?.currency || currency)
            ? decimal(m.price)
            : v.target,
      }));
      setSuggestion({
        suggested_price: m.price,
        suggested_currency: m.currency || null,
        extracted_at: m.extracted_at,
      });
      if (m.image_url) {
        try {
          const { image } = await api<{ image: string }>("admin/images", {
            url: m.image_url,
          });
          setValue((v) => (v.image === initialImage ? { ...v, image } : v));
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
      setError(
        t(
          "{0} Vous pouvez compléter le formulaire ci-dessous ; votre lien est conservé.",
          (e as Error).message,
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={gift ? t("Modifier cette envie") : t("Une nouvelle envie")}
      onClose={onDone}
      busy={busy || uploading}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || uploading) return;
          setBusy(true);
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
            setBusy(false);
          }
        }}
      >
        <div className="extract-box inline-input">
          <Field label={t("Lien du produit")}>
            <input
              type="url"
              required
              autoFocus
              maxLength={2048}
              value={value.url}
              onChange={(e) => setValue((v) => ({ ...v, url: e.target.value }))}
              placeholder={t("Collez le lien de votre envie…")}
            />
          </Field>
          <button
            type="button"
            className="button secondary"
            disabled={busy || uploading || !value.url}
            onClick={() => void extract()}
          >
            {busy ? t("Lecture…") : t("Récupérer les informations")}
          </button>
        </div>
        {gift && (
          <ProductRefresh
            id={gift.id}
            currency={gift.currency}
            onSaved={onSaved || onDone}
          />
        )}
        {notice && <Notice>{notice}</Notice>}
        {error && <Notice error>{error}</Notice>}
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
          categories={categories}
          currency={gift?.currency || currency}
        />
        <div className="form-actions">
          <button className="button primary" disabled={busy || uploading}>
            {busy
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
  );
}
