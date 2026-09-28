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
import { JapanSearch } from "../../../components/japan-search";

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
  const gift = listGifts(db, access.owner, access).find((g) => g.id === id);
  const profile = publicProfile(db);
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
    gift.funded >= gift.target ||
    gift.currency !== profile.currency;
  const reservationClosed =
    !!gift.closed || !!gift.purchased || gift.visibility !== "visible";
  return (
    <>
      <header className="site-header">
        <div className="container public-subheader">
          <Link className="text-link" href={`/lists/${gift.list_id}`}>
            {t("← La Ouichlist de {0}", profile.name)}
          </Link>
        </div>
      </header>
      <main id="main" className="container detail-page">
        <div className="detail-art">
          <GiftArt gift={gift} />
        </div>
        <section className="detail-content">
          <span className="eyebrow">
            {gift.category || t("Une petite envie")}
          </span>
          <h1>{gift.title}</h1>
          <p className="detail-description">{gift.description}</p>
          {gift.quantity > 1 && (
            <p className="fine-print">
              {t(
                "Quantité : {0} × {1}",
                gift.quantity,
                money(gift.target / gift.quantity, gift.currency),
              )}
            </p>
          )}
          <a
            className="text-link"
            href={gift.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Voir le produit chez le marchand ↗")}{" "}
          </a>
          <JapanSearch
            japan_search={gift.japan_search}
            title={gift.title}
            url={gift.url}
            description={gift.description}
            target={gift.target}
            currency={gift.currency}
          />
          <div className="detail-progress">
            <Progress gift={gift} />
          </div>
          {!!gift.purchased && (
            <p className="notice">
              {t("Ce cadeau a été acheté par le propriétaire.")}{" "}
            </p>
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
          <ReservationForm
            giftId={id}
            available={Math.max(0, gift.quantity - gift.reserved)}
            closed={reservationClosed}
          />
          <ContributionForm
            giftId={id}
            currency={gift.currency}
            remaining={Math.max(0, gift.target - gift.funded)}
            closed={closed || gift.reserved > 0}
            enabled={!!profile.payments_enabled}
            strict={!!profile.strict_contributions}
          />
        </section>
        <section className="detail-explanation">
          <h2>{t("Votre geste, en toute clarté.")}</h2>
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
