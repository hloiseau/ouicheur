"use client";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  createI18n,
  localeCookie,
  resolveLocale,
  type Locale,
} from "../lib/i18n";

const LanguageContext = createContext<Locale>("en");
export const useI18n = () => createI18n(useContext(LanguageContext));

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { t } = createI18n(locale);
  return (
    <LanguageContext.Provider value={locale}>
      <div className="language-bar">
        <label>
          <span>{t("Langue")}</span>
          <select
            aria-label={t("Langue")}
            value={locale}
            disabled={pending}
            onChange={(event) => {
              const next = resolveLocale(event.target.value);
              document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
              document.documentElement.lang = next;
              setLocale(next);
              startTransition(() => router.refresh());
            }}
          >
            <option value="en" lang="en">
              English
            </option>
            <option value="fr" lang="fr">
              Français
            </option>
          </select>
        </label>
      </div>
      {children}
    </LanguageContext.Provider>
  );
}
