import { PageHeader } from "../../components/page-header";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authorized } from "../../lib/auth";
import { database } from "../../lib/db";
import { webUrl } from "../../lib/validation";
import { QuickAdd } from "../../components/quick-add";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ouicheur",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const values = await searchParams;
  const title =
    typeof values.title === "string" ? values.title.slice(0, 160) : "";
  const candidate = (
    values.url ||
    values.text?.match(/https?:\/\/[^\s<>]+/)?.[0] ||
    ""
  ).slice(0, 2048);
  let url = "";
  try {
    url = webUrl(candidate).toString();
  } catch {}
  if (
    !authorized(database(), (await cookies()).get("wishlister_session")?.value)
  )
    redirect(
      `/admin?add=${encodeURIComponent(url)}&add_title=${encodeURIComponent(title)}`,
    );
  return (
    <>
      <PageHeader />
      <main id="main" className="container status-page">
        <QuickAdd url={url} title={title} />
      </main>
    </>
  );
}
