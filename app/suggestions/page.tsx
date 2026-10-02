import { PageHeader } from "../../components/page-header";
import { SuggestionTracker } from "../../components/suggestions";
export const metadata = {
  title: "Ouicheur",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <>
      <PageHeader back />
      <main id="main" className="container status-page">
        <SuggestionTracker />
      </main>
    </>
  );
}
