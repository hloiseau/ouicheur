import { PageHeader } from "../../components/page-header";
import { BrowserBookmark } from "../../components/browser-bookmark";
import { getI18n } from "../../lib/i18n-server";
export const dynamic = "force-dynamic";
export default async function HelpPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader />
      <main id="main" className="container status-page stack">
        <h1>{t("Bien commencer avec Ouicheur")}</h1>
        <section className="panel stack">
          <h2>{t("Offrir sans compte")}</h2>
          <ol>
            <li>
              {t(
                "Choisissez une envie et vérifiez sa variante, son budget et les offres proposées.",
              )}
            </li>
            <li>
              {t(
                "Réservez le cadeau pour éviter un doublon et conservez votre lien personnel.",
              )}
            </li>
            <li>
              {t(
                "Achetez ou préparez votre attention, puis confirmez avec ce lien. Annulez si vous changez d’avis.",
              )}
            </li>
          </ol>
          <p>
            {t(
              "Les paiements restent distincts : une déclaration d’envoi n’est pas une vérification du prestataire de paiement.",
            )}
          </p>
        </section>
        <BrowserBookmark />
        <a href="/">{t("Retour à la Ouichlist")}</a>
      </main>
    </>
  );
}
