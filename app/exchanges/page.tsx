import { cookies } from "next/headers";
import { sessionAccount } from "../../lib/auth";
import { database } from "../../lib/db";
import { getI18n } from "../../lib/i18n-server";
import { PageHeader } from "../../components/page-header";
import { GiftExchanges } from "../../components/exchanges";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  const a = sessionAccount(
      database(),
      (await cookies()).get("wishlister_session")?.value,
    ),
    { t } = await getI18n();
  return (
    <>
      <PageHeader back>
        <a href="/my-gifts">{t("Mon suivi cadeaux")}</a>
      </PageHeader>
      <main id="main" className="container status-page">
        <h1>{t("Échanges de cadeaux en famille")}</h1>
        {a ? (
          <GiftExchanges />
        ) : (
          <section className="panel stack">
            <p>
              {t(
                "Une invitation apparaît uniquement dans le compte du participant. Connectez-vous pour accepter et consulter votre destinataire.",
              )}
            </p>
            <a className="button primary" href="/admin?member=1">
              {t("Se connecter")}
            </a>
          </section>
        )}
      </main>
    </>
  );
}
