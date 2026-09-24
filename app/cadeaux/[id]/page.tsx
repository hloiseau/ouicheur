import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "../../../lib/db";
import { listGifts, publicProfile } from "../../../lib/gifts";
import { GiftArt, Progress } from "../../../components/public-wishlist";
import { ContributionForm } from "../../../components/contribution";
import { formatMoney } from "../../../lib/format";

export const dynamic = "force-dynamic";
export default async function GiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = database();
  const gift = listGifts(db).find((g) => g.id === id);
  const profile = publicProfile(db);
  if (!gift || !profile) notFound();
  const supporters = db
    .prepare(
      `SELECT CASE WHEN c.public_name=1 THEN c.nickname ELSE '' END nickname,
    CASE WHEN c.public_message=1 THEN c.message ELSE '' END message,p.provenance
    FROM contributions c JOIN payments p ON p.contribution_id=c.id WHERE c.gift_id=? AND (c.public_name=1 OR c.public_message=1)
    AND p.net IS NOT NULL AND p.net>p.net_reversed ORDER BY c.created_at DESC LIMIT 30`,
    )
    .all();
  const closed =
    !!gift.closed ||
    !!gift.purchased ||
    gift.confirmed >= gift.target ||
    gift.currency !== profile.currency;
  return (
    <>
      <header className="site-header">
        <div className="container public-subheader">
          <Link className="text-link" href="/">
            ← La wishlist de {profile.name}
          </Link>
        </div>
      </header>
      <main id="main" className="container detail-page">
        <div className="detail-art">
          <GiftArt gift={gift} />
        </div>
        <section className="detail-content">
          <span className="eyebrow">{gift.category || "Une petite envie"}</span>
          <h1>{gift.title}</h1>
          <p className="detail-description">{gift.description}</p>
          <a
            className="text-link"
            href={gift.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir le produit chez le marchand ↗
          </a>
          <div className="detail-progress">
            <Progress gift={gift} />
          </div>
          {!!gift.purchased && (
            <p className="notice">
              Ce cadeau a été acheté par le propriétaire.
            </p>
          )}
          {gift.suggested_price != null && (
            <p className="fine-print">
              Prix suggéré lors de l’extraction :{" "}
              {formatMoney(
                gift.suggested_price,
                gift.suggested_currency || gift.currency,
              )}{" "}
              ({gift.extracted_at?.slice(0, 10)}). Prix et disponibilité non
              garantis.
            </p>
          )}
          <ContributionForm
            giftId={id}
            currency={gift.currency}
            closed={closed}
            enabled={!!profile.payments_enabled}
          />
        </section>
        <section className="detail-explanation">
          <h2>Votre geste, en toute clarté.</h2>
          <p>
            Votre contribution va directement à {profile.name}, qui achètera
            ensuite le cadeau. Les sommes reçues restent chez le bénéficiaire
            même si l’objectif n’est pas atteint. Atteindre l’objectif ne
            déclenche aucun achat automatique.
          </p>
          <p>
            Le total net augmente après vérification manuelle du versement par
            le propriétaire. Un prix marchand peut évoluer sans modifier les
            contributions déjà reçues.
          </p>
        </section>
        {supporters.length > 0 && (
          <section className="supporters">
            <h2>Des petites attentions ♡</h2>
            {supporters.map((s, i) => (
              <blockquote key={i}>
                <strong>
                  {String(s.nickname || "Une personne attentionnée")}
                </strong>
                {s.message ? <p>{String(s.message)}</p> : null}
                <small>
                  {s.provenance === "manual"
                    ? "Confirmé par le propriétaire"
                    : "Confirmé automatiquement par une source vérifiée"}
                </small>
              </blockquote>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
