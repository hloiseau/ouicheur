"use client";
import { useI18n } from "../components/language";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <main id="main" className="container status-page">
      <h1>{t("Un petit contretemps.")}</h1>
      <p>{t("La page n’a pas pu être chargée. Vous pouvez réessayer.")}</p>
      <button className="button primary" onClick={reset}>
        {t("Réessayer")}{" "}
      </button>
      <a href="/">{t("Retour à l’accueil")}</a>
    </main>
  );
}
