"use client";
import { PageHeader } from "../components/page-header";
import { useI18n } from "../components/language";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader />
      <main id="main" className="container status-page">
        <h1>{t("Cette envie est introuvable.")}</h1>
        <p>{t("Elle a peut-être été archivée.")}</p>
        <a className="button primary" href="/">
          {t("Retrouver la Ouichlist")}{" "}
        </a>
      </main>
    </>
  );
}
