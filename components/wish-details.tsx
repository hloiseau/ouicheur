"use client";
import { useEffect, useState } from "react";
import type { GiftDraft } from "./admin-gifts";
import { currencies, money } from "../lib/validation";
import {
  offerConditions,
  wishKinds,
  type GiftOffer,
} from "../lib/wish-details";
import { Field } from "./ui";
import { useI18n } from "./language";
export function WishKindField({
  value,
  onChange,
}: {
  value: GiftDraft;
  onChange: (v: GiftDraft) => void;
}) {
  const { t } = useI18n();
  return (
    <Field label={t("Type d’envie")}>
      <select
        value={value.kind || "product"}
        onChange={(e) =>
          onChange({ ...value, kind: e.target.value as GiftDraft["kind"] })
        }
      >
        {Object.entries(wishKinds).map(([key, label]) => (
          <option value={key} key={key}>
            {t(label)}
          </option>
        ))}
      </select>
    </Field>
  );
}
function OfferMoney({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value === null ? "" : String(value / 100));
  useEffect(() => setDraft(value === null ? "" : String(value / 100)), [value]);
  return (
    <Field label={label}>
      <input
        inputMode="decimal"
        maxLength={10}
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          try {
            const n = raw.trim() ? money(raw, true) : null;
            e.target.setCustomValidity("");
            onChange(n);
          } catch {
            e.target.setCustomValidity(
              t("Montant invalide : utilisez au maximum deux décimales."),
            );
          }
        }}
      />
    </Field>
  );
}
export function WishDetailsFields({
  value,
  onChange,
  currency,
}: {
  value: GiftDraft;
  onChange: (v: GiftDraft) => void;
  currency: string;
}) {
  const { t } = useI18n();
  const change = <K extends keyof GiftDraft>(key: K, v: GiftDraft[K]) =>
    onChange({ ...value, [key]: v });
  const offers = value.offers || [];
  const update = (i: number, patch: Partial<GiftOffer>) =>
    change(
      "offers",
      offers.map((o, n) => (n === i ? { ...o, ...patch } : o)),
    );
  return (
    <>
      <Field label={t("Budget")}>
        <select
          value={value.budget_mode || "fixed"}
          onChange={(e) =>
            change("budget_mode", e.target.value as GiftDraft["budget_mode"])
          }
        >
          <option value="fixed">{t("Montant précisé")}</option>
          <option value="unknown">{t("Budget non précisé")}</option>
          <option value="free">{t("Sans dépense nécessaire")}</option>
        </select>
      </Field>
      <details className="advanced-fields">
        <summary>{t("Taille, couleur et modèle")}</summary>
        <div className="stack">
          <div className="form-grid">
            {(
              [
                ["size", "Taille ou format"],
                ["color", "Couleur"],
                ["model", "Édition ou modèle"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={t(label)}>
                <input
                  value={value[key] || ""}
                  maxLength={key === "model" ? 160 : 100}
                  onChange={(e) => change(key, e.target.value)}
                />
              </Field>
            ))}
          </div>
          <Field label={t("Variantes acceptées")}>
            <select
              value={value.variant_policy || "exact"}
              onChange={(e) =>
                change("variant_policy", e.target.value as "exact" | "flexible")
              }
            >
              <option value="exact">
                {t("Respecter ces caractéristiques")}
              </option>
              <option value="flexible">
                {t("Une alternative est possible")}
              </option>
            </select>
          </Field>
          <Field label={t("Précisions sur la variante")}>
            <textarea
              maxLength={500}
              value={value.variant_note || ""}
              onChange={(e) => change("variant_note", e.target.value)}
            />
          </Field>
        </div>
      </details>
      {value.kind && value.kind !== "product" && (
        <Field
          label={t("Quand ou comment offrir (facultatif)")}
          hint={t(
            "Par exemple : un repas partagé, une réparation ou une sortie un week-end. Le créneau reste indicatif.",
          )}
        >
          <input
            maxLength={300}
            value={value.time_hint || ""}
            onChange={(e) => change("time_hint", e.target.value)}
          />
        </Field>
      )}
      <details className="advanced-fields">
        <summary>{t("Autres boutiques et seconde main")}</summary>
        <div className="stack">
          <p>
            {t(
              "Ces offres sont des alternatives pour la même envie et la même quantité. Précisez les différences acceptables ; réserver l’une couvre aussi les autres.",
            )}
          </p>
          {offers.map((o, i) => (
            <fieldset className="panel stack" key={o.id || i}>
              <legend>{t("Offre {0}", i + 1)}</legend>
              <Field label={t("Lien de l’offre")}>
                <input
                  type="url"
                  required
                  maxLength={2048}
                  value={o.url}
                  onChange={(e) =>
                    update(i, {
                      url: e.target.value,
                      checked_at: null,
                      availability: "unknown",
                    })
                  }
                />
              </Field>
              <div className="form-grid">
                <Field label={t("État de l’objet")}>
                  <select
                    value={o.condition}
                    onChange={(e) =>
                      update(i, {
                        condition: e.target.value as GiftOffer["condition"],
                      })
                    }
                  >
                    {Object.entries(offerConditions).map(([key, label]) => (
                      <option value={key} key={key}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("Devise")}>
                  <select
                    value={o.currency}
                    onChange={(e) => update(i, { currency: e.target.value })}
                  >
                    {currencies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="form-grid">
                <OfferMoney
                  label={t("Prix observé (facultatif)")}
                  value={o.price}
                  onChange={(price) =>
                    update(i, { price, checked_at: new Date().toISOString() })
                  }
                />
                <OfferMoney
                  label={t("Livraison (facultatif)")}
                  value={o.shipping}
                  onChange={(shipping) => update(i, { shipping })}
                />
              </div>
              <Field label={t("Disponibilité observée")}>
                <select
                  value={o.availability}
                  onChange={(e) =>
                    update(i, {
                      availability: e.target.value as GiftOffer["availability"],
                      checked_at: new Date().toISOString(),
                    })
                  }
                >
                  <option value="unknown">{t("Non vérifiée")}</option>
                  <option value="available">
                    {t("Disponible lors du relevé")}
                  </option>
                  <option value="unavailable">
                    {t("Indisponible lors du relevé")}
                  </option>
                </select>
              </Field>
              <Field label={t("Différences acceptables et livraison")}>
                <textarea
                  maxLength={500}
                  value={o.note}
                  onChange={(e) => update(i, { note: e.target.value })}
                />
              </Field>
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  change(
                    "offers",
                    offers.filter((_, n) => n !== i),
                  )
                }
              >
                {t("Retirer cette offre")}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="button secondary"
            disabled={offers.length >= 10}
            onClick={() =>
              change("offers", [
                ...offers,
                {
                  url: "",
                  condition: "new",
                  note: "",
                  price: null,
                  currency,
                  shipping: null,
                  availability: "unknown",
                  checked_at: null,
                },
              ])
            }
          >
            {t("Ajouter une offre")}
          </button>
        </div>
      </details>
    </>
  );
}
