import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionAccount } from "../../lib/auth";
import { database } from "../../lib/db";
import { TeamWorkspace } from "../../components/team-workspace";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  const account = sessionAccount(
    database(),
    (await cookies()).get("wishlister_session")?.value,
  );
  if (!account) redirect("/admin?member=1");
  if (account.role === "owner") redirect("/admin?tab=family");
  return <TeamWorkspace />;
}
