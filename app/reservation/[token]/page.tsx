import { PageHeader } from "../../../components/page-header";
import { ReservationStatus } from "../../../components/reservation";
export const metadata = {
  title: "Ouicheur",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <>
      <PageHeader back />
      <main id="main" className="container status-page">
        <ReservationStatus token={(await params).token} />
      </main>
    </>
  );
}
