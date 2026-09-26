import { Admin } from "../../components/admin";
import { database } from "../../lib/db";
import { redirect } from "next/navigation";
import { getI18n } from "../../lib/i18n-server";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Espace propriétaire"),
    robots: { index: false, follow: false },
  };
}
export default function Page() {
  if (!database().prepare("SELECT 1 FROM owner").get()) redirect("/setup");
  return <Admin />;
}
