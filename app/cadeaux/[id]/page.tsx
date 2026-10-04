import {
  hasBudget,
  variantSummary,
  wishKinds,
  offerConditions,
} from "../../../lib/wish-details";
import { listPriorities } from "../../../lib/priorities";
import { priorityLabel } from "../../../lib/priority-labels";
import { PageHeader } from "../../../components/page-header";
import { cookies } from "next/headers";
import { accessFromCookies } from "../../../lib/lists";
import { ReservationForm } from "../../../components/reservation";
import { getI18n } from "../../../lib/i18n-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "../../../lib/db";
import { listGifts, publicProfile } from "../../../lib/gifts";
import { GiftArt, Progress } from "../../../components/public-wishlist";
import { ContributionForm } from "../../../components/contribution";
import { SurpriseNotice } from "../../../components/surprise-notice";
import { GiftPurchaseToggle } from "../../../components/gift-purchase-toggle";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function GiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, money, date } = await getI18n();
  const { id } = await params;
  const db = database();
  const access = accessFromCookies(db, await cookies());
  const gift = listGifts(db, access.owner, access, { ids: [id] }).find(
    (g) => g.id === id,
  );
  const profile = publicProfile(db);
  const priority = listPriorities(db).find((p) => p.id === gift?.priority);
  if (!gift || !profile) notFound();
  const supporters = db
    .prepare(
      `SELECT CASE WHEN c.public_name=1 THEN c.nickname ELSE '' END nickname,
    CASE WHEN c.public_message=1 THEN c.message ELSE '' END message,COALESCE(p.provenance,'manual') provenance
    FROM contributions c LEFT JOIN payments p ON p.contribution_id=c.id WHERE c.gift_id=? AND (c.public_name=1 OR c.public_message=1)
    AND CASE WHEN p.id IS NULL THEN c.approved=1 ELSE COALESCE(p.net-p.net_reversed,p.gross-MAX(p.refunded,p.net_reversed))>0 END
    ORDER BY c.created_at DESC LIMIT 30`,
    )
    .all(id);
  const closed =
    !!gift.closed ||
    !!gift.purchased ||
    !hasBudget(gift) ||
    gift.funded >= gift.target ||
    gift.currency !== profile.currency;
  const reservationClosed =
    !!gift.closed || !!gift.purchased || gift.visibility !== "visible";
  return (
    <>
      <PageHeader
        back
        backName={profile.name}
        backHref={`/lists/${gift.list_id}`}
      />
      <main id="main" className="container detail-page">
        <div className="detail-art">
          <GiftArt gift={gift} />
        </div>
        <section className="detail-content">
          <span className="eyebrow">
            {gift.category || t("Une petite envie")}
          </span>
          <h1>{gift.title}</h1>
          {priority && (
            <p className="fine-print">
              {t("Priorité")} : {priorityLabel(priority, t)}
            </p>
          )}
          <p className="detail-description">{gift.description}</p>
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
          {access.owner && !gift.surprise_hidden && (
            <GiftPurchaseToggle
              id={gift.id}
              title={gift.title}
              purchased={!!gift.purchased}
              details
            />
          )}
          <div className="detail-progress">
            <Progress gift={gift} />
          </div>
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
              {access.owner && (gift.reserved ?? 0) > 0 && (
                <Link
                  className="button secondary"
                  href={`/admin?tab=reservations&gift=${id}`}
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
    </>
  );
}
