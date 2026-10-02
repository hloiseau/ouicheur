import { PageHeader } from "../../../components/page-header";
import { getI18n } from "../../../lib/i18n-server";
import { ContributionStatus } from "../../../components/contribution";
export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Votre contribution"),
    robots: { index: false, follow: false },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = await getI18n();
  const { id } = await params;
  return (
    <>
      <PageHeader back />
      <main id="main" className="status-page container">
        <ContributionStatus id={id} />
      </main>
    </>
  );
}
