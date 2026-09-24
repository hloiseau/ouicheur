import { redirect } from "next/navigation";
import { Setup } from "../../components/setup";
import { database } from "../../lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Installer votre wishlist",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (database().prepare("SELECT 1 FROM owner").get()) redirect("/admin");
  return <Setup />;
}
