import { cookies } from "next/headers";
import { sessionAccount } from "../../lib/auth";
import { database } from "../../lib/db";
import { getI18n } from "../../lib/i18n-server";
import { PageHeader } from "../../components/page-header";
import { PersonalGifts } from "../../components/personal-gifts";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  const account = sessionAccount(
      database(),
      (await cookies()).get("wishlister_session")?.value,
    ),
    { t } = await getI18n();
  return (
    <>
      <PageHeader back>
        {account && (
          <a href={account.role === "owner" ? "/admin" : "/organiser"}>
            {t("Mon espace")}
          </a>
        )}
      </PageHeader>
      <main id="main" className="container status-page">
        <h1>{t("Mes cadeaux à offrir et reçus")}</h1>
        {account ? (
          <PersonalGifts />
        ) : (
          <section className="panel stack">
            <p>
              {t(
                "Connectez-vous à votre compte invité ou propriétaire pour retrouver vos suivis. Sans compte, conservez les liens personnels de vos réservations.",
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
