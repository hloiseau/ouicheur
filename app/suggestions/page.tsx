import { SuggestionTracker } from "../../components/suggestions";
export const metadata = {
  title: "Ouicheur",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="container status-page">
      <SuggestionTracker />
    </main>
  );
}
