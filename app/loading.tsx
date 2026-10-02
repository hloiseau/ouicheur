"use client";
import { PageHeader } from "../components/page-header";
import { useI18n } from "../components/language";

export default function Loading() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader />
      <main id="main" className="container status-page" role="status">
        {t("Les envies se préparent…")}{" "}
      </main>
    </>
  );
}
