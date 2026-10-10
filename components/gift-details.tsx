"use client";
import { appearanceStyle } from "../lib/appearance";
import {
  hasBudget,
  variantSummary,
  wishKinds,
  offerConditions,
} from "../lib/wish-details";
import { priorityLabel, type GiftPriority } from "../lib/priority-labels";
import type { Gift, PublicProfile } from "../lib/gifts";
import { PageHeader } from "./page-header";
import { ReservationForm } from "./reservation";
import { useI18n } from "./language";
import { useAppHref } from "./runtime";
import Link from "next/link";
import { GiftArt, Progress } from "./public-wishlist";
import { ContributionForm } from "./contribution";
import { SurpriseNotice } from "./surprise-notice";
import { GiftPurchaseToggle } from "./gift-purchase-toggle";
export function GiftDetails({
  gift,
  profile,
  priority,
  supporters,
  owner = false,
  onRefresh,
  manageReservations = true,
}: {
  gift: Gift;
  profile: PublicProfile;
  priority?: GiftPriority;
  supporters: Record<string, unknown>[];
  owner?: boolean;
  onRefresh?: () => void;
  manageReservations?: boolean;
}) {
  const { t, money, date } = useI18n();
  const href = useAppHref(),
    id = gift.id;
  const closed =
    !!gift.closed ||
    !!gift.purchased ||
    !hasBudget(gift) ||
    gift.funded >= gift.target ||
    gift.currency !== profile.currency;
  const reservationClosed =
    !!gift.closed || !!gift.purchased || gift.visibility !== "visible";
  return (
    <div style={appearanceStyle(profile)}>
      <PageHeader
        back
        backName={profile.name}
        backHref={href(`/lists/${gift.list_id}`)}
      />
      <main id="main" className="container detail-page">
        <div className="detail-art">
          <GiftArt gift={gift} detail />
        </div>
        <section className="detail-content">
          <span className="eyebrow">
            {gift.category || t("Une petite envie")}
          </span>
          <h1>{gift.title}</h1>
          <div className="detail-price">
            <strong>
              {hasBudget(gift)
                ? money(gift.target, gift.currency)
                : t(
                    gift.budget_mode === "free"
                      ? "Sans dépense nécessaire"
                      : "Budget non précisé",
                  )}
            </strong>
            {hasBudget(gift) && <span>{t("Budget estimé")}</span>}
          </div>
          {priority && (
            <p className="fine-print">
              {t("Priorité")} : {priorityLabel(priority, t)}
            </p>
          )}
          {gift.description.length > 400 ? (
            <details className="detail-description">
              <summary>{t("Description complète de cette envie")}</summary>
              <p>{gift.description}</p>
            </details>
          ) : gift.description ? (
            <p className="detail-description">{gift.description}</p>
          ) : null}
          {gift.kind && gift.kind !== "product" && (
            <p>{t(wishKinds[gift.kind])}</p>
          )}
          {variantSummary(gift) && (
            <section className="panel stack">
              <h2>{t("Les bonnes caractéristiques")}</h2>
              <p>{variantSummary(gift)}</p>
              <p>
                {t(
                  gift.variant_policy === "flexible"
                    ? "Une alternative est possible"
                    : "Respecter ces caractéristiques",
                )}
              </p>
            </section>
          )}
          {gift.time_hint && <p>{gift.time_hint}</p>}
          {!!gift.offers?.length && (
            <section className="panel stack">
              <h2>{t("Autres boutiques et seconde main")}</h2>
              <p>
                {t(
                  "Toutes ces offres correspondent à une seule envie. Les prix et stocks restent à vérifier chez le marchand.",
                )}
              </p>
              {gift.offers.map((o, i) => (
                <article className="stack" key={o.id}>
                  <h3>
                    {t("Offre {0}", i + 1)} · {t(offerConditions[o.condition])}
                  </h3>
                  <a href={o.url} target="_blank" rel="noopener noreferrer">
                    {new URL(o.url).hostname} ↗
                  </a>
                  <p>
                    {o.price === null
                      ? t("Prix non précisé")
                      : money(o.price, o.currency)}{" "}
                    ·{" "}
                    {o.shipping === null
                      ? t("Livraison non précisée")
                      : t("Livraison : {0}", money(o.shipping, o.currency))}
                  </p>
                  {o.checked_at && (
                    <p>
                      {t("Relevé du {0}", date(o.checked_at, true))} ·{" "}
                      {t(
                        o.availability === "available"
                          ? "Disponible lors du relevé"
                          : o.availability === "unavailable"
                            ? "Indisponible lors du relevé"
                            : "Non vérifiée",
                      )}
                    </p>
                  )}
                  {o.note && <p>{o.note}</p>}
                </article>
              ))}
            </section>
          )}
          {gift.quantity > 1 && hasBudget(gift) && (
            <p className="fine-print">
              {t(
                "Quantité : {0} × {1}",
                gift.quantity,
                money(gift.target / gift.quantity, gift.currency),
              )}
            </p>
          )}
          {gift.url && (
            <a
              className="text-link"
              href={gift.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Voir le produit chez le marchand ↗")}{" "}
            </a>
          )}
          {owner && !gift.surprise_hidden && (
            <GiftPurchaseToggle
              id={gift.id}
              title={gift.title}
              purchased={!!gift.purchased}
              details
              onSaved={onRefresh}
            />
          )}
          {hasBudget(gift) && (
            <div
              className="detail-progress"
              data-empty={!gift.funded && !gift.unknown_gross && !gift.promised}
            >
              <Progress gift={gift} />
            </div>
          )}
          {!!gift.purchased && (
            <p className="notice">
              {t("Ce cadeau a été acheté par le propriétaire.")}{" "}
            </p>
          )}
          {!!gift.closed && !gift.purchased && (
            <p className="notice">{t("Cette envie est en pause.")}</p>
          )}
          {gift.suggested_price != null && (
            <p className="fine-print">
              {t("Prix suggéré lors de l’extraction :")}{" "}
              {money(
                gift.suggested_price,
                gift.suggested_currency || gift.currency,
              )}{" "}
              ({gift.extracted_at ? date(gift.extracted_at, true) : "—"}
              {t("). Prix et disponibilité non garantis.")}{" "}
            </p>
          )}
          {profile.strict_contributions ? (
            <p className="notice">
              {t(
                "Seules les contributions validées par le propriétaire comptent dans l’objectif.",
              )}
            </p>
          ) : null}
          {gift.declared > 0 && (
            <p className="fine-print">
              {t(
                "Déclaré, en attente de validation : {0}",
                money(gift.declared, gift.currency),
              )}
            </p>
          )}
          {gift.surprise_hidden ? (
            <SurpriseNotice />
          ) : (
            <>
              {owner && manageReservations && (gift.reserved ?? 0) > 0 && (
                <Link
                  className="button secondary"
                  href={href(`/admin?tab=reservations&gift=${id}`)}
                >
                  {t("Gérer les réservations")}
                </Link>
              )}
              <ReservationForm
                giftId={id}
                kind={gift.kind}
                offers={gift.offers}
                available={Math.max(0, gift.quantity - (gift.reserved ?? 0))}
                closed={
                  reservationClosed ||
                  gift.funded > 0 ||
                  gift.declared > 0 ||
                  gift.promised > 0
                }
              />
              {hasBudget(gift) && (
                <ContributionForm
                  giftId={id}
                  currency={gift.currency}
                  remaining={Math.max(0, gift.target - gift.funded)}
                  closed={closed || (gift.reserved ?? 0) > 0}
                  paypalEnabled={!!profile.paypal_enabled}
                  strict={!!profile.strict_contributions}
                />
              )}
            </>
          )}
        </section>
        {hasBudget(gift) && (
          <section className="detail-explanation">
            <h2>{t("Votre geste, en toute clarté.")}</h2>
            <p>
              {t(
                "Vous pouvez utiliser PayPal, déclarer un virement déjà effectué ou promettre une participation pour plus tard. Une promesse ne compte pas comme de l’argent versé.",
              )}
            </p>
            <p>
              {t(
                "Votre contribution va directement à {0}, qui achètera ensuite le cadeau. Les sommes reçues restent chez le bénéficiaire même si l’objectif n’est pas atteint. Atteindre l’objectif ne déclenche aucun achat automatique.",
                profile.name,
              )}
            </p>
            <p>
              {profile.strict_contributions
                ? t(
                    "Seules les contributions validées par le propriétaire comptent dans l’objectif.",
                  )
                : t(
                    "Votre participation compte dès que vous indiquez l’avoir envoyée. Le total inclut les envois déclarés et s’ajuste ensuite aux frais et remboursements vérifiés par le propriétaire.",
                  )}{" "}
            </p>
          </section>
        )}
        {supporters.length > 0 && (
          <section className="supporters">
            <h2>{t("Des petites attentions ♡")}</h2>
            {supporters.map((s, i) => (
              <blockquote key={i}>
                <strong>
                  {String(s.nickname || t("Une personne attentionnée"))}
                </strong>
                {s.message ? <p>{String(s.message)}</p> : null}
                <small>
                  {s.provenance === "manual"
                    ? t("Confirmé par le propriétaire")
                    : t("Confirmé automatiquement par une source vérifiée")}
                </small>
              </blockquote>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
