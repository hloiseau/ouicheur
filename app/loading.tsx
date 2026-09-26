"use client";
import { useI18n } from "../components/language";

export default function Loading() {
  const { t } = useI18n();
  return (
    <main id="main" className="container status-page" role="status">
      {t("Les envies se préparent…")}{" "}
    </main>
  );
}
