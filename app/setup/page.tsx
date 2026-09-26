import { redirect } from "next/navigation";
import { Setup } from "../../components/setup";
import { database } from "../../lib/db";
import { getI18n } from "../../lib/i18n-server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Installer votre Ouichlist"),
    robots: { index: false, follow: false },
  };
}
export default function Page() {
  if (database().prepare("SELECT 1 FROM owner").get()) redirect("/admin");
  return <Setup />;
}
