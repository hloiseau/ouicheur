import { Brand } from "../../../components/ui";
import { ContributionStatus } from "../../../components/contribution";
export const metadata = {
  title: "Votre contribution",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <a href="/">La wishlist</a>
        </div>
      </header>
      <main id="main" className="status-page container">
        <ContributionStatus id={id} />
      </main>
    </>
  );
}
