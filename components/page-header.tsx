"use client";
import type { ReactNode } from "react";
import { LanguageSwitcher, useI18n } from "./language";
import { Brand } from "./ui";
import { ThemeSwitcher } from "./theme";
export function PageHeader({
  back = false,
  backName,
  backHref = "/",
  children,
}: {
  back?: boolean;
  backName?: string;
  backHref?: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <header className="site-header">
      <div className="container header-inner">
        {back ? (
          <a className="text-link" href={backHref}>
            {backName
              ? t("← La Ouichlist de {0}", backName)
              : t("← Retour à la Ouichlist")}
          </a>
        ) : (
          <Brand />
        )}
        <div className="header-actions">
          {children}
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
