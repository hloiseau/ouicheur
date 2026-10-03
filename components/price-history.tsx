"use client";
import { useEffect, useState } from "react";
import type { Gift } from "../lib/gifts";
import { money as parseMoney } from "../lib/validation";
import { ProductRefresh } from "./product-refresh";
import { api, Field, Notice } from "./ui";
import { useI18n } from "./language";
type History = {
  identity: { currency: string; fingerprint: string };
  watch: null | {
    threshold: number | null;
    stock_alert: number;
    automatic: number;
    confirmed_variant: number;
    paused: string;
    stale: boolean;
  };
  items: {
    id: string;
    url: string;
    price: number | null;
    currency: string;
    shipping: number | null;
    availability: string;
    checked_at: string;
    state: string;
    method: string;
    fingerprint: string;
  }[];
};
export function PriceHistory({
  gift,
  onSaved,
}: {
  gift: Gift;
  onSaved: () => void;
}) {
  const { t, money, date } = useI18n();
  const [offer, setOffer] = useState(
      gift.url ? "" : gift.offers?.[0]?.id || "",
    ),
    [data, setData] = useState<History | null>(null),
    [threshold, setThreshold] = useState(""),
    [stock, setStock] = useState(false),
    [automatic, setAutomatic] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const endpoint = `admin/price-history?gift_id=${gift.id}&offer_id=${offer}`;
  const load = async () => setData(await api<History>(endpoint));
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    setNotice("");
    void api<History>(endpoint)
      .then((d) => {
        if (active) {
          setData(d);
          setThreshold(
            d.watch?.threshold == null
              ? ""
              : (d.watch.threshold / 100).toFixed(2),
          );
          setStock(!!d.watch?.stock_alert);
          setAutomatic(!!d.watch?.automatic);
          setConfirmed(!!d.watch?.confirmed_variant && !d.watch.stale);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);
  return (
    <details className="panel stack price-history">
      <summary>{t("Prix, disponibilité et alertes")}</summary>
      <div className="stack">
        <p>
          {t(
            "Les relevés ne changent jamais l’objectif ni les prix saisis. Les frais de livraison restent une indication manuelle distincte.",
          )}
        </p>
        <Field label={t("Offre à suivre")}>
          <select
            disabled={busy}
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
          >
            {gift.url && <option value="">{t("Lien principal")}</option>}
            {gift.offers?.map((o, i) => (
              <option value={o.id} key={o.id}>
                {t("Offre {0}", i + 1)} · {new URL(o.url).hostname}
              </option>
            ))}
          </select>
        </Field>
        {offer === "" ? (
          <ProductRefresh
            id={gift.id}
            currency={gift.currency}
            allowApply={gift.budget_mode === "fixed"}
            onSaved={onSaved}
            onChecked={() =>
              void load().catch((e: Error) => setError(e.message))
            }
          />
        ) : (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await api<{ state: string }>(
                  "admin/price-history/refresh",
                  { gift_id: gift.id, offer_id: offer },
                );
                await load();
                setNotice(
                  t(
                    result.state === "ok"
                      ? "Relevé enregistré sans modifier l’envie."
                      : "Relevé indisponible ou non comparable. Aucun montant n’a été modifié.",
                  ),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Relever cette offre")}
          </button>
        )}
        {data && (
          <>
            {(data.watch?.paused || data.watch?.stale) && (
              <Notice>
                {t(
                  "Le suivi automatique est en pause : source indisponible ou caractéristiques modifiées. Vérifiez le lien avant de le réactiver.",
                )}
              </Notice>
            )}
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api("admin/price-watch", {
                    gift_id: gift.id,
                    offer_id: offer,
                    threshold: threshold.trim()
                      ? parseMoney(threshold, true)
                      : null,
                    stock_alert: stock,
                    automatic,
                    confirmed_variant: confirmed,
                    confirm: true,
                  });
                  await load();
                  setNotice(
                    t(
                      "Suivi enregistré. Activez le type « Baisse de prix ou disponibilité » dans vos notifications pour recevoir les alertes.",
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field
                label={t(
                  "Me prévenir à ce prix ou moins ({0})",
                  data.identity.currency,
                )}
                hint={t(
                  "Prix unitaire hors livraison. Laisser vide pour ne pas surveiller un seuil.",
                )}
              >
                <input
                  inputMode="decimal"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={stock}
                  onChange={(e) => setStock(e.target.checked)}
                />
                {t("Me prévenir d’un retour en stock")}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={automatic}
                  onChange={(e) => setAutomatic(e.target.checked)}
                />
                {t("Actualiser automatiquement cette offre")}
              </label>
              <p className="fine-print">
                {t(
                  "Au maximum un relevé par jour pour cette offre, 20 par jour pour l’instance et deux par heure pour un marchand. Un refus ou une erreur arrête ce suivi, sans contournement.",
                )}
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {t(
                  "J’ai vérifié que ce lien correspond bien à la variante choisie",
                )}
              </label>
              <button className="button secondary" disabled={busy}>
                {t("Enregistrer ce suivi")}
              </button>
            </form>
            {data.items.length ? (
              <div
                className="table-scroll"
                role="region"
                aria-label={t("Historique des relevés")}
                tabIndex={0}
              >
                <table>
                  <caption>{t("Historique des relevés")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("Date")}</th>
                      <th scope="col">{t("Prix unitaire")}</th>
                      <th scope="col">{t("Disponibilité")}</th>
                      <th scope="col">{t("Source du relevé")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.id}>
                        <td>{date(row.checked_at)}</td>
                        <td>
                          {row.price == null
                            ? "—"
                            : money(
                                row.price,
                                row.currency || data.identity.currency,
                              )}
                          {(row.state !== "ok" ||
                            row.fingerprint !== data.identity.fingerprint) && (
                            <p>{t("Non comparable")}</p>
                          )}
                          {row.shipping !== null && (
                            <p>
                              {t(
                                "Livraison indiquée : {0}",
                                money(row.shipping, data.identity.currency),
                              )}
                            </p>
                          )}
                        </td>
                        <td>{t(row.availability)}</td>
                        <td>
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {new URL(row.url).hostname} ↗
                          </a>
                          <p>
                            {t(
                              row.method === "manual"
                                ? "Relevé manuel"
                                : "Relevé automatique",
                            )}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{t("Aucun relevé pour cette offre.")}</p>
            )}
            <p className="fine-print">
              {t(
                "100 relevés au maximum par offre, conservés pendant 180 jours. Les devises et variantes différentes ne sont jamais comparées.",
              )}
            </p>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && <Notice error>{error}</Notice>}
      </div>
    </details>
  );
}
