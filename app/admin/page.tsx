import { Admin } from "../../components/admin";
import { database } from "../../lib/db";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Espace propriétaire",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (!database().prepare("SELECT 1 FROM owner").get()) redirect("/setup");
  return <Admin />;
}
