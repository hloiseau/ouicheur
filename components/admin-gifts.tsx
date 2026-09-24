"use client";
import { useState } from "react";
import type { Gift } from "../lib/gifts";
import { decimal } from "../lib/format";
import { api, Field, Icon, Notice } from "./ui";

export type GiftDraft = {
  url: string;
  title: string;
  description: string;
  target: string;
  image: string;
  category_id: string | null;
  priority: number;
  visibility: string;
  purchased: boolean;
  closed: boolean;
};
export const blankGift = (): GiftDraft => ({
  url: "",
  title: "",
  description: "",
  target: "",
  image: "",
  category_id: null,
  priority: 0,
  visibility: "draft",
  purchased: false,
  closed: false,
});
export function giftDraft(gift: Gift): GiftDraft {
  return {
    url: gift.url,
    title: gift.title,
    description: gift.description,
    target: decimal(gift.target),
    image: gift.image,
    category_id: gift.category_id,
    priority: gift.priority,
    visibility: gift.visibility,
    purchased: !!gift.purchased,
    closed: !!gift.closed,
  };
}
export function ImagePicker({
  value,
  onChange,
  initialUrl = "",
  label = "Image",
}: {
  value: string;
  onChange: (value: string) => void;
  initialUrl?: string;
  label?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (data: unknown) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ image: string }>("admin/images", data);
      onChange(result.image);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="image-picker">
      <span className="field-label">{label}</span>
      {value && (
        <div className="image-preview">
          <img src={value} alt={`Aperçu ${label.toLowerCase()}`} />
          <button
            type="button"
            className="text-link"
            onClick={() => onChange("")}
          >
            Retirer l’image
          </button>
        </div>
      )}
      <div className="inline-input">
        <input
          aria-label={`URL de ${label.toLowerCase()}`}
          type="url"
          placeholder="https://…/image.jpg"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          className="button secondary"
          disabled={busy || !url}
          onClick={() => send({ url })}
        >
          {busy ? "Import…" : "Importer l’image"}
        </button>
      </div>
      <label className="file-picker">
        <Icon name="upload" size={17} />
        <span>Ou choisir un fichier JPEG, PNG, WebP (5 Mo max.)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              setError("Image limitée à 5 Mo.");
              return;
            }
            const reader = new FileReader();
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
  remoteImage = "",
}: {
  value: GiftDraft;
  onChange: (value: GiftDraft) => void;
  categories: { id: string; name: string }[];
  currency: string;
  remoteImage?: string;
}) {
  const set = <K extends keyof GiftDraft>(key: K, next: GiftDraft[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <>
      <Field label="Lien du produit">
        <input
          required
          type="url"
          value={value.url}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://…"
          maxLength={2048}
        />
      </Field>
      <Field label="Nom de cette envie">
        <input
          required
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={160}
        />
      </Field>
      <Field label="Pourquoi ce cadeau ?">
        <textarea
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
      <div className="form-grid">
        <Field
          label={`Objectif (${currency})`}
          hint="Incluez les frais de livraison prévus."
        >
          <input
            required
            inputMode="decimal"
            value={value.target}
            onChange={(e) => set("target", e.target.value)}
          />
        </Field>
        <Field label="Catégorie">
          <select
            value={value.category_id || ""}
            onChange={(e) => set("category_id", e.target.value || null)}
          >
            <option value="">Sans catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priorité">
          <select
            value={value.priority}
            onChange={(e) => set("priority", Number(e.target.value))}
          >
            <option value={0}>Une petite envie</option>
            <option value={1}>J’aimerais beaucoup</option>
            <option value={2}>Coup de cœur</option>
          </select>
        </Field>
        <Field label="Visibilité">
          <select
            value={value.visibility}
            onChange={(e) => set("visibility", e.target.value)}
          >
            <option value="draft">Brouillon (privé)</option>
            <option value="visible">Visible sur ma wishlist</option>
            <option value="archived">Archivé (privé)</option>
          </select>
        </Field>
      </div>
      <ImagePicker
        key={remoteImage}
        value={value.image}
        initialUrl={remoteImage}
        onChange={(v) => set("image", v)}
      />
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.closed}
          onChange={(e) => set("closed", e.target.checked)}
        />
        Fermer les nouvelles intentions de contribution
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.purchased}
          onChange={(e) => set("purchased", e.target.checked)}
        />
        J’ai effectivement acheté ce cadeau
      </label>
    </>
  );
}
export function GiftEditor({
  gift,
  categories,
  currency,
  onDone,
}: {
  gift: Gift | null;
  categories: { id: string; name: string }[];
  currency: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(gift ? giftDraft(gift) : blankGift());
  const [extractUrl, setExtractUrl] = useState(gift?.url || "");
  const [remoteImage, setRemoteImage] = useState("");
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
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{gift ? "Modifier cette envie" : "Une nouvelle envie"}</h2>
        <button className="text-link" onClick={onDone}>
          Fermer
        </button>
      </div>
      <div className="extract-box">
        <Field label="Commencer avec un lien produit">
          <div className="inline-input">
            <input
              type="url"
              value={extractUrl}
              onChange={(e) => setExtractUrl(e.target.value)}
              placeholder="Collez le lien de votre envie…"
            />
            <button
              type="button"
              className="button secondary"
              disabled={busy || !extractUrl}
              onClick={async () => {
                setBusy(true);
                setError("");
                setNotice("");
                setValue((v) => ({ ...v, url: extractUrl }));
                try {
                  const m = await api<{
                    url: string;
                    title: string;
                    description: string;
                    image_url: string;
                    price: number | null;
                    currency: string;
                    extracted_at: string;
                  }>("admin/extract", { url: extractUrl });
                  setValue((v) => ({
                    ...v,
                    url: extractUrl,
                    title: m.title || v.title,
                    description: m.description || v.description,
                    target:
                      m.price && m.currency === currency
                        ? decimal(m.price)
                        : v.target,
                  }));
                  setRemoteImage(m.image_url);
                  setSuggestion({
                    suggested_price: m.price,
                    suggested_currency: m.currency || null,
                    extracted_at: m.extracted_at,
                  });
                  setNotice(
                    `Aperçu récupéré le ${new Date(m.extracted_at).toLocaleDateString("fr-FR")}. Vérifiez les champs et importez l’image si elle vous convient. ${m.currency && m.currency !== currency ? `La source indique ${m.currency} : saisissez votre objectif en ${currency}, sans conversion automatique.` : "Le prix est une suggestion, sans garantie de disponibilité."}`,
                  );
                } catch (e) {
                  setError(
                    `${(e as Error).message} Vous pouvez compléter le formulaire ci-dessous ; votre lien est conservé.`,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Lecture…" : "Récupérer les informations"}
            </button>
          </div>
        </Field>
      </div>
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice error>{error}</Notice>}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(gift ? `admin/gifts/${gift.id}` : "admin/gifts", {
              ...value,
              ...suggestion,
            });
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <GiftFields
          value={value}
          onChange={setValue}
          categories={categories}
          currency={gift?.currency || currency}
          remoteImage={remoteImage}
        />
        <div className="form-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer cette envie"}
          </button>
          <button className="button secondary" type="button" onClick={onDone}>
            Annuler
          </button>
        </div>
      </form>
    </section>
  );
}
