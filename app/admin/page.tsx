import { Admin } from "../../components/admin";
import { database } from "../../lib/db";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Espace propriétaire",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <Admin initialized={!!database().prepare("SELECT 1 FROM owner").get()} />
  );
}
