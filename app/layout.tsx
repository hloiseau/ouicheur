import { Pwa } from "../components/pwa";
import type { Metadata } from "next";
import { getI18n } from "../lib/i18n-server";
import { LanguageProvider } from "../components/language";
import { cookies } from "next/headers";
import { ThemeProvider } from "../components/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: {
      default: t("Ouicheur · Les petites envies"),
      template: "%s · Ouicheur",
    },
    description: t(
      "Une Ouichlist personnelle, des envies à partager et des cadeaux à financer ensemble.",
    ),
  };
}
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { t, locale } = await getI18n();
  const preference = (await cookies()).get("ouicheur_theme")?.value;
  const theme =
    preference === "light" || preference === "dark" ? preference : "system";
  return (
    <html lang={locale} data-theme={theme}>
      <body>
        <a className="skip-link" href="#main">
          {t("Aller au contenu")}
        </a>
        <LanguageProvider initialLocale={locale}>
          <ThemeProvider initialTheme={theme}>
            {children}
            <Pwa />
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
